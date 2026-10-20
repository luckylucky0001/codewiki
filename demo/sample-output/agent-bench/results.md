# Agent A/B benchmark (model: haiku)

A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep).

Repetitions per question and variant: 3. Pass = all checks hit (or at least `min`) and no `must_not` hit.

| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |
|---|---|---|---|---|---|---|---|---|---|---|
| q01-cart-limit | 3/3|9/9|5|$0.013|16 | 3/3|9/9|4.3|$0.01|14 |
| q02-checkout-api | 3/3|3/3|5.3|$0.013|14 | 3/3|3/3|5|$0.011|13 |
| q03-order-deeplink | 3/3|3/3|7.3|$0.016|19 | 3/3|3/3|9|$0.016|19 |
| q04-cart-testids | 3/3|3/3|6.7|$0.02|22 | 3/3|3/3|7.7|$0.015|21 |
| q05-outdated-docs | 3/3|18/18|25|$0.073|96 | 3/3|18/18|25.7|$0.074|104 |
| q06-login-files | 3/3|9/9|6.7|$0.026|27 | 3/3|9/9|13|$0.027|38 |
| q07-harmony-products | 3/3|6/6|5|$0.009|11 | 3/3|6/6|5.3|$0.01|12 |
| q08-profile | 3/3|12/12|5|$0.013|15 | 3/3|12/12|6|$0.016|19 |
| q09-test-params | 3/3|9/9|13|$0.034|41 | 3/3|9/9|12|$0.032|42 |
| q10-parity | 3/3|9/9|11.3|$0.031|43 | 3/3|9/9|39.3|$0.078|111 |

| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |
|---|---|---|---|---|---|---|
| A | 30/30 | 81/81 | 9 | 259k / 4541 | $0.249 | 30 |
| B | 30/30 | 81/81 | 12.7 | 274k / 6596 | $0.29 | 39 |

Raw transcripts: `transcripts/<A|B>-<question>.jsonl`. Checks: `bench/agent-qa/questions.json`.

Files in B that mention codewiki (source tree, not wiki): 2
