// stdio MCP server (JSON-RPC 2.0, newline-delimited): read-only kb tools.
import readline from 'node:readline';

type Runner = (argv: string[], out: (s: string) => void) => Promise<number>;

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  args: (m: Record<string, unknown>) => string[];
}

const obj = (props: Record<string, unknown>, ...req: string[]) => ({ type: 'object', properties: props, required: req });
const str = (m: Record<string, unknown>, k: string): string => {
  const v = m[k];
  if (typeof v !== 'string' || !v) throw new Error(`missing string argument ${JSON.stringify(k)}`);
  return v;
};

export const mcpTools: Tool[] = [
  { name: 'kb_search', description: 'Search the code-anchored wiki (pages, facts, symbol names). Returns ranked results with page ids.', inputSchema: obj({ query: { type: 'string' }, limit: { type: 'integer' } }, 'query'),
    args: (m) => ['search', str(m, 'query'), ...(typeof m.limit === 'number' ? ['--limit', String(Math.trunc(m.limit))] : [])] },
  { name: 'kb_get', description: 'Get one wiki page (frontmatter with code anchors + markdown body) by id, e.g. features/cart.', inputSchema: obj({ page: { type: 'string' } }, 'page'), args: (m) => ['get', str(m, 'page')] },
  { name: 'kb_context', description: 'Pages, symbols, routes, testIDs, APIs and documented requirements (id/text/status/source) anchored in a source file. Call before editing or writing tests for the file.',
    inputSchema: obj({ file: { type: 'string', description: 'repo-relative path' } }, 'file'), args: (m) => ['context', str(m, 'file')] },
  { name: 'kb_anchor', description: 'Current content hash of symbols (ids like android://path/File.kt#Class.method).', inputSchema: obj({ symbols: { type: 'array', items: { type: 'string' } } }, 'symbols'),
    args: (m) => {
      const xs = Array.isArray(m.symbols) ? m.symbols : [];
      if (!xs.length) throw new Error('missing argument "symbols"');
      return ['anchor', ...xs.map(String)];
    } },
  { name: 'kb_status', description: 'Which wiki pages are stale relative to HEAD (anchors whose hash changed).', inputSchema: obj({}), args: () => ['status'] },
  { name: 'kb_parity', description: 'Feature × platform parity matrix (routes, testIDs, APIs, constants differing across Android/iOS/HarmonyOS).', inputSchema: obj({}), args: () => ['parity'] },
  { name: 'kb_conflicts', description: 'Which docs/specs are outdated: claims that contradict the code, with source:line, code evidence and a suggested fix (code wins).', inputSchema: obj({}), args: () => ['conflicts'] },
  { name: 'kb_routes', description: 'All routes grouped by module with counts, plus dangling router_map buildFunctions.', inputSchema: obj({}), args: () => ['routes'] },
];

export async function serveMCP(run: Runner, root: string, config: string, version: string): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (v: unknown) => process.stdout.write(JSON.stringify(v) + '\n');
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let req: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try {
      req = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      continue;
    }
    if (req.id === undefined || req.id === null) continue;
    const resp: Record<string, unknown> = { jsonrpc: '2.0', id: req.id };
    switch (req.method) {
      case 'initialize':
        resp.result = { protocolVersion: (req.params?.protocolVersion as string) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'codewiki', version } };
        break;
      case 'ping':
        resp.result = {};
        break;
      case 'tools/list':
        resp.result = { tools: mcpTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
        break;
      case 'tools/call': {
        const name = String(req.params?.name ?? '');
        const tool = mcpTools.find((t) => t.name === name);
        if (!tool) {
          resp.error = { code: -32602, message: 'unknown tool ' + name };
          break;
        }
        let args: string[];
        try {
          args = tool.args((req.params?.arguments as Record<string, unknown>) ?? {});
        } catch (e) {
          resp.result = { content: [{ type: 'text', text: (e as Error).message }], isError: true };
          break;
        }
        args.push('--json', '--quiet', '--root', root);
        if (config) args.push('--config', config);
        let buf = '';
        const code = await run(args, (s) => (buf += s));
        resp.result = { content: [{ type: 'text', text: buf }], isError: code >= 2 };
        break;
      }
      default:
        resp.error = { code: -32601, message: 'method not found: ' + req.method };
    }
    send(resp);
  }
  return 0;
}
