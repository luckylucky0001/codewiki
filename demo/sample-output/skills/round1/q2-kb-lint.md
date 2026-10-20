# q2-kb-lint

**Prompt:** 检查这个仓库的 wiki 是否与当前代码一致，并检查三端 testID 和功能是否对齐，给出问题清单与建议。只读，不要修改任何文件。

**Model:** `haiku` · cwd: demo repo with `.claude/skills` installed by `kb install-skills`

## Tool calls

- `Skill` kb-lint
- `Bash` kb verify --json; echo "EXIT=$?"; echo ---STATUS---; kb status; echo ---TID---; kb lint-tid; echo "EXIT=$?"; echo ---PARITY---; kb parity --json; echo "EXIT=$?"
- `Bash` kb verify --json
- `Bash` kb status
- `Bash` kb lint-tid
- `Bash` kb parity --json
- `Bash` ls; echo ---; cat pages/_conflicts.md 2>/dev/null || echo "NO _conflicts.md"; echo ---; grep -rn -i "max_cart\|maxCartItems\|MAX_CART_ITEMS\|最多\|50\b\|99\b" --i
- `Bash` grep -rn "MAX_CART_ITEMS\|maxCartItems\|max_cart_items" --include=*.kt --include=*.swift --include=*.ets --include=*.ts --include=*.json . | grep -v node_module
- `Bash` cat wiki/pages/_conflicts.md
- `Bash` grep -rn "MAX_CART_ITEMS\|maxCartItems" android ios harmony | grep -v -i "/build/\|node_modules" ; echo ---TID---; grep -rhoE "testID|testTag|accessibilityIdent
- `Bash` for t in nav_back cart_checkout checkout_submit login_username login_password login_submit order_status product_list profile_logout profile_name; do echo "== $t
- `Bash` grep -rnoE "[\"'](nav_back|cart_checkout|checkout_submit|login_username|login_password|login_submit|order_status|product_list|profile_logout|profile_name)[\"']"
- `Bash` diff -rq docs wiki/raw/docs/docs 2>&1 | head; diff -rq specs wiki/raw/docs/specs 2>&1 | head; echo "diff-done"; git status --short | head
- `Bash` grep -rniE "sms|验证码|dialog|alert" android ios harmony --include=*.kt --include=*.swift --include=*.ets | grep -v /build/ | head; echo ---; sed -n 20,30p wiki/ra
- `Grep` {"pattern":"sms|验证码|SMS","path":"<demo-repo>","-i":true,"output_mode":"conte
- `Read` {"file_path":"<demo-repo>/wiki/raw/docs/.kiro/specs/login/requirements.md","

## Answer

## 结论

- **`kb verify` 通过**：24 个页面、355 个锚点，无错误、无警告、无过期页面。wiki 的锚点与当前代码一致。
- **testID 三端对齐**：`kb lint-tid` 显示 10 个 testID × 3 端全部存在，0 个缺口。我用 grep 抽查了源码，结果一致。
- **功能路由三端对齐**：`kb parity` 中 7 个 feature 的路由、testID、接口在三端都存在，没有缺失。
- **真正的问题在两处**：购物车上限在三端不一致（唯一的 parity 缺口），以及部分"已验证"的断言其实与代码矛盾。

## 问题清单

**1. [高] 购物车上限三端不一致**（`kb parity` 的 `constant_diffs`，唯一的 gap）

| 端 | 常量 | 值 | 位置 |
|---|---|---|---|
| Android | `CartViewModel.MAX_CART_ITEMS` | 50 | `android/.../ui/cart/CartViewModel.kt:23` |
| iOS | `CartViewModel.maxCartItems` | 99 | `ios/.../Features/Cart/CartViewModel.swift:6` |
| HarmonyOS | `MAX_CART_ITEMS` | 50 | `harmony/.../common/CartStore.ets:4` |

- `specs/001-cart/plan.md` 写的是"三端共享上限常量"，但代码里三个值不同。
- `specs/001-cart/spec.md` FR-002 写的是 99，只与 iOS 一致。
- `docs/legacy/cart.md` 写的是 10，与三端都不一致。
- wiki 的 `parity.md`、`features/cart.md` 如实记录了这一现状，`_conflicts.md` 也标了 FR-002 为 conflict。

**建议**：由产品确定一个值，三端对齐。之后同步修改 spec 和 legacy 文档。

**2. [中] 旧文档与代码冲突，6 条未修正**（`wiki/pages/_conflicts.md`）

- `docs/legacy/cart.md`：上限写 10；下单接口写 `POST /api/order/create`，代码中不存在。
- `docs/legacy/login.md`：写的是短信验证码登录（`POST /api/sms/send`、`SessionManager.saveToken()`），代码中都不存在。
- `specs/001-cart/spec.md` FR-004：优惠券接口 `POST /api/coupons/apply` 代码中不存在。

**建议**：归档这些旧文档，或标注为 deprecated。`_conflicts.md` 的结论是正确的，只是源文档还没有修正。

**3. [中] 有一条"已验证"的断言实际与代码矛盾**（`wiki/pages/_conflicts.md` 中的 LOGIN-R2.2）

- 断言内容：`.kiro/specs/login/requirements.md` L26 写的是"点击 `login_submit` 且用户名为空时，显示短信验证码弹窗"。
- 核对结果：源码中没有任何 sms、验证码或弹窗逻辑，而且 `/api/sms/send` 本身也不存在。
- 问题原因：`verified` 只校验了 testID `login_submit` 存在，没有校验它的行为。

**建议**：把 LOGIN-R2.2 改为 conflict，或者标为 unverifiable，并在 `kb-ingest` 的判定中加入对行为语义的核对，不要只看符号和 testID 是否存在。

**4. [低] 核对粒度有限**

`verified` 只检查符号、路由、接口、testID 是否存在，不检查行为。例如 `001-CART-SPEC-4d53d3`（空购物车时禁用 `cart_checkout`）只验证了按钮存在，禁用逻辑没有被核对。建议对关键行为类断言补充人工或 LLM 语义核对。

**5. [信息] 其他检查结果**

- `wiki/raw/docs` 与源 `docs/`、`specs/` 内容一致，没有镜像漂移。
- `kb status` 显示所有页面 current，但 `_conflicts.md` 的 `source_commit` 是 `9c3c23e`，当前 HEAD 是 `73cfbf8`。页面按 hash 判定是最新的，commit 戳只是落后，可以在下次 `kb compound` 时刷新。
- `product_item_` 是动态前缀（`product_item_${id}`），lint-tid 已按前缀处理，不算问题。

## 本次做了什么

只运行了只读命令：`kb verify --json`、`kb status`、`kb lint-tid`、`kb parity --json`，以及 grep 和读取源码。没有运行 `kb verify --fix-index` 或 `kb compound`，没有修改任何文件。仓库 `git status` 是干净的。

_turns: 18, cost: $0.0168, duration: 53s_
