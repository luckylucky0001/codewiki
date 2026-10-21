# SFK SDD Compound → codewiki 映射与 TS 设计

> 输入：用户提供的 "SFK SDD Compound" skill 全文（权威参考）。输出：每一项能力在 codewiki 中**已有什么 / 差距 / TS 具体设计**。
> 约束（用户追加）：只有一个 CLI `kb`、只有一个 skill `skills/codewiki/SKILL.md`。下文所有新能力都是 `kb` 子命令或 `kb compound` 的阶段，流程说明放在 `skills/codewiki/references/ownership.md`。

## 0. 核心定位差异

| | SFK Compound | codewiki（Go v1） |
|---|---|---|
| 输出位置 | **写进仓库本身**：`docs/`（仓库级）+ `<project>/docs/`（项目级） | 独立 `wiki/` 目录（可放仓库外 `--wiki-dir`） |
| 内容所有权 | 人与 Compound 共写同一文件，按条目所有权合并 | wiki 全部由 kb 拥有；旧文档只读进 `raw/docs/` |
| 可信基础 | spec `**Status**:` + `**Source**:` 证据标签 | 符号 id + hash 锚点 + `kb verify` 门禁 |
| 增量 | `last_compound_scan` 日期 + git log/diff | `last_sha` + 符号图 diff + 引用边传播 |
| 维度 | schema.yaml 驱动的维度（architecture / api / data-model …） | 固定页面种类（feature/flow/concept/decision） |

v2 结论：**两种输出共存**。
- `wiki/`（kb 全权拥有，锚点验证，多层树）= "编译产物"，给 agent 查询。
- `docs/` + `<project>/docs/`（人机共有，按 SFK 所有权模型合并）= "源知识"，新增 `kb docs` 子命令族维护。`docs` 中由 kb 拥有的条目同样带锚点（`<!-- compound:owned key=... anchors=... -->`），所以能被 `kb verify` 检查。

---

## 1. 作用域模型：repository_scope vs project_targets

**已有**：`codewiki.yaml.platforms[]`（`name/root/include`）——按平台划分，不是按项目；单仓多项目（如 `apps/shop-android`、`apps/shop-ios`、`packages/core-kmp`）只能塞进平台。

**差距**：没有"仓库级知识"与"项目级知识"的分离；没有项目发现优先级；没有"只更新本项目、不写根 docs"开关。

**TS 设计**：

```ts
// src/scope/types.ts
export type ScanMode = 'full' | 'incremental';
export interface RepositoryScope {
  id: 'repo'; root: '.';
  specsRoots: string[];      // 默认 ['specs']
  docsRoot: string;          // 默认 'docs'
  docsReadEnabled: boolean;  // 默认 true
  writeEnabled: boolean;     // 默认 true，即使只选了一个子项目
  scanMode: ScanMode;
}
export interface ProjectTarget {
  id: string;                // 稳定 id：相对路径 slug，如 'apps-shop-android'
  root: string;              // 'apps/shop-android'
  platform?: 'android'|'ios'|'harmony'|'web'|'kmp';
  buildSystem?: 'gradle'|'swiftpm'|'xcode'|'hvigor'|'npm'|'go'|'cargo'|'maven'|'python';
  specsRoots: string[];      // ['specs', '<root>/specs']：根 specs 永远是输入
  docsRoot: string;          // '<root>/docs'
  scanMode: ScanMode;
}
export interface ScopePlan { repository: RepositoryScope; projects: ProjectTarget[]; singleRoot: boolean; }
```

**项目发现**（`src/scope/discover.ts`，确定性，可单测）：
1. 显式路径（CLI 位置参数 / `--project`）优先；若路径是容器目录（`apps/ services/ packages/ libs/ modules/`）则展开为直接子目录。
2. 否则对每个路径取最近的含构建标记的祖先：`package.json go.mod pom.xml build.gradle(.kts) settings.gradle(.kts) pyproject.toml Cargo.toml Package.swift *.xcodeproj build-profile.json5 oh-package.json5 src/`。**移动端补充**：`Package.swift`、`*.xcodeproj/*.xcworkspace`、`build-profile.json5`（HarmonyOS 工程根）。
3. 无显式路径：git 根下容器目录的直接子目录；再加 v1 `kb init` 平台探测结果（android/ ios/ harmony/）。
4. 都没有 → 单根仓库：`singleRoot=true`，**只有 repository scope，不重复建 project**。
5. 忽略：隐藏目录、symlink、`build/ node_modules/ Pods/ oh_modules/ .gradle/ DerivedData/ dist/` 及 `exclude`。
6. `id` = 根路径 slug；冲突时追加 `-2`；写入 `codewiki.yaml` 后固定（稳定性）。

