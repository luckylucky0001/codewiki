# codewiki v2 设计（TypeScript）

> 依据：[deepwiki-structure.md](deepwiki-structure.md)（业界结构调研）、[sfk-compound-mapping.md](sfk-compound-mapping.md)（SFK 所有权/作用域映射）、v1 `DESIGN.md` / `README.md`。
> 读者：实现 agent。每节末尾的 **验收** 是完成标准。
> 不变的原则：**确定性交给 CLI，理解交给 LLM，一致性靠硬校验**。

## 0. 十条核心决策

1. **一个 CLI、一个 skill**：所有能力（层级树、docs 所有权工作流、ADR/技术债、链接检查、图）都是 `kb` 子命令；只有 `skills/codewiki/SKILL.md`，按需加载 `references/*.md`（渐进披露）。v1 的 4 个 skill 合并为其 references。
2. **五层树 L0–L4**：L0 仓库总览 → L1 平台/项目 → L2 构建模块（Gradle module / SwiftPM·Xcode target / HAP·HAR·HSP）→ L3 功能簇（符号图社区检测）→ L4 页内 section/符号表。L0–L2 **纯确定性**，L3 确定性聚类 + LLM 只命名/摘要。
3. **`module_tree.json` 是唯一结构真相**，只有 `kb tree` 能写；LLM 只能提交受校验的 `tree-patch`（rename/merge/split 建议）。
4. **自底向上写作**：L3 叶页读源码，L2/L1/L0 父页只读子页的 `summary` + facts，不读源码；父页因子摘要变化而失效（新失效边）。
5. **按 token 预算拆分**：模块上下文 > 32k token 才拆 L3；叶页正文 ≤ 1,500 词；L3 簇 3–40 个核心符号；树深 ≤ 5。
6. **图与导航由事实确定性生成**：mermaid（模块依赖、导航/路由、类关系）、每层 `index.md`、breadcrumb、`llms.txt` 都由 kb 渲染，LLM 不能写；verify 检查其新鲜度。
7. **增量修树用规则链**（CodeWiki）：rename 原地 → 删除 → same_file → same_dir → neighbor_majority → LLM routing；`tau_grow=0.33` 触发单簇重聚类，`tau_tree=0.3` 触发全树重聚类；簇 id 稳定（Jaccard 匹配继承）。
8. **两种输出**：`wiki/`（kb 全权拥有，锚点验证，给 agent）+ `docs/`、`<project>/docs/`（人机共有，SFK 所有权模型：文件状态机 + entry key + 人类块字节不变量）。
9. **作用域 = repository + project targets**；仓库级规则需根证据或 ≥2 个选中项目的匹配证据（复用 `kb parity`）；spec `**Status**:` 决定信任，Draft 只产生 `[Unconfirmed]` 需求条目；`specs/` 永不写。
10. **与 Go v1 行为兼容**：命令名、flag、退出码 0/1/2/3、`--json` 输出 schema、符号 id/hash 算法、facts 互通 schema 不变；用 Go 产出的 golden 文件做 parity 测试，hash 必须逐字节相同。

---

## 1. 输出布局

```
wiki/                                   # kb 全权拥有（v1 兼容路径保持可读）
  AGENTS.md  log.md  llms.txt  llms-full.txt
  index.md                              # L0 导航（kb 渲染）
  module_tree.json                      # 结构真相（kb tree 写）
  pages/
    overview.md                         # L0 仓库总览（LLM 综合 + 确定性图）
    <project>/index.md                  # L1 导航（渲染）
    <project>/overview.md               # L1 平台/项目总览
    <project>/<module>/index.md         # L2 导航
    <project>/<module>/overview.md      # L2 模块页
    <project>/<module>/<cluster>.md     # L3 功能簇页（叶）
    features/<route_id>.md              # 跨端功能视图（v1 保留；“域”轴，与树交叉链接）
    flows/ concepts/ decisions/         # v1 保留
    parity.md  _conflicts.md
  facts/ ...                            # v1 不变
  diagrams/<node-id>.mmd                # 确定性 mermaid 源（页面内嵌同内容）
  .kb/graph.json.gz state.json plan.json update_record.json run-state.json tree-history.json

docs/                                   # 仓库级（人机共有，SFK）
  architecture.md contracts.md constitution.md requirements.md tech-debt.md adr/NNNN-*.md
<project>/docs/                          # 项目级（人机共有，SFK）
```

