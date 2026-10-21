# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| E1-login-impl-deps | 2/2|10/10|8|$0.016|33 | —|—|—|—|— |
| E2-qrcode-dependents | 2/2|4/4|4.5|$0.008|14 | —|—|—|—|— |
| E4-most-deps-feature | 2/2|6/6|9|$0.017|36 | —|—|—|—|— |
| E5-matrix-api-fanin | 2/2|2/2|4|$0.01|14 | —|—|—|—|— |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 8/8 | 22/22 | 6.4 | 249k / 2454 | $0.052 | 24 |
| B | 0/0 | 0/0 | 0 | 0k / 0 | $0 | 0 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
