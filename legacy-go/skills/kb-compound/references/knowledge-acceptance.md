# Business knowledge acceptance and repair

Use this after agent-authored pages are published. Structural `kb verify` success
only establishes its checked links and anchors, not correctness or usefulness.
This procedure works with sequential IDE sessions or optional isolated agents;
no particular model vendor or delegation API is required.

## Establish the target

Record the requested module/flow scope, source revision, planned page list and
acceptance threshold before grading. Honor the user's metrics. If none were
specified, propose a threshold appropriate to the intended use; do not silently
reduce scope or invent a passing threshold after seeing results.

Compare the plan with actual build modules and product entry points. For every
module, identify a page that explains its responsibility, collaborators and
important behavior. A module name appearing in a table is not coverage proof.
Audit old pages too: remove or replace outdated boilerplate through a reviewed
pipeline change, preserve useful source-backed content, and verify inbound links.
An empty route extractor result does not mean an application has no business flows.

For an obsolete page outside the current knowledge plan, use
`kb compound --retire-pages pages/concepts/old.md --retire-reason 'source-backed reason'`.
The CLI preserves the original and reason under `.kb/retired/<run>/`, removes it
only in staging, and refuses publication if remaining links break. Generated
overview/parity/conflict pages and current planned knowledge pages cannot be
retired this way. Correct the plan or repair references first where necessary;
do not remove a still-required module simply to make a quality gate pass.
Retirement records prevent empty legacy concepts from being recreated on the
next run. New symbol evidence or explicit agent planning can restore a page;
retirement is not permission to ignore future functionality.

## Separate evidence from answers

1. Create source-grounded questions and expected points using implementation and
   tests, without using the generated wiki. Cover happy paths, state changes,
   failure/recovery, cross-module boundaries and change impact. Record exact
   source evidence for each expected point and unresolved ambiguities. Keep some
   questions held out from repair feedback to check generalization.
2. Freeze a wiki snapshot and record file hashes. Give the answering session only
   that snapshot and questions, excluding expected answers, source and feedback.
   Require page citations and explicit unknowns. If the host cannot isolate
   context, use a separate fresh session or disclose that the check was not blind.
3. Grade each answer against each expected point, checking cited wiki passages.
   Record missing points, contradictions and unsupported claims separately.
   Verify that question IDs, point counts and aggregate arithmetic agree with
   the question set; missing answers count as failures, not exclusions.
4. Review disputed gold answers against source. For high-impact or surprising
   behavior, directly inspect the controlling branches instead of trusting the
   source auditor's prose. Keep corrections and their evidence in the report.

## Repair and retest

Distinguish a missing or wrong knowledge page from an answer that overlooked a
correct passage. Target page defects with `--knowledge-pages` and `--feedback`
through the same IDE bridge or selected backend used for writing. Feedback must
describe the failed business requirement and evidence, not demand a score.
Do not change gold answers merely to match the wiki, restamp stale anchors, or
use templates as substitutes for research.

After publication, repeat the independent question check against the new snapshot,
including held-out questions and regressions for previously passing behavior.
Preserve each round's inputs, answers, grades, feedback and source revision.
Confirm the final snapshot matches the accepted hashes and run `kb verify`.
Check a no-change run and representative anchored and scope-only source changes
in an isolated checkout; record which pages were invalidated and rewritten.

Report coverage, accuracy, unsupported claims, stale-data findings and remaining
unknowns separately. Runtime app tests, CLI tests, IDE protocol tests and actual
model execution in each supported IDE are different evidence. If a requested
gate is unmet, keep it open with its concrete failure; do not call the whole
knowledge base accepted because the page count or structural checks passed.
