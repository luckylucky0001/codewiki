# q2-kb-lint

**Prompt:** 检查这个仓库的 wiki 是否与当前代码一致，并检查三端 testID 和功能是否对齐，给出问题清单与建议。只读，不要修改任何文件。

**Model:** `haiku` · cwd: demo repo with `.claude/skills` installed by `kb install-skills`

## Tool calls

- `Skill` kb-lint
- `Bash` kb verify --json; echo "EXIT=$?"; echo ---; kb lint-tid; echo "EXIT=$?"; echo ---; kb parity --json; echo "EXIT=$?"; echo ---; kb status; echo "EXIT=$?"
- `Bash` kb verify --json
- `Bash` kb lint-tid
- `Bash` kb parity --json
- `Bash` kb status
- `Bash` ls -la; ls -la pages 2>/dev/null | head -50; find . -path ./node_modules -prune -o -name "_conflicts.md" -print
- `Grep` {"pattern":"(?i)max_?cart|购物车上限|maxCart|MAX_CART|50|99","path":"<demo-repo>"
- `Read` {"file_path":"<demo-repo>/wiki/pages/_conflicts.md"}
- `Bash` grep -rnE "上限|maxCart|max_cart|MAX_CART|购物车.*(10|50|99)" wiki docs specs .kiro README.md --include=*.md --include=*.json --include=*.yaml | grep -v "hash:" | he
- `Bash` grep -rnE "MAX_CART_ITEMS|maxCartItems|max_cart_items" android ios harmony --include=*.kt --include=*.swift --include=*.ets --include=*.java --include=*.m
- `Bash` cd <demo-repo>/wiki && grep -rnE "sms|短信|order/create|coupons|SessionManager
- `Bash` cd <demo-repo>/wiki && grep -rnE "sms|短信|order/create|coupons|SessionManager
- `Read` {"file_path":"<demo-repo>/wiki/pages/features/cart.md"}
- `Bash` cd <demo-repo> && grep -n "cart_checkout" android/app/src/main/java/com/mini

## Answer

## 结论

wiki 的结构性检查全部通过，三端 testID 也全部对齐。但有一处真实的跨平台常量不一致，wiki 把它记录下来却没有标为问题。另外有几处文档和 wiki 内容已经与代码脱节。本次只读，没有修改任何文件。

## 检查结果

| 检查 | 结果 |
|---|---|
| `kb verify --json` | 通过：24 页、355 个锚点，0 errors、0 warnings，无过期页 |
| `kb status` | 所有页面 current（注意：只比对符号 hash，不检查行号） |
| `kb lint-tid` | 0 个缺口，13 个 testID × 3 端全部 ✓，无无 testID 的路由 |
| `kb parity --json` | 8 个功能路由在三端都有路由、testID、接口；1 处常量差异 |

## 问题清单

**1. 跨平台常量不一致（需要决策）**
- `max_cart_items`：Android = 50，Harmony = 50，iOS = 99。
- 代码位置：`android/.../CartViewModel.kt:23`、`harmony/.../CartStore.ets:4`、`ios/.../CartViewModel.swift:6`。
- 文档三个版本各说各的：`docs/legacy/cart.md` 写 10，`specs/001-cart/spec.md` FR-002 写 99，代码是 50/99。
- wiki 的 `pages/features/cart.md`、`features/product_detail.md`、`parity.md` 都列出了三个值，但没有标注为问题。`_conflicts.md` 只把文档记成冲突，没有提到平台之间的分歧。
- 建议：先由产品确定目标值，再对齐三端代码，然后修正 spec 和 legacy 文档。wiki 本身不应自行选值。

**2. `_conflicts.md` 里的文档冲突尚未处理（6 条）**
- `LOGIN-4dbfba`：文档写短信验证码登录，代码是密码登录（`POST /api/sms/send` 不存在）。
- `FR-004`：优惠券接口 `POST /api/coupons/apply` 不存在。
- `CART-7d3eb7`：下单接口文档写 `POST /api/order/create`，代码是 `POST /api/orders`。
- `LOGIN-e5f114`：`SessionManager` 不存在。
- `FR-002`：即上面第 1 条。
- `CART-43567f`：即上面第 1 条。
- 建议：`docs/legacy/*` 与 `specs/001-cart/spec.md` 中的未实现条目要么删除，要么标注为“未实现”，并决定是否要实现。目前 wiki 的功能页没有引用这些错误内容，这一点是对的。

**3. 部分 “verified” 断言证据偏弱**
- `LOGIN-R2.2`：文档说“空用户名点提交会弹短信验证框”，wiki 标为 verified，依据只是 testID `login_submit` 存在。这只能证明按钮存在，不能证明行为。
- `LOGIN-R2.1`（token 注入）只检查了 deeplink `minishop://login` 存在，没有检查 token 是否真的被写入。
- 建议：这类断言应降级为 unverifiable，或在证据里写清楚“只校验了存在性”。

**4. 页面里的行号已过期**
- `pages/features/cart.md:73` 写 iOS `cart_checkout` 在 `CartView.swift:11`，实际在第 13 行（第 11 行是 `CartView.swift` 内的其他代码）。Android 第 17 行、Harmony 第 18 行是正确的。
- `kb status` 只比对符号 hash，所以发现不了这种行号漂移。
- 建议：文档里的行号要么去掉，要么把 `kb lint-tid` 或类似脚本接入 CI 来校验。

**5. `product_item_` 是前缀，不是完整 testID**
- `lint-tid` 把它当作一个普通的 testID 比对，三端都显示 ✓。但它实际是动态前缀（如 `product_item_{id}`）。
- 建议：在 `testids.json` 或页面中明确标注为前缀类 testID，避免误解为固定值。

## 建议的后续动作（按优先级）
1. 确认购物车上限的目标值，并对齐三端代码（问题 1）。
2. 清理或标注 legacy 文档与 spec 中未实现的条目（问题 2）。
3. 把 `LOGIN-R2.1/R2.2` 等弱证据断言降级，并修正 `features/cart.md` 的行号（问题 3、4）。
4. 在 CI 中加入 `kb verify` 与 `kb lint-tid --strict`，并考虑对行号做校验（问题 4）。

_turns: 17, cost: $0.0156, duration: 43s_
