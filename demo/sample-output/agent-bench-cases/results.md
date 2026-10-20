# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| L1-route-builder | 2/2|4/4|6|$0.007|14 | 2/2|4/4|3|$0.003|9 |
| L2-json-callers | 2/2|10/10|9|$0.012|22 | 2/2|10/10|6|$0.01|20 |
| L3-api-caller | 2/2|4/4|5|$0.005|12 | 2/2|4/4|6|$0.008|16 |
| L4-module-routes | 2/2|4/4|6.5|$0.01|18 | 2/2|4/4|10|$0.013|24 |
| L5-form-url | 2/2|2/2|3|$0.005|9 | 2/2|2/2|4.5|$0.006|11 |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 10/10 | 24/24 | 5.9 | 172k / 1691 | $0.039 | 15 |
| B | 10/10 | 24/24 | 5.9 | 177k / 1758 | $0.04 | 16 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
