// Coding-agent backends for `kb compound --agent <name>` (prompt on stdin, cwd = staging wiki).
export const ClaudeAllowedTools = 'Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*),Bash(kb search:*)';

export function shellQuote(s: string): string {
  if (s === '') return "''";
  if (/^[A-Za-z0-9\-_./=:,@+%]+$/.test(s)) return s;
  return "'" + s.replaceAll("'", "'\\''") + "'";
}

export interface Adapter {
  name: string;
  display: string;
  argv?: (model: string) => string[];
  instructions: string;
  skillsDir: string;
}

export const registry: Record<string, Adapter> = {
  claude: {
    name: 'claude', display: 'Claude Code', instructions: 'CLAUDE.md', skillsDir: '.claude/skills',
    argv: (m) => ['claude', '-p', '--permission-mode', 'acceptEdits', '--allowedTools', ClaudeAllowedTools, '--output-format', 'json', ...(m ? ['--model', m] : [])],
  },
  codex: {
    name: 'codex', display: 'OpenAI Codex CLI', instructions: 'AGENTS.md', skillsDir: '.agents/skills',
    argv: (m) => ['codex', 'exec', '--sandbox', 'workspace-write', '-c', 'approval_policy="never"', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '--json', ...(m ? ['--model', m] : []), '-'],
  },
  gemini: {
    name: 'gemini', display: 'Gemini CLI', instructions: 'GEMINI.md', skillsDir: '.agents/skills',
    argv: (m) => ['gemini', '--skip-trust', '--approval-mode', 'auto_edit', '--output-format', 'json', ...(m ? ['--model', m] : []), '-p', 'Complete the codewiki task described above. Do not ask questions.'],
  },
  cursor: { name: 'cursor', display: 'Cursor', instructions: '.cursor/rules/codewiki.mdc', skillsDir: '' },
  copilot: { name: 'copilot', display: 'GitHub Copilot', instructions: '.github/copilot-instructions.md', skillsDir: '' },
  generic: { name: 'generic', display: 'any AGENTS.md-aware agent', instructions: 'AGENTS.md', skillsDir: '.agents/skills' },
};

export function agentCommand(name: string, model = ''): string {
  const a = registry[name];
  if (!a) throw new Error(`unknown agent ${JSON.stringify(name)} (known: ${Object.keys(registry).join(', ')})`);
  if (!a.argv) throw new Error(`agent ${JSON.stringify(name)} has no supported non-interactive backend mode; use --llm-cmd '<your command>' (prompt on stdin, cwd = staging wiki)`);
  return a.argv(model).map(shellQuote).join(' ');
}

/** Token / cost usage an agent CLI reports on stdout (best effort). */
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  cost_usd?: number;
  turns?: number;
  error?: string;
}

export function usageEmpty(u: Usage | undefined): boolean {
  return !u || !(u.input_tokens || u.output_tokens || u.cached_tokens || u.reasoning_tokens || u.cost_usd || u.turns);
}

export function usageAdd(u: Usage, v: Usage | undefined): void {
  if (!v) return;
  for (const k of ['input_tokens', 'output_tokens', 'cached_tokens', 'reasoning_tokens', 'cost_usd', 'turns'] as const) {
    const s = (u[k] ?? 0) + (v[k] ?? 0);
    if (s) u[k] = s;
  }
}

export function usageString(u: Usage | undefined): string {
  if (!u || usageEmpty(u)) return '';
  let s = `(in ${u.input_tokens ?? 0} / out ${u.output_tokens ?? 0} tok`;
  if (u.cached_tokens) s += `, cached ${u.cached_tokens}`;
  if (u.reasoning_tokens) s += `, reasoning ${u.reasoning_tokens}`;
  if (u.cost_usd) s += `, $${u.cost_usd.toFixed(4)}`;
  return s + ')';
}

type J = Record<string, unknown>;
const jsonLines = (out: string): J[] =>
  out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as J];
      } catch {
        return [];
      }
    });
const num = (m: J | undefined, k: string) => (m && typeof m[k] === 'number' ? (m[k] as number) : 0);
const sub = (m: J | undefined, k: string) => (m && m[k] && typeof m[k] === 'object' ? (m[k] as J) : undefined);
const clean = (u: Usage): Usage => Object.fromEntries(Object.entries(u).filter(([, v]) => v !== 0 && v !== '' && v !== undefined)) as Usage;

function parseClaude(out: string): Usage {
  let u: Usage = {};
  for (const m of jsonLines(out)) {
    if (m.type !== 'result' && m.total_cost_usd === undefined) continue;
    const us = sub(m, 'usage');
    u = { input_tokens: num(us, 'input_tokens'), output_tokens: num(us, 'output_tokens'), cached_tokens: num(us, 'cache_read_input_tokens') + num(us, 'cache_creation_input_tokens'), cost_usd: num(m, 'total_cost_usd'), turns: num(m, 'num_turns') };
    if (m.is_error === true) u.error = typeof m.result === 'string' && m.result ? m.result : String(m.subtype ?? '');
  }
  return clean(u);
}

function parseCodex(out: string): Usage {
  const u: Usage = {};
  for (const m of jsonLines(out)) {
    if (m.type === 'turn.completed') {
      const us = sub(m, 'usage');
      u.input_tokens = (u.input_tokens ?? 0) + num(us, 'input_tokens');
      u.cached_tokens = (u.cached_tokens ?? 0) + num(us, 'cached_input_tokens');
      u.output_tokens = (u.output_tokens ?? 0) + num(us, 'output_tokens');
      u.reasoning_tokens = (u.reasoning_tokens ?? 0) + num(us, 'reasoning_output_tokens');
      u.turns = (u.turns ?? 0) + 1;
    } else if (m.type === 'turn.failed') {
      const e = sub(m, 'error')?.message;
      if (typeof e === 'string' && e) u.error = e;
    } else if (m.type === 'error' && typeof m.message === 'string' && m.message) u.error = m.message;
  }
  return clean(u);
}

function parseGemini(out: string): Usage {
  const u: Usage = {};
  let doc: J | undefined;
  try {
    doc = JSON.parse(out.trim()) as J;
  } catch {
    const ls = jsonLines(out);
    doc = ls[ls.length - 1];
  }
  for (const mv of Object.values(sub(sub(doc, 'stats'), 'models') ?? {})) {
    const tk = sub(mv as J, 'tokens');
    u.input_tokens = (u.input_tokens ?? 0) + num(tk, 'prompt');
    u.output_tokens = (u.output_tokens ?? 0) + num(tk, 'candidates');
    u.cached_tokens = (u.cached_tokens ?? 0) + num(tk, 'cached');
    u.reasoning_tokens = (u.reasoning_tokens ?? 0) + num(tk, 'thoughts');
    u.turns = (u.turns ?? 0) + num(sub(mv as J, 'api'), 'totalRequests');
  }
  const e = sub(doc, 'error')?.message;
  if (typeof e === 'string' && e) u.error = e;
  return clean(u);
}

export const usageParsers: Record<string, (out: string) => Usage> = { claude: parseClaude, codex: parseCodex, gemini: parseGemini };