**配置与 CLI**：
```yaml
# codewiki.yaml（新增，kb init 自动写出）
scopes:
  repository: { specs_roots: [specs], docs_root: docs, write: true }
  projects:
    - { id: shop-android, root: apps/shop-android, platform: android }
    - { id: shop-ios, root: apps/shop-ios, platform: ios }
```
- `kb docs compound [<path>...] [--project id ...] [--no-root-write]`：`--no-root-write` ⇔ "only this project / don't update root docs" → `writeEnabled=false`，`docsReadEnabled` 仍为 true（根 docs 仍作为交叉引用目标与输入）。
- 未选中的子项目：不扫描、不写；但其已有 docs 可被只读用于"≥2 项目证据"判定吗？**不**——SFK 规定证据只来自 selected projects。

**与 v1 platforms 的关系**：`platforms[]` 继续决定符号 id scheme（`android://`）；`projects[]` 是对平台根下目录的再划分（一个 platform 可含多个 project，一个 project 属于一个 platform）。符号 id 不变 → 锚点向后兼容。

## 2. 仓库级知识归属与证据规则

SFK：跨项目需求、共享契约、工作区架构 → 根 docs；**代码推导出的仓库级规则需要根拥有的证据，或 ≥2 个选中项目的匹配证据**；单项目证据留在项目 docs；项目 docs 交叉引用根 docs，不复制。

**已有**：`kb parity` 已计算跨平台一致性（同名常量多端取值、路由/接口/testID 齐全度）——天然就是"≥2 项目匹配证据"的判定器；`concepts/shared-components.md` 用"被 ≥3 路由使用"规则。

**差距**：没有 entry 级别的"归属层级"决策。

**TS 设计**：`src/docs/route.ts`
```ts
interface Evidence { scope: 'repo' | string /*projectId*/; kind: 'code'|'spec'|'doc'; anchor?: Anchor; path: string; line?: number; }
interface Entry { dimension: string; heading: string; body: string; source: SourceTag; evidence: Evidence[]; key: string; }
function routeEntry(e: Entry, sel: ScopePlan): 'repo' | string | null {
  const projs = new Set(e.evidence.filter(x => x.scope !== 'repo').map(x => x.scope));
  const hasRoot = e.evidence.some(x => x.scope === 'repo');      // 根 specs、根构建文件、共享包（packages/shared 被 ≥2 项目依赖时视为 root-owned）
  if (hasRoot || projs.size >= 2) return sel.repository.writeEnabled ? 'repo' : null; // null = 不写 + 报告 "需要根 docs 写权限"
  if (projs.size === 1) return [...projs][0];
  return null;
}
```
- "匹配证据"判定：同一 `parity` key（route_id / 常量名 / API method+path / 共享 schema 名）在 ≥2 个选中项目中出现且值一致（值不一致 → 不是仓库规则，而是 `parity` 差异，写进根 docs 的"跨端差异"维度并标 `[Code Direct]`）。
- 双层同时出现：根为 canonical，项目 docs 写一行交叉引用 `参见 [共享登录契约](../../docs/contracts.md#login)`，**不复制正文**（由 `kb docs` 生成，所有权 key `xref:<root-key>`）。

## 3. 维度：schema 驱动 + null passthrough

SFK：`schema.yaml` 维度 `{output_path（相对 owner root）, probe_paths}`；已有输出文件激活维度；用户可强制；自定义 .md 注册到 `compound-schema-extra.yaml`；无内容时不写空骨架。

**已有**：页面种类写死在 `wiki/layout.go sectionOrder`；facts 渲染器按平台固定。