页面 id 继续 = 路径去掉 `pages/` 与 `.md`（verify 强制）。v1 的 `features/<route>` 等路径不变，保证外部链接与 e2epilot 不坏。

## 2. 层级模型

### 2.1 层定义

| 层 | 节点 | 来源（确定性） | 页面 | 内容来源 |
|---|---|---|---|---|
| L0 | repo | 固定根 | `pages/overview.md` + `index.md` | 子页 summary、parity、project 依赖图 |
| L1 | project（平台内的工程） | §2.2 构建系统探测 + scope 配置 | `<p>/overview.md` + `<p>/index.md` | 子模块 summary、路由/深链 facts、模块依赖 mermaid |
| L2 | build module | Gradle `include(...)`、`Package.swift` targets、`.xcodeproj` targets、HarmonyOS `build-profile.json5 modules[]` + `module.json5 type`(entry/feature=HAP, har, shared=HSP) | `<p>/<m>/overview.md` + `index.md` | 子簇 summary、模块 API 表（public 符号签名）、模块内簇关系图 |
| L3 | feature cluster | 模块内符号引用图社区检测（§2.3） | `<p>/<m>/<c>.md`（叶） | 源码（受 6000 行 + 32k token 预算）、相关 routes/testIDs/APIs |
| L4 | section / symbol | 簇内核心符号 | L3 页内 `##` section + 符号表（锚点表） | 同 L3 |

规则：
- 模块小（上下文 ≤ 32k token 且核心符号 ≤ 40）→ **不建 L3**，L2 页即叶页（读源码）。
- 只有一个 project 的仓库 → L1 折叠进 L0（不生成空层）；只有一个模块的 project → L2 折叠进 L1。**null passthrough**：没有内容就没有页面。
- 层深上限 5；L3 内不递归（CodeWiki `MAX_DEPTH=2` 的经验：再深收益低、不稳定）。超大簇（> 40 核心符号且 > 32k token）允许**一次**二级拆分为 L3.1，页面路径 `<c>/<sub>.md`。
- 非代码节点：构建/配置文件（`build.gradle.kts`、`module.json5`、`Info.plist`）归入所属 L2 的 "build & config" section，不单独成簇（CodeWiki artifact 规则的变体）。

### 2.2 L1/L2 构建系统探测（`src/tree/build/`）

| 平台 | L1 project 标记 | L2 module 来源 | 依赖边 |
|---|---|---|---|
| Android/KMP | `settings.gradle(.kts)` | `include(":app", ":feature:cart")` → 路径 `feature/cart`（`:a:b` → `a/b`，支持 `project(":x").projectDir = file(...)`） | `implementation(project(":core:net"))`、`api(project(...))`、`projects.core.net`（type-safe accessors） |
| iOS SwiftPM | `Package.swift` | `.target(name:, path:)` / `.executableTarget` / `.testTarget`（默认路径 `Sources/<name>`） | `dependencies: ["Core", .product(name:, package:)]` |
| iOS Xcode | `*.xcodeproj/project.pbxproj` | `PBXNativeTarget` name + `fileSystemSynchronizedGroups`/group 路径 | `PBXTargetDependency`；Swift `import X` 映射到 target 名 |
| HarmonyOS | `build-profile.json5`（工程根） | `modules[]: {name, srcPath}`；`<srcPath>/src/main/module.json5` `module.type`：entry/feature→HAP、har→HAR、shared→HSP | `oh-package.json5 dependencies: {"@app/core": "file:../core"}` |
| Web/TS | `package.json`（workspaces） | workspace packages | `dependencies` 中 workspace 包 |

解析用 json5（自写最小解析器或 `json5` 包——**新依赖需讨论**，优先自写 50 行容错解析）+ 正则（Gradle DSL 不执行）。失败时回退 v1 启发式（`/src/` 前缀、前两级目录），并在 `kb tree --json` 的 `warnings[]` 报告。

### 2.3 L3 聚类算法（确定性）

输入：L2 模块内的符号子图（v1 `refs` 边 + 新增：import 边、继承/实现边、同文件边弱权重、路由边 `route → page symbol`）。

