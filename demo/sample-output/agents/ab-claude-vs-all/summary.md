# kb install --agent claude vs --agent all (model: haiku, repeat: 3)

| variant | q | first action | kb calls | other tool calls | reads of agent files (AGENTS/GEMINI/.cursor/.github/.agents/.codex/.gemini) | turns | cost |
|---|---|---|---|---|---|---|---|
| all | q1 | `Bash: kb search 购物车 2>&1 | head -50; echo "---"; kb sear` | 3 | 1 | 0 | 6 | $0.0072 |
| all | q1 | `Bash: kb search 购物车 2>&1 | head -50; echo ---; kb search` | 3 | 2 | 0 | 6 | $0.0052 |
| all | q1 | `Bash: kb search 购物车 2>&1 | head -50; echo ---; kb search` | 3 | 0 | 0 | 4 | $0.0040 |
| all | q2 | `Bash: kb routes && echo "-----" && kb lint-tid --pages` | 2 | 0 | 0 | 3 | $0.0041 |
| all | q2 | `Bash: kb routes; echo "-----"; kb lint-tid --pages` | 1 | 0 | 0 | 2 | $0.0017 |
| all | q2 | `Bash: kb routes && echo "-----" && kb lint-tid --pages` | 1 | 0 | 0 | 2 | $0.0016 |
| all | q3 | `Glob: **/CartViewModel.kt` | 2 | 5 | 0 | 8 | $0.0087 |
| all | q3 | `Glob: **/CartViewModel.kt` | 3 | 4 | 0 | 8 | $0.0066 |
| all | q3 | `Glob: **/CartViewModel.kt` | 4 | 3 | 0 | 9 | $0.0091 |
| claude | q1 | `Bash: kb search 购物车 2>&1 | head -50; echo ---; kb search` | 4 | 1 | 0 | 6 | $0.0073 |
| claude | q1 | `Bash: kb search 购物车 2>&1 | head -60; echo ---; kb search` | 3 | 0 | 0 | 5 | $0.0048 |
| claude | q1 | `Bash: (kb search 购物车 2>&1; echo '---'; kb search cart 2>` | 3 | 1 | 0 | 6 | $0.0041 |
| claude | q2 | `Bash: kb routes && echo "-----" && kb lint-tid --pages` | 2 | 0 | 0 | 3 | $0.0045 |
| claude | q2 | `Bash: kb routes && echo ---- && kb lint-tid --pages` | 1 | 0 | 0 | 2 | $0.0016 |
| claude | q2 | `Bash: kb routes 2>&1 | head -200; echo "-----"; kb lint-` | 2 | 0 | 0 | 3 | $0.0024 |
| claude | q3 | `Glob: **/CartViewModel.kt` | 3 | 3 | 0 | 7 | $0.0094 |
| claude | q3 | `Glob: **/CartViewModel.kt` | 4 | 4 | 0 | 10 | $0.0082 |
| claude | q3 | `Bash: find . -name CartViewModel.kt -not -path '*/build/` | 2 | 0 | 0 | 5 | $0.0069 |