**TS 设计**：内置 schema + 仓库扩展。
```yaml
# 内置 src/docs/schema.default.yaml（可被 .codewiki/schema.yaml 覆盖，compound-schema-extra.yaml 兼容读取）
version: 1
dimensions:
  - id: architecture        # 模块结构、依赖方向（来自 module_tree + 构建图）
    output_path: architecture.md
    scopes: [repo, project]
    probe_paths: ["settings.gradle*", "Package.swift", "build-profile.json5"]
    requirement_oriented: false
  - id: routes              # 页面/路由/深链（facts）
    output_path: navigation.md
    scopes: [project]
    probe_paths: ["**/router_map.json", "**/AndroidManifest.xml", "**/Info.plist"]
  - id: api-contracts
    output_path: contracts.md
    scopes: [repo, project]
  - id: requirements        # 需求/业务规则（允许 [Unconfirmed]）
    output_path: requirements.md
    scopes: [repo, project]
    requirement_oriented: true
  - id: constitution        # 仓库规则（AGENTS.md 式约束），只能来自可信证据
    output_path: constitution.md
    scopes: [repo, project]
    entry_style: owned-block
  - id: testing             # testID / 测试约定
    output_path: testing.md
    scopes: [project]
```
- **激活**（每 scope）：`force` 列表 ∪ 已存在 `output_path` ∪ probe 命中 ∪ 本次产生了 ≥1 条 entry。
- **null passthrough**：维度结果为 `null`/空数组 → 不创建文件、不写标题、不写 TODO；已存在文件不动。实现：`writer.apply()` 在 entries 为空时直接 `return 'skipped:null'`。
- **自定义 .md 注册**：`kb docs adopt <file> --dimension <id>` 或首轮自动把 docs_root 下无法匹配维度的人类 .md 记入 `.codewiki/schema-extra.yaml`（只读引用，不写入）。

## 4. 文件所有权状态机

SFK：`disabled / new / managed / skeleton / adopted`。

**已有**：v1 只处理 kb 自有页面（frontmatter `generated`、`status`）；`kb install-skills` 有 `<!-- codewiki:begin -->…<!-- codewiki:end -->` 块合并（块外原样保留）——这是 owned-block 的雏形。

**TS 设计**：`src/docs/ownership.ts`
```ts
export type FileState = 'disabled' | 'new' | 'managed' | 'skeleton' | 'adopted';
export function classify(path: string, text: string | null, dimEnabled: boolean): FileState {
  if (!dimEnabled) return 'disabled';
  if (text === null) return 'new';
  const fm = parseFrontmatter(text);
  if (fm?.last_compound_scan && isValidDate(fm.last_compound_scan)) return 'managed';
  if (isSkeleton(stripFrontmatter(text))) return 'skeleton';
  return 'adopted';
}
const PLACEHOLDER = /^(TODO|TBD|待补充|\[DESCRIPTION\]|\{CONTENT\}|<!--.*-->|#+\s.*|[-*]\s*)$/i;
function isSkeleton(body: string) { return body.split('\n').map(s => s.trim()).filter(Boolean).every(l => PLACEHOLDER.test(l)); }
```
写入决策（每个目标文件一次，单一决策）：

| 状态 | 动作 |
|---|---|
| disabled | 不写 |
| new | 用 schema 模板（仅标题 + entries）创建；写 frontmatter；`[Pending]` 条目不插入 |
| skeleton | 替换占位行；保留人类标题顺序；写 frontmatter |
| managed | 按 entry key 合并（§5）；刷新 frontmatter |
| adopted | **首轮非破坏合并**：只追加 kb entries 到匹配标题下（无匹配标题 → 文件末尾新增 `## <dimension heading>`），不改任何既有行；`[Pending]` 不插入；成功后写 frontmatter → 之后变 managed |

frontmatter（kb 拥有的两个键，其余键原样保留）：
```yaml
---
last_compound_scan: 2026-10-21      # 写入成功后才刷新
compound_scan_mode: incremental     # full | incremental
compound_source_commit: 8c1d2e4     # codewiki 扩展：精确到 commit，增量更精确
---
```

## 5. 条目所有权 key 与 markers

**SFK 标记 → codewiki 解析器**（`src/docs/markers.ts`，全部用 remark/mdast 解析 + 行级正则，保持原文字节不变的"补丁式"写回）：

| 条目 | 标记 | key |
|---|---|---|
| 通用条目 | 以 `**Source**: <path>[#sym] [Code Direct]` 行结尾 | [Code Direct]: `(normalize(source_file), heading)`；[AI Inferred]: `(dimension, heading)` |
| constitution | `<!-- compound:owned:start key="rule:<slug>" -->…Evidence: …<!-- compound:owned:end -->` | key 属性 |
| index 行 | 行尾 `<!-- compound:owned key="index:<path>" -->` | key |
| ADR | 首行 `<!-- compound:proposed key="adr:<slug>" -->` | key |
| tech-debt 行 | `<!-- compound:owned key="debt:<slug>" -->` | key |
| 交叉引用（codewiki 新增） | `<!-- compound:owned key="xref:<rootKey>" -->` | key |