1. **核心符号选择**（CodeWiki leaf_selection 变体）：class/struct/interface/enum/object/@Component struct/Composable 顶层函数；OOP 稀少（<20 或 <20%）时顶层函数也算。成员合并到所属类型。
2. **加权无向图**：`w = 3·call + 2·inherit + 2·route + 1·import + 0.5·same_file`，同目录额外 +0.5（目录是弱先验）。
3. **Leiden**（自实现，或 Louvain + refinement；约 300 行 TS）：resolution γ=1.0，**固定随机种子 = sha256(moduleId)**，节点按 id 排序迭代 → 结果完全确定。
4. **后处理**：簇 < 3 个核心符号 → 并入连接权重最大的邻簇（平手按 id）；簇 > 40 且 token > 32k → 在簇内再跑一次（L3.1）；孤立符号 → `misc`（若 ≥3 个）或并入同目录最大簇。
5. **簇 id**：`c-` + sha1(排序后的核心符号 id 前 3 个 + 目录最长公共前缀) 前 8 位；重聚类后用 **Jaccard ≥ 0.5 匹配旧簇继承 id/名称/页面路径**（防止页面漂移）。
6. **命名**：确定性默认名 = 最长公共目录名或最高 PageRank 类型名（kebab）；LLM `tree-name` 任务可给出更好的 `title` 与 `slug`（只改 title/slug，不改成员）；slug 经校验（唯一、`[a-z0-9-]`、≤40）后写入 `module_tree.json`，并记入 `tree-history.json` 以便旧路径重定向。

**importance**（deepwiki-open 字段的确定性版本）：节点内符号 PageRank 之和归一化 → `high`（top 20%）/`medium`/`low`；用于 index 排序与 `--max-llm-tasks` 预算排序。

### 2.4 `module_tree.json` 格式

```json
{
  "version": 2,
  "generated_by": "kb 0.2.0",
  "head": "8c1d2e4",
  "algo": { "cluster": "leiden-v1", "gamma": 1.0, "weights": "3/2/2/1/0.5", "max_core": 40, "budget_tokens": 32000 },
  "root": {
    "id": "repo", "level": 0, "kind": "repo", "title": "MiniShop", "page": "pages/overview.md",
    "children": [
      { "id": "shop-android", "level": 1, "kind": "project", "platform": "android", "root": "apps/shop-android",
        "build": "gradle", "page": "pages/shop-android/overview.md",
        "children": [
          { "id": "shop-android/feature-cart", "level": 2, "kind": "module", "module_type": "android-library",
            "path": "feature/cart", "deps": ["shop-android/core-net"], "page": "pages/shop-android/feature-cart/overview.md",
            "tokens": 41230, "importance": "high",
            "children": [
              { "id": "shop-android/feature-cart/c-1f3a9b2e", "level": 3, "kind": "cluster",
                "slug": "cart-state", "title": "购物车状态与数量上限", "title_source": "llm",
                "page": "pages/shop-android/feature-cart/cart-state.md",
                "core": ["android://feature/cart/src/main/java/.../CartViewModel.kt#CartViewModel"],
                "members_hash": "9ac1…", "routes": ["cart"], "importance": "high",
                "related": ["shop-android/core-net/c-77aa0c12"] }
            ] } ] } ] }
}
```
- `core` 只存核心符号；成员由 graph 推导（`parent` 链）。`members_hash` = sha256(排序后的 core ids)，用于快速判断结构变化。
- `related` = 跨簇引用边权重 top-3（确定性）。
- JSON 序列化：键排序、2 空格缩进、末尾换行 → 可 diff、golden 测试稳定。

### 2.5 页面预算

| 页面 | 正文上限 | 必含 | 上下文给 LLM |
|---|---|---|---|
| L0 overview | 800 词 | 项目表、project 依赖 mermaid、跨端 parity 摘要、阅读路线 | 子页 summary（每个 ≤ 80 词） |
| L1 overview | 1,000 词 | 模块表（importance 排序）、模块依赖 mermaid、路由/深链摘要 | 子页 summary + facts 子集 |
| L2 overview | 1,200 词 | 簇表、模块公开 API 表（渲染）、簇关系 mermaid、build & config | 子簇 summary + 公开签名 |
| L3 叶 | 1,500 词 | 职责、关键流程（可选 sequenceDiagram，LLM 写但须只引用锚点中的符号名）、L4 符号表（渲染）、相关 routes/testIDs/APIs | 源码 ≤ 6000 行 / 32k token |
| 所有页 | frontmatter `summary`（≤ 80 词） | breadcrumb、Sources 区（渲染） | — |

超限：verify 给 warning（W_PAGE_BUDGET），不阻断；>2× 上限为 error。

### 2.6 Frontmatter v2（向后兼容扩展）

