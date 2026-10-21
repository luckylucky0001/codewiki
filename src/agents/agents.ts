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
