# Document discovery conventions

| Convention | Paths | kind |
|---|---|---|
| GitHub spec-kit | `specs/<feature>/spec.md`, `plan.md`, `tasks.md`; `.specify/memory/*` | spec / design / tasks / agent-guide |
| OpenSpec | `openspec/specs/**/spec.md`, `openspec/changes/**/{proposal,design,tasks}.md` | spec / design / tasks |
| Kiro | `.kiro/specs/<feature>/{requirements,design,tasks}.md`, `.kiro/steering/*.md` | spec / design / tasks / agent-guide |
| ADR | `docs/adr/`, `doc/adr/`, `doc/architecture/decisions/`, `docs/decisions/` | adr |
| RFC | `rfcs/`, `docs/rfcs/` | design |
| Agent guides | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` | agent-guide |
| Security | `THREATMODEL.md`, `SECURITY.md` | design |
| Other | `README.md` (any dir), `docs/**/*.md`, `CONTRIBUTING.md` | readme / doc |

Claim extraction: spec-kit `**FR-001**:` bullets; Kiro `### Requirement N` + numbered EARS
acceptance criteria (`WHEN … THEN the system SHALL …`); any EARS / MUST / SHALL sentence;
bullets that mention code (backticks, `/api/...` paths, `scheme://` deep links).

Deterministic checks (template mode): API method+path vs `facts/apis.json`, deep links vs
`routes.json`, testIDs, route ids/patterns, symbol names (and numeric constant values),
code literals searched in symbol bodies.
