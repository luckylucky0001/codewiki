# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| G1-route-totals | 2/2|6/6|4|$0.01|46 | —|—|—|—|— |
| G5-top-testid | 2/2|4/4|7|$0.016|68 | —|—|—|—|— |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 4/4 | 10/10 | 5.5 | 188k / 3188 | $0.025 | 57 |
| B | 0/0 | 0/0 | 0 | 0k / 0 | $0 | 0 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