```yaml
---
id: shop-android/feature-cart/cart-state
title: 购物车状态与数量上限
kind: cluster            # v1: feature|flow|concept|decision|overview|conflicts；v2 新增 repo|project|module|cluster
level: 3
tree_node: shop-android/feature-cart/c-1f3a9b2e
parent: shop-android/feature-cart/overview
summary: CartViewModel 管理购物车条目与 MAX_CART_ITEMS=99 上限……
platforms: [android]
routes: [cart]
importance: high
sources:                 # 叶页：符号锚点（v1 语义）
  - sym: android://feature/cart/src/main/java/.../CartViewModel.kt#CartViewModel
    hash: 298d51bd…
children_digest: 5e0c…   # 父页：sha256(排序后的子页 id + summary_hash)；子摘要变化 → 父页 stale
source_commit: 8c1d2e4
status: current
---
```
v1 页面没有 `level/tree_node` 时视为 "域视图页"，照常验证。

## 3. 生成与增量

### 3.1 compound 流水线（v2）

```
kb compound
  scan → diff(symbol graph) → tree(repair|rebuild) → plan(pages: leaf→parent) → write(LLM/template, write-set guard)
       → render(index/breadcrumb/diagrams/llms.txt/L4 tables/Sources) → verify(staging) → publish(atomic)
  [--docs] → docs compound (SFK, §4) 在同一 run 的 publish 之后
```

### 3.2 树修复（`src/tree/repair.ts`）

输入：旧树、graph diff（unchanged/body/signature/added/deleted/renamed）、新图。
1. L1/L2 重新探测；新增模块 → 新节点（其下全量聚类）；删除模块 → 节点删除，页面移入 `tree-history.json` 的 tombstones（verify 不报孤儿，index 不显示）。
2. renamed 符号：在 `core` 中原地替换。
3. deleted：从 `core` 移除；簇空 → 删除；簇 < 3 → 标记合并。
4. added 核心符号路由：`same_file`（同文件已有核心符号所在簇）→ `same_dir`（目录下只有一个簇）→ `neighbor_majority`（引用/被引用邻居 >50% 在同一簇）→ `llm_route`（可选，`--llm` 非 template 时；否则 `misc`）。
5. 增长检测：`added_core / core_before > tau_grow(0.33)` → 该 L2 模块内重聚类，Jaccard 继承 id。
6. 全树阈值：`(created+deleted+reclustered 簇)/全部簇 > tau_tree(0.3)`，或 v1 的 `rebuild_module_ratio` / `rebuild_structural_ratio` 触发 → 全量重建树（仍用 Jaccard 继承 id/slug）。
7. 输出 `RepairResult {decisions[], reclustered[], created[], deleted[], renamedPages[]}` 写入 `plan.json.tree`。

### 3.3 失效传播（plan）

页面 stale 当且仅当：
- 叶页：v1 规则（自身锚点 hash 变化 ∪ signature 变化沿引用边 k 跳 ∪ 新路由）∪ 簇成员变化（`members_hash` 变）。
- 父页：`children_digest` 变化（子页 summary 变化或子节点增删）∪ 自身渲染 facts 变化。
- 写作顺序：拓扑序叶→根；同层并行（`--concurrency`，默认 4）。父页任务在其子任务完成后才生成上下文。
- **summary 稳定性**：LLM 重写叶页时若语义未变，可保留原 summary（prompt 中给出旧 summary，要求"仅在职责改变时修改"）→ 避免级联重写到 L0。`--max-llm-tasks` 预算排序：importance → 层（叶优先）→ 变化锚点数。

### 3.4 渲染器（确定性，`src/render/`）

- **index per level**：`index.md`（L0：项目表 + 域视图入口）、`pages/<p>/index.md`、`pages/<p>/<m>/index.md`；每行 `- [title](path) — summary 首句 · importance`。头部 `<!-- maintained by kb; do not edit by hand -->`。v1 `kb verify --fix-index` 继续可用。
- **breadcrumb**：页面正文第一行之后插入 `> [MiniShop](../../overview.md) › [shop-android](../overview.md) › [feature-cart](overview.md) › 购物车状态`，由 kb 在 `<!-- kb:breadcrumb -->…<!-- /kb:breadcrumb -->` 块内维护。
- **L4 符号表 / Sources 区**：`<!-- kb:symbols -->` 块渲染核心符号表（名称、kind、签名、`file:start-end` 链接）；`<!-- kb:sources -->` 块按锚点渲染 `Sources: [path:12-48](../../../../apps/...#L12-L48)`（DeepWiki 风格，但行号由 kb 从当前图生成，永不过期）。
- **mermaid**（`kb diagram`）：
  - L0：project 依赖（`flowchart LR`）。
  - L1：模块依赖（构建图）+ 导航图（facts 路由 / NavEdge）。
  - L2：簇间引用（边权阈值 top-N，节点 ≤ 15）+ 模块公开类型 `classDiagram`（≤ 12 类）。
  - 节点 id 用 `n` + sha1 前 6 位，label 转义；节点数超限按 importance 截断并注明 "… +N"。
  - 写入 `<!-- kb:diagram id=... hash=... -->` 块；verify 重新渲染比较 hash（新鲜度）。