`**Source**:` 行的 codewiki 扩展：在标签后附锚点，使 docs 条目也可被 `kb verify` 检查：
```
**Source**: apps/shop-android/app/src/main/java/.../CartViewModel.kt#CartViewModel.add [Verified] <!-- a=android://app/.../CartViewModel.kt#CartViewModel.add@298d51bd -->
```
- 证据标签：`[Code Direct]`（直接来自代码）、`[AI Inferred]`（LLM 推断）、`[Verified]`（Code Direct 且锚点存在且 hash 匹配）、`[Pending]`（源已不存在）、`[Unconfirmed]`（只来自 Draft spec）。
- 人类条目 = 任何没有上述标记的块：**不删、不改、不重排、不标 stale**。歧义（如标记被人改坏、key 重复）→ 不动该块，进入 `report.humanReview[]`。

**合并算法（managed 文件）**：
```
blocks = segment(file)       // 按 heading 切节；节内按 entry 标记切块；未标记块 = human
for each heading H in file order:
  for each owned block b in H: idx[key(b)] = b
for each new entry e (sorted by heading order of schema, then key):
  if idx has key(e):
     if idx[key].hash == hash(e.body) -> keep (no-op)
     else if idx[key] is stale-or-changed -> replace bytes of that block in place
  else -> insert after last owned block under heading(e) (heading missing -> append new heading at end of file)
for each owned block b not produced this run:
  if its source file deleted -> b.tag = [Pending]（不删正文；行内标签替换）
  if direct source changed but entry not regenerated -> keep + report stale
human blocks: byte-identical
```
验证：写回后重解析，断言人类块的 sha256 序列与写前完全相同（不变量测试，失败则不写、exit 3）。

## 6. 增量扫描模式（per docs scope）

SFK：任一 managed 文件 → 从最早的 `last_compound_scan` 起 `git log --since` + `git diff` + `git diff --cached` + `git status`（rename 两个路径都算）；非 git 或浅克隆 → full；直接源变化标记 entry stale；spec.md 变化重评该 spec 目录下的 entries。

**已有**：v1 更强——`last_sha` + 符号图 diff（注释/格式 no-op）+ 引用边 k 跳传播 + `--base` 兼容 squash；但是全局一个 `last_sha`。

**TS 设计**：`src/scope/changes.ts`
```ts
interface ScopeChangeSet { scopeId: string; mode: ScanMode; since?: string /*sha or date*/; files: Set<string>; renamed: [string,string][]; specDirs: Set<string>; }
```
- 基准优先级：`compound_source_commit`（kb 扩展，精确）> `last_compound_scan` 日期（`git log --since=<date> --format=%H` 取最早 commit 的父）> full。
- 浅克隆检测：`git rev-parse --is-shallow-repository` = true 且基准不在历史中 → full。
- 文件集合 = `git diff --name-status -M <base> HEAD` ∪ `git diff --name-status -M --cached` ∪ `git status --porcelain=v2`（工作区未提交改动也算；rename 两个路径都加入）。
- 映射到 scope：文件路径前缀匹配 project root，否则 repo。
- 失效：entry 的 `Source` 文件 ∈ files 或锚点 hash 变化 → stale；`specs/<x>/spec.md` 变化 → 该 spec 目录派生的所有 entries 重评。
- 与 wiki 的 `last_sha` 共用 `git` 辅助模块；**每个 docs scope 一个基准**，存在各自文件 frontmatter，wiki 仍用 `.kb/state.json`。

## 7. Spec Status 信任

