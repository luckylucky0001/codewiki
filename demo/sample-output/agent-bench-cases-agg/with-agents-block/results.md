# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 2. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| G1-route-totals | 2/2|6/6|10.5|$0.016|27 | —|—|—|—|— |
| G2-dangling-builders | 2/2|4/4|18|$0.04|64 | —|—|—|—|— |
| G3-pages-with-testids | 2/2|4/4|21|$0.048|87 | —|—|—|—|— |
| G4-http-callers | 2/2|16/16|3|$0.009|16 | —|—|—|—|— |
| G5-top-testid | 2/2|4/4|16.5|$0.028|67 | —|—|—|—|— |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 10/10 | 34/34 | 13.8 | 479k / 8687 | $0.142 | 52 |
| B | 0/0 | 0/0 | 0 | 0k / 0 | $0 | 0 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 1
