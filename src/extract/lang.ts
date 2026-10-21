// Per-language node tables and the WASM tree-sitter parser cache.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, Language } from 'web-tree-sitter';

export type NodeSet = Set<string>;
const mk = (...xs: string[]): NodeSet => new Set(xs);

/** How to read declarations out of one grammar. */
export interface LangSpec {
  name: string;
  wasm: string;
  comments: NodeSet;
  decls: Record<string, string>; // node kind -> symbol kind
  containers: NodeSet;
  transparent: NodeSet;
  bodies: NodeSet;
  idents: NodeSet;
  calls: NodeSet;
  strings: NodeSet;
}

const tsLike: Omit<LangSpec, 'name' | 'wasm'> = {
  comments: mk('comment', 'html_comment'),
  decls: {
    function_declaration: 'function', generator_function_declaration: 'function',
    class_declaration: 'class', abstract_class_declaration: 'class', struct_declaration: 'struct',
    interface_declaration: 'interface', enum_declaration: 'enum', type_alias_declaration: 'type',
    method_definition: 'method', public_field_definition: 'property', field_definition: 'property',
    variable_declarator: 'const',
  },
  containers: mk('class_declaration', 'abstract_class_declaration', 'struct_declaration'),
  transparent: mk('program', 'export_statement', 'class_body', 'struct_body', 'lexical_declaration', 'variable_declaration'),
  bodies: mk('statement_block', 'class_body', 'struct_body', 'interface_body', 'object_type', 'enum_body'),
  idents: mk('identifier', 'property_identifier', 'type_identifier', 'shorthand_property_identifier'),
  calls: mk('call_expression', 'arkui_component_expression', 'new_expression'),
  strings: mk('string', 'template_string'),
};

export const specs: Record<string, LangSpec> = {
  kotlin: {
    name: 'kotlin', wasm: 'tree-sitter-kotlin.wasm',
    comments: mk('line_comment', 'block_comment', 'comment', 'multiline_comment'),
    decls: {
      class_declaration: 'class', object_declaration: 'object', function_declaration: 'function',
      property_declaration: 'property', enum_entry: 'case', secondary_constructor: 'constructor',
    },
    containers: mk('class_declaration', 'object_declaration'),
    transparent: mk('source_file', 'class_body', 'enum_class_body', 'companion_object'),
    bodies: mk('class_body', 'enum_class_body', 'function_body'),
    idents: mk('identifier', 'simple_identifier', 'type_identifier'),
    calls: mk('call_expression', 'annotation'),
    strings: mk('string_literal', 'multiline_string_literal'),
  },
  java: {
    name: 'java', wasm: 'tree-sitter-java.wasm',
    comments: mk('line_comment', 'block_comment'),
    decls: {
      class_declaration: 'class', interface_declaration: 'interface', enum_declaration: 'enum',
      record_declaration: 'class', method_declaration: 'method', constructor_declaration: 'constructor',
      field_declaration: 'property', enum_constant: 'case',
    },
    containers: mk('class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration'),
    transparent: mk('program', 'class_body', 'interface_body', 'enum_body', 'enum_body_declarations'),
    bodies: mk('class_body', 'interface_body', 'enum_body', 'block', 'constructor_body'),
    idents: mk('identifier', 'type_identifier'),
    calls: mk('method_invocation', 'annotation', 'object_creation_expression'),
    strings: mk('string_literal'),
  },
  swift: {
    name: 'swift', wasm: 'tree-sitter-swift.wasm',
    comments: mk('comment', 'multiline_comment'),
    decls: {
      class_declaration: 'class', protocol_declaration: 'protocol', function_declaration: 'function',
      init_declaration: 'constructor', property_declaration: 'property', enum_entry: 'case',
      typealias_declaration: 'type',
    },
    containers: mk('class_declaration', 'protocol_declaration'),
    transparent: mk('source_file', 'class_body', 'enum_class_body', 'protocol_body'),
    bodies: mk('class_body', 'enum_class_body', 'protocol_body', 'function_body', 'computed_property'),
    idents: mk('simple_identifier', 'type_identifier'),
    calls: mk('call_expression'),
    strings: mk('line_string_literal', 'multi_line_string_literal'),
  },
  arkts: { ...tsLike, name: 'arkts', wasm: 'tree-sitter-arkts.wasm' },
  javascript: { ...tsLike, name: 'javascript', wasm: 'tree-sitter-javascript.wasm' },
  typescript: { ...tsLike, name: 'typescript', wasm: 'tree-sitter-typescript.wasm' },
  tsx: { ...tsLike, name: 'tsx', wasm: 'tree-sitter-tsx.wasm' },
};

/** Map a file extension to a supported language ("" if none). */
export function langForPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case '.kt':
    case '.kts':
      return p.endsWith('.gradle.kts') ? '' : 'kotlin';
    case '.java':
      return 'java';
    case '.swift':
      return 'swift';
    case '.ets':
      return 'arkts';
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.jsx':
      return 'javascript';
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
  }
  return '';
}

export function languages(): string[] {
  return ['kotlin', 'java', 'swift', 'arkts', 'javascript', 'typescript', 'tsx'];
}

/** Directory holding the prebuilt grammar .wasm files (repo root /grammars). */
export function grammarsDir(): string {
  if (process.env.KB_GRAMMARS_DIR) return process.env.KB_GRAMMARS_DIR;
  let d = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const c = path.join(d, 'grammars');
    if (fs.existsSync(path.join(c, 'tree-sitter-kotlin.wasm'))) return c;
    d = path.dirname(d);
  }
  throw new Error('grammars/ directory with tree-sitter wasm files not found');
}

let initDone: Promise<void> | null = null;
const languagesLoaded = new Map<string, Language>();

/** Load web-tree-sitter and every grammar once per process (worker). */
export function initParsers(): Promise<void> {
  if (!initDone) {
    initDone = (async () => {
      await Parser.init();
      const dir = grammarsDir();
      for (const [name, spec] of Object.entries(specs)) {
        languagesLoaded.set(name, await Language.load(fs.readFileSync(path.join(dir, spec.wasm))));
      }
    })();
  }
  return initDone;
}

export function languageInfo(lang: string): { abi: number; kinds: number } | undefined {
  const l = languagesLoaded.get(lang);
  return l ? { abi: l.abiVersion, kinds: l.nodeTypeCount } : undefined;
}

/** One parser per language; call initParsers() first. Not shared across workers. */
export class Parsers {
  private m = new Map<string, Parser>();
  get(lang: string): { parser: Parser; spec: LangSpec } {
    const spec = specs[lang];
    if (!spec) throw new Error('unsupported language: ' + lang);
    let p = this.m.get(lang);
    if (!p) {
      const l = languagesLoaded.get(lang);
      if (!l) throw new Error('grammar not loaded (initParsers not awaited): ' + lang);
      p = new Parser();
      p.setLanguage(l);
      this.m.set(lang, p);
    }
    return { parser: p, spec };
  }
  close(): void {
    for (const p of this.m.values()) p.delete();
    this.m.clear();
  }
}