SFK：`Implemented/Verified/Archived` 可信；`Draft`/缺失 → 未确认，只能进入 requirement-oriented 维度且标 `[Unconfirmed]`，绝不进入 constitution/ADR/debt；stale-spec 报告（Draft >30 天无提交；Implemented 从未 Verified）；**从不编辑 specs/**。

**已有**：`kb discover-docs` 分类 spec-kit/OpenSpec/Kiro；`kb ingest` 把断言核对为 verified/conflict/unverifiable（代码优先）。没有读取 `**Status**:`。

**TS 设计**：
```ts
type SpecStatus = 'Draft' | 'Implemented' | 'Verified' | 'Archived' | 'Missing';
interface SpecDoc { path: string; dir: string; status: SpecStatus; trusted: boolean; lastCommit?: string; lastCommitDate?: string; }
const parseStatus = (md: string) => /^\*\*Status\*\*:\s*(\w+)/m.exec(md)?.[1] ?? 'Missing';
```
- 信任矩阵叠加 v1 核对结论：

| spec status | ingest verdict=verified | conflict | unverifiable |
|---|---|---|---|
| Implemented/Verified/Archived | `[Code Direct]`→`[Verified]` | 进 `_conflicts` + stale-spec 报告（"Implemented 但代码不符"） | `[AI Inferred]` 仅 requirement 维度 |
| Draft/Missing | `[Unconfirmed]`（附代码证据注释） | 只报告 | `[Unconfirmed]` 仅 requirement 维度 |

- `kb docs stale-specs [--days 30] [--json]`：Draft 且 `git log -1 --format=%cI -- <dir>` 早于 30 天；Implemented 从未出现 Verified（`git log -S'**Status**: Verified' -- <file>` 为空）；Implemented 但 ingest 有 conflict。exit 1 表示有 stale（与 `kb status` 一致）。
- `specs/` 加入 write-set guard 的**永久拒绝列表**（v1 已有 write-set 检查，追加 deny 规则）。

## 8. ADR 提议 + 技术债登记

SFK：从可信 spec 的决策（plan/research/technical-design/data-model）提议 ADR（`docs/adr/NNNN-<kebab>.md`，Status Proposed，从不编辑既有 ADR）；tech-debt 表 `TD-NNN`：deferred tasks、complexity tracking、ADR follow-ups、review residual、带解释的 TODO/FIXME/HACK；写之前需要用户确认。

**已有**：`pages/decisions/` 目录存在但无生成器；扫描器能拿到注释吗？hash 去掉注释——需新增注释抽取。

**TS 设计**：
- `kb docs adr [--json] [--write]`：默认 dry-run 输出提案（满足"用户确认"——kb 从不交互，确认 = 再次带 `--write` 运行，或 CI 中由人审 PR）。
  - 编号：`max(existing NNNN)+1`，零填充 4 位；文件首行 `<!-- compound:proposed key="adr:<spec-dir>/<decision-slug>" -->`；已存在相同 key → 跳过（幂等）。
  - 内容：Context / Decision / Consequences / Evidence（spec 路径 + 锚点）；`**Status**: Proposed`。
- `kb docs debt [--write]`：解析 `docs/tech-debt.md` 表格，新增行 `| TD-NNN | 描述 | 来源 | 位置 | <!-- compound:owned key="debt:<slug>" --> |`。
  - 来源抽取：spec `tasks.md` 中 `[ ]` 且含 deferred/延后/后续；`plan.md` "Complexity Tracking" 表；ADR "Follow-ups"；代码注释 `TODO|FIXME|HACK` **且后面有 ≥4 个词的解释**（tree-sitter comment 节点，新增 `extract/comments.ts`）。
  - key = `debt:<file>#<symbol>:<sha8(normalized text)>`，行号不入 key。
  - 已解决（注释消失）→ 不删行，在行尾标 `[Pending]` 并报告。

## 9. 运行状态与恢复

SFK：`.sfk/compound-run-state.json`，resume/restart，agents 列表，`completed_docs`，done 后清理。

**已有**：`kb compound` 原子发布（staging → rename）；`--keep-work`；失败不发布。没有跨进程恢复。

**TS 设计**：`.kb/run-state.json`（位于 wiki 的 `.kb/`；docs 模式同一文件不同 section）
```json
{ "version": 1, "run_id": "2026-10-21T17:20:00Z-8c1d2e4", "head": "8c1d2e4", "status": "running|done|failed",
  "phase": "discover|scan|plan|write|verify|publish",
  "scopes": [{"id":"repo","mode":"incremental","base":"1a2b3c4"}],
  "agents": [{"id":"A:shop-android","kind":"project-code","status":"done","result":".kb/work/A-shop-android.json","remaining_scope":[]}],
  "completed_docs": ["docs/architecture.md"], "tasks_done": ["features/cart"] }
```
- `kb compound --resume`（默认：同一 HEAD 且 status=running 时自动 resume；`--restart` 丢弃）。
- HEAD 已变化 → 视为 restart（打印原因）。
- agent 结果契约（LLM 返回 JSON 尾部）：`COMPOUND_META {"status":"done|continuation","remaining_scope":[...]}` → continuation 时 kb 以 remaining_scope 重新派发同一 agent（上限 `--max-continuations 3`）。
- 完成：`status=done`，删除 `.kb/work/`（除非 `--keep-work`）。

## 10. Agent 编排（A / B / R）与写入预算

SFK：A = 项目代码扫描（一个项目，读取上限 6000 行），B = 项目 spec 扫描，R = 仓库综合（在项目结果之后）；结果按目标路径分组；首次写入 ≤150 行，追加 ≤100 行。

**已有**：v1 每任务 = 一页 + write set + context 符号；多 agent 后端（claude/codex/gemini/template）。

**TS 设计**：任务类型扩展 `TaskKind = 'page' | 'docs-project-code' | 'docs-project-spec' | 'docs-repo-synth' | 'tree-name'`。
- A 的输入 = 确定性预处理（module_tree 子树 + facts + 符号签名 + 选取的函数体），按 6000 行硬截断（`ContextBudget.lines=6000`）；A 不读源码目录之外。
- R 只读 A/B 的结构化结果 + parity + 根 specs，不读项目源码。
- 写预算：`writer.apply` 校验每个文件本次新增行数（new/skeleton ≤150，managed/adopted 追加 ≤100），超出 → 截断到整条 entry 边界 + 报告 `budget_truncated`。
- 路由：repo 结果只能写 `docs/**`；project 结果只能写 `<root>/docs/**`——直接复用 write-set guard（task.writeSet = scope.docsRoot glob）。

## 11. 来源验证（Phase 3）

| SFK 规则 | codewiki 实现 |
|---|---|
| `[Code Direct]` 源存在 → `[Verified]` | 源 = 文件+可选符号；符号存在且 `kb anchor` hash 与 entry 记录一致 → `[Verified]`，否则重新生成或 `[Pending]` |
| 源缺失 → `[Pending]`（new/adopted 文件不插入） | 同；`writer` 过滤 |
| 新 `[AI Inferred]` → 搜证据，升级或丢弃 | 复用 v1 claims checker（`kb ingest` 的 template + LLM 判定）：verified → `[Code Direct]` 带锚点；unverifiable → 丢弃；conflict → 丢弃 + `_conflicts` |
| 仅 Draft → `[Unconfirmed]` | §7 |

## 12. 链接检查

SFK：check-doc-links：markdown 链接、反引号中的 `./` `../` 路径、仓库路径；断链 exit 3。

**已有**：`kb verify` 检查 wiki 内死链（并修过 `#` 片段 URL 误判）。

**TS 设计**：`kb links [paths...] [--docs] [--wiki] [--json]`
- 检查：`[t](rel)`、`[t](rel#anchor)`（anchor 按 GitHub slug 规则校验标题存在）、反引号内以 `./` `../` 开头或匹配已知仓库顶层目录的路径、`**Source**:` 路径。
- 退出码：**沿用 kb 约定**——断链 exit 1（与 verify 一致）；SFK 的 "exit 3" 通过 `--exit-code-broken 3` 兼容（默认不启用，避免与 kb 的 3=internal 冲突）。
- `kb docs compound` 写后自动运行，仅对本次写的文件阻断。

## 13. 风格推断与语言

- 风格：从 adopted/human 文件统计（标题层级、列表符号、中英文、表格偏好）→ 写进 prompt 的 `style` 段；确定性部分（列表符号、标题深度）由 renderer 直接遵循。
- 语言：`codewiki.yaml: language: zh-CN`（默认从现有 docs 推断），所有生成文本统一。

## 14. 汇总：差距优先级

| 优先级 | 能力 | 实现量 |
|---|---|---|
| P0 | scope 模型 + 项目发现；docs 写入路由与 write-set | 中 |
| P0 | 文件状态机 + entry markers + 非破坏合并 + 人类块不变量 | 大 |
| P0 | spec Status 信任 + `[Unconfirmed]` | 小 |
| P1 | per-scope 增量（`compound_source_commit`） | 小 |
| P1 | 链接检查 `kb links` | 小 |
| P1 | schema 维度 + null passthrough | 中 |
| P2 | ADR 提议 / 技术债 | 中 |
| P2 | run-state resume + continuation | 中 |
| P2 | stale-spec 报告 | 小 |
