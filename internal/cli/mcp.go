package cli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
)

func init() {
	register(&command{name: "mcp", usage: "[--root repo]", summary: "stdio MCP server exposing search/get/context/anchor/status/parity as tools",
		help: `Speaks JSON-RPC 2.0 (MCP, newline-delimited) on stdin/stdout. Register in Claude Code:
  claude mcp add codewiki -- kb mcp --root /path/to/repo
Each tool runs the corresponding kb command with --json and returns its output.`,
		run: cmdMCP})
}

type rpcReq struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResp struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcErr         `json:"error,omitempty"`
}

type rpcErr struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	args        func(map[string]any) ([]string, error)
}

func strArg(m map[string]any, k string) (string, error) {
	v, ok := m[k].(string)
	if !ok || v == "" {
		return "", fmt.Errorf("missing string argument %q", k)
	}
	return v, nil
}

func obj(props map[string]any, req ...string) map[string]any {
	if req == nil {
		req = []string{}
	}
	return map[string]any{"type": "object", "properties": props, "required": req}
}

var mcpTools = []mcpTool{
	{Name: "kb_search", Description: "Search the code-anchored wiki (pages, facts, symbol names). Returns ranked results with page ids.",
		InputSchema: obj(map[string]any{"query": map[string]any{"type": "string"}, "limit": map[string]any{"type": "integer"}}, "query"),
		args: func(m map[string]any) ([]string, error) {
			q, err := strArg(m, "query")
			if err != nil {
				return nil, err
			}
			a := []string{"search", q}
			if l, ok := m["limit"].(float64); ok {
				a = append(a, "--limit", fmt.Sprint(int(l)))
			}
			return a, nil
		}},
	{Name: "kb_get", Description: "Get one wiki page (frontmatter with code anchors + markdown body) by id, e.g. features/cart.",
		InputSchema: obj(map[string]any{"page": map[string]any{"type": "string"}}, "page"),
		args: func(m map[string]any) ([]string, error) {
			p, err := strArg(m, "page")
			return []string{"get", p}, err
		}},
	{Name: "kb_context", Description: "Pages, symbols, routes, testIDs, APIs and documented requirements (id/text/status/source) anchored in a source file. Call before editing or writing tests for the file.",
		InputSchema: obj(map[string]any{"file": map[string]any{"type": "string", "description": "repo-relative path"}}, "file"),
		args: func(m map[string]any) ([]string, error) {
			f, err := strArg(m, "file")
			return []string{"context", f}, err
		}},
	{Name: "kb_anchor", Description: "Current content hash of symbols (ids like android://path/File.kt#Class.method).",
		InputSchema: obj(map[string]any{"symbols": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}}, "symbols"),
		args: func(m map[string]any) ([]string, error) {
			xs, _ := m["symbols"].([]any)
			if len(xs) == 0 {
				return nil, fmt.Errorf("missing argument \"symbols\"")
			}
			a := []string{"anchor"}
			for _, x := range xs {
				a = append(a, fmt.Sprint(x))
			}
			return a, nil
		}},
	{Name: "kb_status", Description: "Which wiki pages are stale relative to HEAD (anchors whose hash changed).",
		InputSchema: obj(map[string]any{}), args: func(map[string]any) ([]string, error) { return []string{"status"}, nil }},
	{Name: "kb_parity", Description: "Feature × platform parity matrix (routes, testIDs, APIs, constants differing across Android/iOS/HarmonyOS).",
		InputSchema: obj(map[string]any{}), args: func(map[string]any) ([]string, error) { return []string{"parity"}, nil }},
}

func cmdMCP(a *app, fs *flag.FlagSet, _ []string) int {
	return serveMCP(os.Stdin, a.stdout, a.root, a.config)
}

func serveMCP(in io.Reader, out io.Writer, root, cfg string) int {
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 1<<20), 16<<20)
	enc := json.NewEncoder(out)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		var req rpcReq
		if err := json.Unmarshal(line, &req); err != nil {
			_ = enc.Encode(rpcResp{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcErr{-32700, "parse error"}})
			continue
		}
		if len(req.ID) == 0 {
			continue // notification (e.g. notifications/initialized)
		}
		resp := rpcResp{JSONRPC: "2.0", ID: req.ID}
		switch req.Method {
		case "initialize":
			var p struct {
				ProtocolVersion string `json:"protocolVersion"`
			}
			_ = json.Unmarshal(req.Params, &p)
			if p.ProtocolVersion == "" {
				p.ProtocolVersion = "2025-06-18"
			}
			resp.Result = map[string]any{"protocolVersion": p.ProtocolVersion,
				"capabilities": map[string]any{"tools": map[string]any{}},
				"serverInfo":   map[string]any{"name": "codewiki", "version": Version}}
		case "ping":
			resp.Result = map[string]any{}
		case "tools/list":
			resp.Result = map[string]any{"tools": mcpTools}
		case "tools/call":
			var p struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			}
			if err := json.Unmarshal(req.Params, &p); err != nil {
				resp.Error = &rpcErr{-32602, "invalid params"}
				break
			}
			var tool *mcpTool
			for i := range mcpTools {
				if mcpTools[i].Name == p.Name {
					tool = &mcpTools[i]
				}
			}
			if tool == nil {
				resp.Error = &rpcErr{-32602, "unknown tool " + p.Name}
				break
			}
			args, err := tool.args(p.Arguments)
			if err != nil {
				resp.Result = map[string]any{"content": []map[string]any{{"type": "text", "text": err.Error()}}, "isError": true}
				break
			}
			args = append(args, "--json", "--quiet", "--root", root)
			if cfg != "" {
				args = append(args, "--config", cfg)
			}
			var buf bytes.Buffer
			code := Run(args, &buf, io.Discard)
			resp.Result = map[string]any{"content": []map[string]any{{"type": "text", "text": buf.String()}}, "isError": code >= ExitUsage}
		default:
			resp.Error = &rpcErr{-32601, "method not found: " + req.Method}
		}
		_ = enc.Encode(resp)
	}
	return ExitOK
}