- **llms.txt**（AnswerDotAI 规范）：`# <project>` + `> summary` + 每个 L1 一个 `## <project>` 段，列 L2/L3 页面链接与 summary；`llms-full.txt` 拼接 L0–L2 全文（不含 L3，控制体积）。

### 3.5 LLM 写作边界（write-set guard 扩展）

- 任务写集 = 恰好一个页面文件；kb 块（breadcrumb/symbols/sources/diagram）**由 kb 在写后覆盖**，LLM 对其的修改被丢弃（不报错）。
- 页面中出现的符号名必须存在（v1 `E_UNKNOWN_SYMBOL`）；mermaid 若由 LLM 写（仅 L3 sequenceDiagram），participant 必须是锚点符号或其所属类型名，否则 verify warning。
- `tree-patch`（LLM 可选输出）：`{op: "rename"|"merge"|"split", node, title?, slug?, into?, members?}`；kb 校验（merge 必须相邻且合并后 ≤ 40；split 的成员必须覆盖原簇）后在下一次 `kb tree` 应用，记录 `title_source: llm`。

### 3.6 用户覆盖（对标 `.devin/wiki.json`）

```yaml
tree:
  max_core_per_cluster: 40
  budget_tokens: 32000
  tau_grow: 0.33
  tau_tree: 0.3
  pins:                          # 强制把符号/路径归到某簇（规则链最高优先级）
    - { match: "apps/shop-android/feature/cart/**", cluster: cart-state }
  titles: { "shop-android/feature-cart/c-1f3a9b2e": "购物车" }   # 人工命名优先于 LLM
  notes:                         # 写作提示（≤ 100 条，每条 ≤ 2,000 字）
    - { node: "shop-android", note: "重点说明 KMP 共享层边界" }
```

## 4. docs 所有权与作用域（SFK）

完整设计见 [sfk-compound-mapping.md](sfk-compound-mapping.md)。实现要点：
- `src/scope/`：`RepositoryScope` / `ProjectTarget` / 发现算法（§1 of mapping）；`codewiki.yaml.scopes`。project 与 L1 树节点 **一一对应**（同一 id），所以 wiki 树与 docs 作用域共享一份发现结果。
- `src/docs/`：`ownership.ts`（文件状态机 disabled/new/managed/skeleton/adopted）、`markers.ts`（`**Source**:` 标签与 `compound:owned` 注释 key）、`merge.ts`（按 key 原地替换/插入；人类块字节不变量）、`route.ts`（repo vs project 证据规则：根证据或 ≥2 选中项目匹配，匹配由 parity key 判定）、`schema.ts`（维度 + null passthrough）、`specs.ts`（`**Status**:` 信任 + stale-spec）、`adr.ts` / `debt.ts`、`links.ts`。
- docs 条目由 wiki 派生：`architecture` 维度 ← L1/L2 树与依赖图；`api-contracts` ← apis facts + parity；`routes` ← facts；`requirements` ← ingest 结果（叠加 spec Status）；`constitution` ← 仅可信 spec / 根 AGENTS.md 中经 verified 的规则。这样 docs 中 `[Code Direct]` 条目自带锚点，`kb verify --docs` 可检查。
- 增量：每个 docs scope 的基准 = 其 managed 文件最早的 `compound_source_commit`（无则 `last_compound_scan` 日期）；非 git/浅克隆 → full。
- 写入守卫：repo 任务写集 `docs/**`；project 任务写集 `<root>/docs/**`；`specs/**` 永久拒绝；`docs/adr/` 只允许新建文件。
- 用户确认：kb 不交互。`kb docs compound` 默认写 owned 条目；ADR 与 tech-debt 默认 **dry-run 提案**，需 `--write-adr` / `--write-debt` 或单独 `kb docs adr --write`（CI 中通过 PR review 完成确认）。

## 5. TypeScript 架构

### 5.1 包与目录（与 worktree 现有 `src/` 对齐；单 npm 包 `codewiki`，bin `kb`）

