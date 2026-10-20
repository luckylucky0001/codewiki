# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| G1-route-totals | 2/2|6/6|14|$0.023|36 | 2/2|6/6|14|$0.019|31 |
| G2-dangling-builders | 2/2|4/4|19.5|$0.042|64 | 2/2|4/4|20|$0.039|71 |
| G3-pages-with-testids | 2/2|4/4|28|$0.038|64 | 2/2|4/4|20.5|$0.027|48 |
| G4-http-callers | 2/2|16/16|6.5|$0.012|21 | 2/2|16/16|4.5|$0.009|18 |
| G5-top-testid | 2/2|4/4|20|$0.034|71 | 1/2|2/4|11|$0.031|62 |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 10/10 | 34/34 | 17.6 | 519k / 8821 | $0.149 | 51 |
| B | 9/10 | 32/34 | 14 | 371k / 8350 | $0.126 | 46 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
