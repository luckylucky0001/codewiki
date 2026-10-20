#!/usr/bin/env python3
"""Scripted stand-in for the OpenAI Responses API (streaming SSE), used by
demo/codex-mock-demo.sh to run the REAL Codex CLI through `kb compound
--agent codex` without network access or an API key.

What is mocked: only the model. Each "model" turn is scripted:
  turn 1  -> a function_call to Codex's shell tool (exec_command, or shell on
             older CLIs) that writes every page of the task's write set
             (parsed from kb's prompt), writes verdicts.json for claim-check
             tasks, and ALSO writes pages/evil-codex.md, which is outside the
             write set so kb's guard has something to revert;
  turn 2  -> an assistant message "done" (after the tool output comes back).
Everything else is real: the codex binary, its config/provider handling,
sandbox, tool execution, --json event stream; kb's prompt, guard, post-
processing and verify.

usage: mock_openai_responses.py <port> <request-log.jsonl>
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT, LOG = int(sys.argv[1]), sys.argv[2]
WRITE_SET = re.compile(r"^- `([^`]+)`$", re.M)
CLAIM_ID = re.compile(r'"id":\s*"([^"]+)"')
COUNTER = [0]


def sh_quote(s):
    return "'" + s.replace("'", "'\\''") + "'"


def script_for(prompt):
    ws = prompt
    i = ws.find("## 可写集合")
    if i >= 0:
        ws = ws[i:]
        j = ws.find("## 规则")
        if j >= 0:
            ws = ws[:j]
    cmds = []
    for path in WRITE_SET.findall(ws):
        if path.startswith("pages/") and path.endswith(".md"):
            pid = path[len("pages/"):-len(".md")]
            body = ("---\nid: %s\ntitle: %s（codex mock）\nsources: []\n---\n"
                    "# %s\n\n本页由真实 codex CLI 在 mock 模型驱动下写入（kb compound --agent codex）。\n\n"
                    "%s") % (pid, pid, pid, "[总览](../overview.md)\n" if "/" in pid else "")
            cmds.append("printf '%%s' %s > %s" % (sh_quote(body), sh_quote(path)))
        elif path.endswith("verdicts.json"):
            claims = [{"id": c, "status": "unverifiable", "evidence": ["codex mock"]} for c in CLAIM_ID.findall(prompt)]
            cmds.append("mkdir -p .kb/ingest && printf '%%s' %s > %s" % (sh_quote(json.dumps({"version": 1, "claims": claims})), sh_quote(path)))
    cmds.append("echo outside-write-set > pages/evil-codex.md")
    return "; ".join(cmds)


def sse(ev):
    return ("event: %s\ndata: %s\n\n" % (ev["type"], json.dumps(ev, ensure_ascii=False))).encode()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"data":[],"models":[]}')

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        try:
            req = json.loads(body)
        except ValueError:
            req = {}
        texts, answered = [], False
        for it in req.get("input", []):
            if isinstance(it, dict):
                if it.get("type", "").endswith("_output"):
                    answered = True
                for c in it.get("content", []) or []:
                    if isinstance(c, dict) and isinstance(c.get("text"), str):
                        texts.append(c["text"])
        prompt = "\n".join(texts)
        tools = [t.get("name") or t.get("type") for t in req.get("tools", [])]
        COUNTER[0] += 1
        rid = "resp_%d" % COUNTER[0]
        if answered:
            item = {"type": "message", "role": "assistant", "id": "msg_%d" % COUNTER[0],
                    "content": [{"type": "output_text", "text": "done"}]}
        else:
            cmd = script_for(prompt)
            if "exec_command" in tools:
                item = {"type": "function_call", "name": "exec_command", "arguments": json.dumps({"cmd": cmd})}
            else:
                item = {"type": "function_call", "name": "shell", "arguments": json.dumps({"command": ["bash", "-lc", cmd]})}
            item.update({"id": "fc_%d" % COUNTER[0], "call_id": "call_%d" % COUNTER[0]})
        with open(LOG, "a") as f:
            f.write(json.dumps({"request": COUNTER[0], "model": req.get("model"), "tools": tools,
                                "kb_prompt": "codewiki 任务" in prompt, "answered": answered,
                                "reply": item.get("name") or "message"}, ensure_ascii=False) + "\n")
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        usage = {"input_tokens": 1000, "input_tokens_details": {"cached_tokens": 100},
                 "output_tokens": 20, "output_tokens_details": {"reasoning_tokens": 5}, "total_tokens": 1020}
        for ev in ({"type": "response.created", "response": {"id": rid}},
                   {"type": "response.output_item.done", "item": item},
                   {"type": "response.completed", "response": {"id": rid, "usage": usage}}):
            self.wfile.write(sse(ev))


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