```
src/
  cli/          # 参数解析（零依赖手写或 cac 等价物）、命令注册、退出码、--json 输出
    commands/   # 每个子命令一个文件：init scan diff plan compound verify status tree diagram docs links ...
  config/       # codewiki.yaml 读写、zero-config 探测（v1 兼容）+ scopes + tree
  scan/         # 文件发现、缓存、并行解析（worker_threads 池）
  extract/      # tree-sitter 查询：symbols / refs / imports / calls / comments(新) / fingerprint(hash, sig_hash, norm_hash, simhash)
  facts/        # routes / testids / apis / uikit / render（v1 端口）
  graph/        # Graph 模型、diff、impact 传播、PageRank
  tree/         # build/{gradle,swiftpm,xcode,hvigor,npm}.ts、cluster/leiden.ts、repair.ts、tree.ts(module_tree io)
  engine/       # plan、compound 编排、claims/valuecheck/ingest、parity、eval、safety（注入检测、数据包裹）、prompt
  render/       # index、breadcrumb、symbols 表、sources、mermaid、llms.txt
  wiki/         # page/frontmatter、layout、verify、原子发布
  scope/        # repository/project 发现与变更集
  docs/         # SFK：ownership markers merge route schema specs adr debt links
  agents/       # claude/codex/gemini/template 后端、write-set guard、run-state、continuation
  mcp/          # stdio JSON-RPC：kb_search kb_get kb_context kb_anchor kb_status kb_parity kb_conflicts + kb_tree(新)
  util/         # git、hash、json 稳定序列化、go 兼容（如 Go 的 sort/rune 语义）
grammars/       # *.wasm（构建产物，随包发布）
skills/codewiki/SKILL.md + references/{compound,ingest,query,lint,ownership,tree}.md
test/           # vitest；golden/ 来自 Go v1
```

### 5.2 tree-sitter

- 使用 **web-tree-sitter（WASM）**（worktree 已选 `web-tree-sitter@0.27.1`）：无原生编译、跨平台 `npm i -g` 即用，替代 v1 的 cgo 依赖。代价：比原生慢约 1.5–2×，用 `worker_threads` 池（`os.availableParallelism()-1`）+ v1 的文件 hash 缓存（`.kb/cache`）抵消。
- **ArkTS**：从 vendored `internal/grammars/arkts`（`grammar.js` + `src/parser.c` + `src/scanner.c`，MIT，见 `VENDORED.md`）构建 WASM：`tree-sitter build --wasm internal/grammars/arkts -o grammars/tree-sitter-arkts.wasm`（需要 emscripten 或 docker；脚本 `scripts/build-grammars.mjs`），并记录 `grammars/MANIFEST.json {name, source, grammar_sha256, abi, tree_sitter_cli_version}`。CI 校验 `grammar_sha256` 与 `internal/grammars/arkts/grammar_hash.go` 记录一致。其他语言 WASM 从固定版本 npm 包复制（版本锁定在 MANIFEST）。
- **ABI 一致性**：WASM ABI 必须与 web-tree-sitter 0.27 兼容（ABI 14/15）；`kb scan --self-check` 加载所有语法并解析内置样例。
- 查询文件（`.scm`）沿用 v1 `internal/grammars/arkts/queries` 与 Go 中的内联查询，移到 `src/extract/queries/*.scm`。
- 可选原生加速：不做（保持单一安装路径）。

### 5.3 命令集

**保持 v1（名称、flag、输出 schema、退出码 0 ok / 1 stale·verify 失败 / 2 usage / 3 internal 全部不变）**：
`init, scan, diff, plan, compound, verify [--fix-index], status, discover-docs, ingest, search, get, conflicts, context, anchor, lint-tid, parity, routes, install-skills, install, agents, bench, eval, hook, mcp`。全局：`--json --root --config --wiki-dir --quiet --dry-run`。

**新增（全部为 `kb` 子命令）**：

