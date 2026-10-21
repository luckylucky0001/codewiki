# codewiki · ownership (`kb docs`, SFK model)

Two outputs: `wiki/` is owned by kb; `docs/` (repository) and `<project>/docs/` are **shared
with humans**. kb never changes, deletes or reorders a byte of human text. It only touches
entries it owns (`**Source**: \`path\` [Code Direct] [Verified]` entries, `compound:owned`
rows/blocks) and whatever it cannot decide becomes a review item, not a write.

## Commands

```bash
kb docs scope                     # repository + project targets (apps/*, android/ ios/ harmony/, config)
kb docs status                    # per file: new / managed / skeleton / adopted / frozen, extra registry
kb docs compound --dry-run        # what would be written
kb docs compound                  # derive entries (facts, module tree, specs) → verify sources → route → merge
kb docs compound --project shop-ios --no-root-write   # one project, repository docs read-only
kb docs compound --agent claude   # an agent adds prose entries (contract format), kb verifies them
kb docs compound --resume | --restart                  # unfinished runs at the same HEAD resume
kb docs stale-specs               # Draft too old, Implemented never Verified, Implemented but contradicted
kb docs adr [--write]             # ADR proposals from trusted specs the code verifies (new files only)
kb docs debt [--write]            # TODO/FIXME/HACK (≥4 words) → docs/tech-debt.md TD-NNN rows
kb links [paths…]                 # broken links / backticked paths / Source lines (report only)
kb verify --docs                  # owned entries whose Source vanished + broken links
```

Exit codes: `kb docs compound` 1 when a file needs review or a written file has broken links.

## Rules the CLI enforces

- **File states**: `new` (only verified entries; no entries → no file), `managed`
  (`last_compound_scan` frontmatter: replace by key, append), `skeleton` (headings + TODO/TBD
  placeholders: placeholders removed, entries inserted per section), `adopted` (any human text:
  append only), `disabled`/frozen (`enabled: false` in `.kb/docs-schema-extra.yaml`, or an
  unregistered custom doc): never read for merge, never written.
- **Routing**: root evidence or matching evidence from ≥2 selected projects → repository docs,
  each project gets one `xref:` row (no copied body); single-project evidence → that project's
  docs; different values across projects → repository entry flagged `parity_diff`.
- **Spec trust**: `**Status**:` Implemented / Verified / Archived are trusted; Draft (or no
  status) only feeds requirement-oriented dimensions as `[Unconfirmed]`, never constitution, ADR
  or debt. `specs/**` is never written.
- **Sources**: `[Code Direct]` with an existing path → `[Verified]`; missing → `[Pending]`
  (managed files only); `[AI Inferred]` needs code evidence or is dropped.
- **Agent contract**: `=== <docs file> [<dimension>] ===` groups of `### heading` + body +
  `**Source**:` line, last line `COMPOUND_META {"status":"done","remaining_scope":[]}`. Repo
  results only go to `docs/`, project results only to that project's docs; sources outside the
  repository allowlist are rejected.
- Knowledge layer (`docs/adr/**`, `docs/tech-debt.md`) has no frontmatter; existing ADRs are
  never edited; owned debt rows refresh only while their Status is `Open`.

State files: `.kb/docs-state.json` (per-scope scan base), `.kb/run-state.json` (resume),
`.kb/docs-schema-extra.yaml` (custom docs registry). See docs/ownership.md for the full model.
