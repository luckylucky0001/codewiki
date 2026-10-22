// Shared data types of codewiki: the symbol graph, the facts interchange
// schema and the plan format. JSON field names and order mirror the Go
// implementation (legacy-go/) byte for byte so e2epilot consumers are unaffected.

/** Bumped whenever hashing/normalization changes (forces a full rebuild). */
export const GraphVersion = 1;

export interface Symbol {
  id: string;
  platform: string;
  lang: string;
  kind: string;
  name: string;
  qual: string;
  parent?: string;
  file: string;
  start_line: number;
  end_line: number;
  signature: string;
  hash: string;
  sig_hash: string;
  norm_hash: string;
  simhash: string;
  value?: string;
  refs?: string[];
  /** unresolved identifier names (scan-time only, not serialized) */
  refNames?: string[];
  /** subset of refNames used as calls (scan-time only, not serialized) */
  callNames?: string[];
}

export interface FileInfo {
  platform: string;
  lang: string;
  hash: string;
  symbols: number;
  package?: string;
  imports?: string[];
}

export interface ParseFailure {
  file: string;
  line?: number;
  error: string;
}

export interface Graph {
  version: number;
  commit?: string;
  symbols: Symbol[];
  files: Record<string, FileInfo>;
  parse_failures: ParseFailure[];
}

export interface Route {
  platform: string;
  route_id: string;
  pattern: string;
  deeplink: string;
  file: string;
  symbol: string;
}

export interface TestID {
  platform: string;
  tid: string;
  route_id: string;
  file: string;
  line: number;
}

export interface API {
  platform: string;
  method: string;
  path: string;
  file: string;
  symbol: string;
}

export interface NavEdge {
  platform: string;
  from: string;
  to: string;
  kind: string;
  file: string;
  line: number;
}

export interface Entry {
  platform: string;
  kind: string;
  name: string;
  file: string;
}

export interface Facts {
  routes: Route[] | null;
  testids: TestID[] | null;
  apis: API[] | null;
  schemes?: Record<string, string[]>;
  entries?: Entry[];
  warnings?: string[];
  navigation?: NavEdge[];
}

export interface Anchor {
  sym: string;
  hash: string;
}

export interface Requirement {
  id: string;
  source: string;
  line?: number;
  text: string;
  status: string;
  anchors: Anchor[] | null;
  route_ids: string[] | null;
  evidence?: string[];
}

/** Symbol lookup index over a graph. */
export class GraphIndex {
  private byID = new Map<string, Symbol>();
  constructor(public g: Graph) {
    this.reindex();
  }
  reindex(): void {
    this.byID.clear();
    for (const s of this.g.symbols) this.byID.set(s.id, s);
  }
  get(id: string): Symbol | undefined {
    return this.byID.get(id);
  }
}

const graphIndexes = new WeakMap<Graph, GraphIndex>();
/** getSym mirrors Graph.Get in Go: a lazily built id index. */
export function getSym(g: Graph | undefined | null, id: string): Symbol | undefined {
  if (!g) return undefined;
  let ix = graphIndexes.get(g);
  if (!ix) {
    ix = new GraphIndex(g);
    graphIndexes.set(g, ix);
  }
  return ix.get(id);
}
export function reindexGraph(g: Graph): void {
  graphIndexes.set(g, new GraphIndex(g));
}

/** Serializable view of a symbol (drops scan-time fields, omits empty optionals like Go's omitempty). */
export function symbolJSON(s: Symbol): Record<string, unknown> {
  const o: Record<string, unknown> = {
    id: s.id, platform: s.platform, lang: s.lang, kind: s.kind, name: s.name, qual: s.qual,
  };
  if (s.parent) o.parent = s.parent;
  o.file = s.file;
  o.start_line = s.start_line;
  o.end_line = s.end_line;
  o.signature = s.signature;
  o.hash = s.hash;
  o.sig_hash = s.sig_hash;
  o.norm_hash = s.norm_hash;
  o.simhash = s.simhash;
  if (s.value) o.value = s.value;
  if (s.refs && s.refs.length) o.refs = s.refs;
  return o;
}

export function fileInfoJSON(f: FileInfo): Record<string, unknown> {
  const o: Record<string, unknown> = { platform: f.platform, lang: f.lang, hash: f.hash, symbols: f.symbols };
  if (f.package) o.package = f.package;
  if (f.imports && f.imports.length) o.imports = f.imports;
  return o;
}

export function graphJSON(g: Graph): Record<string, unknown> {
  const o: Record<string, unknown> = { version: g.version };
  if (g.commit) o.commit = g.commit;
  o.symbols = g.symbols.map(symbolJSON);
  const files: Record<string, unknown> = {};
  for (const k of Object.keys(g.files).sort()) files[k] = fileInfoJSON(g.files[k]!);
  o.files = files;
  o.parse_failures = g.parse_failures.map(parseFailureJSON);
  return o;
}

export function parseFailureJSON(p: ParseFailure): Record<string, unknown> {
  const o: Record<string, unknown> = { file: p.file };
  if (p.line) o.line = p.line;
  o.error = p.error;
  return o;
}