| 命令 | 作用 | 退出码 |
|---|---|---|
| `kb tree [--depth N] [--node id] [--rebuild] [--dry-run] [--json]` | 计算/修复 `module_tree.json`；无写参数时打印树（agent 第一入口，对标 DeepWiki `read_wiki_structure`） | 0/2/3 |
| `kb tree explain <symbol-id\|file>` | 该符号/文件属于哪个节点、哪条路由规则 | 0/2 |
| `kb diagram [<node-id>] [--kind deps\|nav\|clusters\|classes] [--write]` | 渲染 mermaid（stdout 或写入页面块） | 0/2 |
| `kb docs compound [<path>...] [--project id]... [--no-root-write] [--full] [--write-adr] [--write-debt] [--resume\|--restart] [--dry-run]` | SFK 工作流：作用域发现 → 维度 → 所有权合并写 docs/ 与 `<project>/docs/` | 0 / 1（有需人工复核或断链）/ 2 / 3 |
| `kb docs status [--json]` | 每个 docs 文件的状态（disabled/new/managed/skeleton/adopted）、scan 基准、stale 条目 | 0 / 1 |
| `kb docs stale-specs [--days 30]` | Draft 超期、Implemented 未 Verified、Implemented 与代码冲突 | 0 / 1 |
| `kb docs adr [--write]` | ADR 提案（默认 dry-run） | 0 |
| `kb docs debt [--write]` | 技术债登记提案 | 0 |
| `kb links [paths...] [--docs] [--wiki]` | 链接检查（markdown、反引号相对路径、`**Source**:` 路径、#anchor） | 0 / 1 |
| `kb verify --docs` | 额外校验 docs 中 owned 条目的锚点与 kb 块 | 0 / 1 |

`kb compound` 新 flag：`--docs`（publish 后执行 docs compound）、`--resume/--restart`、`--concurrency N`、`--no-tree-llm`（不调用 LLM 命名/路由）。

### 5.4 单一 skill

```
skills/codewiki/
  SKILL.md                 # < 200 行：前置条件（kb init）、问题→命令路由表、每类任务一句话 + "详见 references/x.md"
  references/
    query.md               # 先 kb tree / kb search / kb conflicts / kb routes …（v1 kb-query 内容）
    compound.md            # 合并后更新 wiki；单任务写作契约（frontmatter、写集、kb 块不可写、summary 稳定）
    ingest.md              # 旧文档/规格核对（v1 kb-ingest）
    lint.md                # verify / links / lint-tid / parity（v1 kb-lint）
    ownership.md           # SFK docs 工作流：作用域、标签、人类内容规则、ADR/debt 确认流程
    tree.md                # 层级含义、tree-patch 格式、命名规则
```
`description` 字段需覆盖 v1 4 个 skill 的触发词（"哪些文档过时"、"三端差异"、"merge 后更新" 等）。`kb install-skills` / `kb install` 改为安装此单一目录，并**清理** v1 遗留的 `kb-*` 目录（仅当其内容与 v1 发布版本 hash 相同，否则保留并警告）。

### 5.5 关键接口

```ts
interface TreeNode { id: string; level: 0|1|2|3|4; kind: 'repo'|'project'|'module'|'cluster';
  title: string; titleSource?: 'det'|'llm'|'user'; slug?: string; page: string; path?: string; root?: string;
  platform?: string; build?: string; moduleType?: string; deps?: string[]; core?: string[]; membersHash?: string;
  routes?: string[]; importance?: 'high'|'medium'|'low'; related?: string[]; tokens?: number; children?: TreeNode[]; }
interface ModuleTree { version: 2; generatedBy: string; head: string; algo: Record<string, unknown>; root: TreeNode; }
interface PageTask { id: string; op: 'create'|'update'|'delete'; kind: string; level: number; page: string;
  writeSet: string[]; reasons: Reason[]; context: string[]; childSummaries?: {id: string; summary: string}[];
  dependsOn: string[]; priority: number; }
interface Backend { name: 'template'|'claude'|'codex'|'gemini'|'cmd'; run(task: PageTask, prompt: string, workdir: string): Promise<BackendResult>; }
```

## 6. 测试策略

