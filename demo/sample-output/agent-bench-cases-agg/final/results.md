# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| G1-route-totals | 2/2|6/6|9|$0.013|58 | —|—|—|—|— |
| G2-dangling-builders | 2/2|4/4|10|$0.022|58 | —|—|—|—|— |
| G3-pages-with-testids | 2/2|4/4|8.5|$0.015|45 | —|—|—|—|— |
| G4-http-callers | 2/2|16/16|4|$0.01|19 | —|—|—|—|— |
| G5-top-testid | 2/2|4/4|18.5|$0.027|79 | —|—|—|—|— |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 10/10 | 34/34 | 10 | 305k / 4732 | $0.086 | 52 |
| B | 0/0 | 0/0 | 0 | 0k / 0 | $0 | 0 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
