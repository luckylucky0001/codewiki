# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| E1-login-impl-deps | 2/2|10/10|6|$0.014|23 | 2/2|10/10|10|$0.021|32 |
| E2-qrcode-dependents | 2/2|4/4|5|$0.008|14 | 2/2|4/4|4.5|$0.007|11 |
| E3-call-impl-purpose | 2/2|6/6|4|$0.011|17 | 2/2|6/6|6|$0.013|20 |
| E4-most-deps-feature | 2/2|6/6|10|$0.017|32 | 2/2|5/6|14|$0.022|39 |
| E5-matrix-api-fanin | 2/2|2/2|4.5|$0.014|20 | 2/2|2/2|4.5|$0.015|20 |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 10/10 | 28/28 | 5.9 | 216k / 2709 | $0.064 | 21 |
| B | 10/10 | 27/28 | 7.8 | 281k / 3639 | $0.078 | 25 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