1. **Go parity（golden）**：在 Go v1 上对 `examples/minishop`、`demo` 仓库、以及 4 个真实仓库样本（axios、HarmonyOS Cases 子集、nowinandroid 子集、IceCubesApp 子集）运行 `kb scan --json --symbols`、`kb diff`、`kb plan --json`、`kb routes/lint-tid/parity --json`、`kb verify --json`、`kb ingest` verdicts，产物存 `test/golden/<repo>/<cmd>.json`（脚本 `scripts/gen-golden.sh`，只在有 Go 的机器上运行，产物入库）。TS 测试逐字段比较；**符号 id、hash、sig_hash、norm_hash、simhash 必须逐字节相同**（否则旧 wiki 全部 stale）。允许差异须在 `test/golden/ALLOWED_DIFFS.md` 逐条登记。
2. **单元测试**（vitest）：构建探测（Gradle/SwiftPM/pbxproj/hvigor 样例 fixture）、Leiden 确定性（同输入 100 次结果相同；节点输入顺序打乱结果相同）、修树规则链、Jaccard 继承、渲染器快照、frontmatter 往返。
3. **所有权不变量**（property-based，手写生成器）：随机人类块 + owned 块文件，执行 merge 任意次 → 人类块字节序列不变；merge 幂等（二次运行无 diff）；`adopted` 首轮只追加。
4. **端到端**：`test/e2e/minishop.test.ts` 在临时 git 仓库回放 v1 `kb eval` 的变更集，断言树修复决策、页面 stale 集合、verify 通过、`noop` 不改文件。
5. **CLI 契约**：每个命令的退出码与 `--json` schema（JSON Schema 文件放 `test/schemas/`），v1 与 v2 共用。
6. **WASM 语法自检**：CI 中加载所有 `.wasm`、校验 MANIFEST sha。

## 7. 准确性评估计划

| 维度 | 指标 | 数据集 / 方法 | 门槛 |
|---|---|---|---|
| 断言核对（v1 延续） | accuracy、conflict P/R、verified P/R | 开发集 33 条 + **盲测集 31 条**（`examples/minishop-eval/heldout`）；每次改规则必须同时跑两者 | 盲测不低于 v1 第 6 轮（template 0.81 / claude 0.74）；真实仓库误报 conflict = 0 |
| 树结构质量 | 与人工标注模块/功能分组的 ARI / NMI；簇纯度 | 人工标注 minishop + nowinandroid（Gradle 模块天然是 L2 真值，`feature/*` 内部功能人工标 L3） | L2 准确率 100%（确定性）；L3 NMI ≥ 0.6 |
| 树稳定性 | 无关变更下节点 id/页面路径保持率 | 回放 50 个真实提交（nowinandroid 历史） | 非结构性提交保持率 100%；结构性提交 ≥ 90% |
| plan 影响面 | 页面 stale precision/recall | v1 `kb eval` 变更集 + 父页（children_digest）扩展标注 | recall = 1.00，precision ≥ 0.8 |
| 页面忠实度 | 每页声明可被锚点支撑的比例（claim-level faithfulness） | 对生成页抽取断言 → 复用 ingest checker 反向核对自身 wiki（"self-ingest"），unsupported / conflict 计数 | conflict = 0；unsupported ≤ 10% |
| 引用正确性 | Sources 行号与符号当前位置一致 | 确定性渲染 → verify 检查 | 100% |
| agent 有用性 | 通过率、turns、成本 | `bench/agent-qa`（minishop 10 题 + Cases 汇总 5 题）+ 新增 5 道 "架构/模块边界" 题（考察层级导航，如"cart 模块依赖哪些模块"） | 通过率不低于 B 组；架构题 turns 比 v1 少 ≥ 20% |
| docs 所有权安全 | 人类内容被修改的次数 | property 测试 + 在 3 个真实仓库已有 docs/ 上运行 `kb docs compound` 并 diff 人类块 | 0 |
| 作用域路由 | repo/project 归属正确率 | 人工标注 40 条 entries（含单项目证据、≥2 项目匹配、根证据） | ≥ 0.95 |

评测命令：`kb eval --suite claims|tree|plan|faithfulness|docs [--golden f] [--llm …]`，输出 `--json` 并写 `bench/results/<date>.json`；README 只报告盲测/真实仓库结果，开发集结果标注"可能过拟合"。

## 8. 实施顺序

| 阶段 | 内容 | 完成标准 |
|---|---|---|
| M1 端口 | scan/extract/facts/graph/diff/plan/verify/compound(template)/命令全集；golden parity | golden 全通过（含 hash 逐字节）；v1 e2e 通过 |
| M2 树 | build 探测、Leiden、`module_tree.json`、`kb tree`、修树、L0–L3 页面、渲染器（index/breadcrumb/mermaid/llms.txt） | minishop 与 nowinandroid 生成 ≥3 层；verify 通过；稳定性回放达标 |
| M3 skill 合并 | `skills/codewiki` + references；install 迁移 | v1 agent-qa 不退化 |
| M4 docs/SFK | scope、ownership、merge、spec status、links、`kb docs *` | 所有权不变量 0 违例；真实仓库 dry-run 人工复核 |
| M5 ADR/debt/resume | `kb docs adr/debt`、run-state、continuation | 幂等测试通过 |
| M6 评测 | `kb eval --suite …` 全套 | §7 门槛 |
