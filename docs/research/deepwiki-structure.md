# 生成式代码 Wiki 的结构组织：业界产品调研

> 目的：为 codewiki v2 的"多层页面层级"提供证据。当前 codewiki 只有 `index → pages/{features,flows,concepts,decisions}` 两层，用户认为太浅。
> 调研时间：2026-10-21。本地源码均为只读 clone（路径前缀 `$DW=/tmp/claude-0/-home-user-axios/f608cc50-0c09-5f4c-8195-0e8da779e294/scratchpad/dw`），同时给出 GitHub URL。

## 0. 结论速览

| 产品 | 树怎么来 | 层数 | 页面单位 | 引用格式 | 图 | 增量时怎么修树 |
|---|---|---|---|---|---|---|
| Devin DeepWiki | LLM 规划（默认基于"cluster"），可用 `.devin/wiki.json` 覆盖 | 实际 2 层（`1` / `1.1`），`parent` 字段 | 主题页（overview / architecture / subsystem） | `Sources: path:L-L` | mermaid（架构/时序/类图） | 整体重新生成（按 commit 刷新） |
| deepwiki-open | LLM 一次性规划 XML `wiki_structure`（file tree + README 作输入） | section → subsection → page，2–3 层 | 4–6（concise）或 8–12（comprehensive）页 | `Sources: [path:start-end]()`，每页 ≥5 个文件 | mermaid（强制规范） | 无（全量重生成） |
| OpenDeepWiki | LLM agent 带工具（ListFiles/Grep/Read）探索后写 catalog JSON 树 | 任意深度，父节点=导航域，叶子=文章 | "可独立阅读的深度长文" | 行号引用 | mermaid + mindmap | `CatalogTool.EditAsync` 局部编辑；禁止增量时整体替换 |
| FSoft CodeWiki | **依赖图 → leaf 组件 → LLM 递归聚类** → `module_tree.json` | `max_depth=2`（可配）+ overview 根 | 模块（组件集合），按 token 预算决定是否再分 | 组件 id `<file>::<name>` | mermaid | **确定性规则修树**（same_file → same_dir → neighbor_majority → routing agent），增长阈值触发重聚类 |
| Google Code Wiki | Gemini 生成，细节未公开 | 未知（section → 代码链接） | section | 链接到文件/类/函数 | 架构/类/时序图，代码变更后重生成 | 每次提交后重生成 |
| RepoAgent | **镜像仓库目录树**：repo → dir → file → class → function | 与目录深度相同（5+） | 每个代码对象一段文档 | 无（就地） | 无 | 对象级状态机 + 引用者变化失效 |
| Understand-Anything | tree-sitter 图 + LLM 分"架构层"(API/Service/Data/UI/Utility) + 业务域 + guided tours | 图而非树；层 × 域 | 节点（文件/符号）+ tour | 节点 → 源码 | 交互式图 | 指纹变化只重分析改动文件 |

**提炼出的五个关键模式**（详见 §8）：
1. **确定性骨架 + LLM 细化**：最好的增量方案（CodeWiki）是"图聚类得到树，规则修树，LLM 只处理规则放不下的"。纯 LLM 规划（deepwiki-open / Devin）无法稳定增量。
2. **父节点 = 导航/综合，叶子 = 内容**：OpenDeepWiki 明确"有 children 的节点不承载内容"；CodeWiki 则是"叶子先写，父节点由子文档综合"（bottom-up）。
3. **页面预算按 token 而非数量**：CodeWiki 以 `max_token_per_module=36,369` / `max_token_per_leaf_module=4,000` 决定是否继续拆；OpenDeepWiki 拒绝固定页数。
4. **引用到 file:line**：DeepWiki 系都把引用写成 `Sources: path:start-end`；codewiki 已有更强的 symbol-id + hash 锚点，应在正文渲染行号链接。
5. **增量修树 ≠ 重新规划**：OpenDeepWiki 禁止整体重写 catalog（代码里有硬拦截）；CodeWiki 有 `tau_grow=0.33`（叶子新增组件占比）和 `tau_tree=0.3`（树变动比例）阈值决定局部重聚类还是全量。

---

## 1. Devin DeepWiki（deepwiki.com）

来源：<https://docs.devin.ai/work-with-devin/deepwiki>（代理拦截，信息来自搜索摘要与多语言镜像页）、<https://www.fast.io/resources/devin-deepwiki-guide.md>。

- **可引导配置 `.devin/wiki.json`**（仓库根）：
  - `repo_notes`: `[{content}]` —— 全局指导。
  - `pages`: `[{title, purpose, parent?, page_notes?}]` —— 提供后**跳过默认的基于 cluster 的规划**，严格生成这些页。`parent` 填父页 title 构成层级。
  - 限制：最多 **30 页**（enterprise 80）；`repo_notes` + 所有 `page_notes` 合计 ≤100 条，每条 ≤10,000 字符；title 唯一非空。
  - 启示：**默认规划来自"cluster"**（即对代码做聚类）而非目录；用户可以用一个声明式文件覆盖页面树。codewiki 应提供等价物：`codewiki.yaml` 中 `tree.pins` / `tree.notes`（见 design-v2 §3.6）。
- **页面形态（观察 deepwiki.com 页面）**：左侧编号目录 `1 Overview`, `1.1 …`, `2 Architecture`, `2.1 …`；即 **2 级编号**，顶层是 Overview / 架构 / 主要子系统 / 开发与测试。每页顶部 "Relevant source files" 列表，段落末 `Sources: path/to/file.py:12-48`，链接到 GitHub 行号；大量 mermaid flowchart / sequenceDiagram / classDiagram。
- **MCP**：`read_wiki_structure`（返回目录树）、`read_wiki_contents`、`ask_question` —— 说明"结构"本身是 agent 的第一入口，应当可单独、廉价获取（codewiki 对应 `kb tree --json`）。

## 2. deepwiki-open（AsyncFuncAI/deepwiki-open）

源码：<https://github.com/AsyncFuncAI/deepwiki-open>，本地 `$DW/deepwiki-open`（commit d92819a）。

### 2.1 数据结构
`src/types/wiki/wikipage.tsx`：
```ts
export interface WikiPage {
  id: string; title: string; content: string;
  filePaths: string[];
  importance: 'high' | 'medium' | 'low';
  relatedPages: string[];
  // New fields for hierarchy
  parentId?: string; isSection?: boolean; children?: string[];
}
```
`src/app/[owner]/[repo]/page.tsx:391-395`：若 LLM 没给 sections，**回退为按 importance 分组**（high/medium/low 三个分区）。

### 2.2 规划 prompt（`api/services/wiki/prompts.py`）
- 输入只有 **完整 file tree + README**（`prompts.py:225-240`："1. The complete file tree … 2. The README file …"）。没有依赖图。
- comprehensive 模式的固定顶层 section（`prompts.py:136-145`）：Overview / System Architecture / Core Features / Data Management/Flow / Frontend Components / Backend Systems / Model Integration / Deployment/Infrastructure / Extensibility and Customization。
- XML 结构（`prompts.py:154-183`）：`<sections><section id><title/><pages><page_ref/></pages><subsections><section_ref/></subsections></section></sections>` + `<pages><page id><title/><description/><importance>high|medium|low</importance><relevant_files><file_path/></relevant_files><related_pages><related/></related_pages><parent_section/></page></pages>`。即 **section 可嵌套 subsection**，page 挂在 section 下。
- 页数预算（`prompts.py:222-224`）：`page_count = "8-12" if comprehensive else "4-6"`。
- 规划时要求挑选适合图的页面（`prompts.py:241-248`）："Architecture overviews, Data flow, Component relationships, Process workflows, State machines, Class hierarchies"。

### 2.3 页面 prompt（`prompts.py:25-130`）
- 页面第一行必须是 `<details>` 列出 RELEVANT_SOURCE_FILES，"MUST use AT LEAST 5 relevant source files"。
- 结构：Introduction（1–2 段，链接其他页）→ H2/H3 详细分节 → mermaid（含详细语法约束，如 `graph TD` 垂直方向、sequence participant 别名）→ 表格 → 可选代码片段 → Summary。
- 引用（`prompts.py:108-118`）：`Sources: [src/full/path/file.ext:start_line-end_line]()`，必须完整仓库相对路径，"cite AT LEAST 5 different source files"。
- 准确性："All information must be derived SOLELY from the [RELEVANT_SOURCE_FILES]"。

**评价**：纯 LLM 一次规划，层级浅（实际 1–2 层 section），没有增量修树；但 `importance` + `relatedPages` + `filePaths` 是好用的页面元数据，codewiki 应吸收（`importance` 可由图中心度确定性计算）。

## 3. OpenDeepWiki（AIDotNet/OpenDeepWiki）

源码：<https://github.com/AIDotNet/OpenDeepWiki>，本地 `$DW/OpenDeepWiki`（commit c04bef3）。

### 3.1 Catalog 树
`src/OpenDeepWiki.Entities/Repositories/CatalogItem.cs`：`{title, path ("1-overview"), order, children[]}` —— 只有 4 个字段，**任意深度**。

### 3.2 规划 prompt（`src/OpenDeepWiki/prompts/catalog-generator.md`）
- L25 "DEEPWIKI-STYLE INFORMATION ARCHITECTURE (PRIMARY DIRECTIVE) - Build a navigable wiki with top-level topic domains and independently readable deep-dive leaf pages."
- L26 "RIGHT-SIZED COVERAGE, NO FIXED COUNTS … Do not use numeric page targets, lower bounds, upper bounds, quotas, or caps."
- L32 "**NO FILE/CLASS PAGES** - Do not create pages merely because a file, class, controller, repository, or component exists."
- L57-59 "Parent nodes with children are navigation/grouping domains; document content is generated for leaf nodes … Do not rely on a parent node to carry content if it also has children."
- L72-74 "Every leaf item becomes a generated document page … Avoid many shallow pages … ask for each leaf page: Does this page combine unrelated capabilities … If yes, split them."
- L127-131：先用工具（`ListFiles("src/**/*", maxResults=100)`、Grep、Read）建立"能力地图"，再 "cluster that map into top-level domains and leaf pages"。
- L170-181 推荐域模式表：Overview / Getting Started / Architecture（可再分 components / data model / runtime flow）/ AI/Integrations…

### 3.3 增量（`prompts/incremental-updater.md` + `Services/Wiki/CatalogStorage.cs`）
- 工具：`CatalogTool.ReadAsync / WriteAsync / EditAsync(path,nodeJson)`、`DocTool.ReadAsync / WriteAsync / EditAsync(old,new,path)`。
- L238 "❌ Never use WriteAsync during incremental updates; it replaces the entire catalog"。
- `CatalogStorage.cs:74-80` 硬拦截："Refusing to replace catalog: new structure has {newCount} items but {existing} exist. Use EditCatalog for partial updates."——**结构守卫在代码里，不靠 prompt**（与 codewiki 的 write-set guard 同一思路）。
- 变化分类（L319-327）：New feature 高 / Modified behavior 中 / Config 中 / Bug fix 低，决定是否增删 catalog 节点。

## 4. FSoft CodeWiki（FSoft-AI4Code/CodeWiki）

源码：<https://github.com/FSoft-AI4Code/CodeWiki>，本地 `$DW/CodeWiki`（commit 5b95c84）。论文：*CodeWiki: Automated Repository-Level Documentation at Scale*（arXiv 2510.24428）。**这是与 codewiki 最接近、最值得借鉴的设计。**

### 4.1 流水线
1. **依赖图**：`dependency_analyzer/`（tree-sitter，多语言 analyzers：java/kotlin/typescript/…），组件 id = `<file_path>::<name>`。
2. **leaf 选择**（`dependency_analyzer/leaf_selection.py`）：类/接口/struct 为候选；OOP 组件 <20 或占比 <0.2 时函数也算；候选 >400（`LEAF_REDUCTION_THRESHOLD`）时剪到图上的真正叶子。
3. **递归聚类**（`cluster_modules.py:270-330` + `prompt_template.py:143-200` `CLUSTER_REPO_PROMPT` / `CLUSTER_MODULE_PROMPT`）：
   - 若组件代码 token ≤ `max_token_per_module`（`config.py:28` `DEFAULT_MAX_TOKEN_PER_MODULE = 36_369`）→ **不聚类**，整体作为一个模块。
   - 否则 LLM 输出 `<GROUPED_COMPONENTS>{"module_name": {"path": ..., "components": [...]}}`，要求 id 原样返回；构建/CI/manifest 文件（`artifact`）"ARE essential … group them into a dedicated build/deployment/configuration module"。
   - 子模块按同样规则递归，`MAX_DEPTH = 2`（`config.py:25`）。
4. **module_tree.json**（`updater/tree.py:3`）：`{name: {"path"?: str, "components": [ids], "children": {...}}}`；另存 `first_module_tree.json`（初次聚类结果）。
5. **生成顺序：叶子优先，父节点综合子文档**（`documentation_generator.py:240-251`），根模块文档改名为 `overview.md`。leaf agent 可在运行中通过 `generate_sub_module_documentation` 工具继续下分，条件 `current_depth < max_depth and num_tokens >= max_token_per_leaf_module * current_depth`（`agent_tools/generate_sub_module_documentations.py:86-87`；`DEFAULT_MAX_TOKEN_PER_LEAF_MODULE = 4_000`）。
6. **布局**（`doc_layout.py:1-25`）：`hierarchical`（默认）页面镜像模块树 `auth.md`、`auth/login.md`、`auth/session/store.md`；`flat` 给小模型。"Module names stay unique across the whole tree"；`organize_docs` 修正错放页面并**重写页间相对链接**。

### 4.2 增量修树（`updater/`）
- `graph_diff.py`：组件级 diff（added/deleted/renamed/changed）。
- `tree_repair.py:1-8`："renames are rewritten in place, deleted components are removed (empty leaves disappear), added components are routed by rules 1-3, and what the rules cannot place is handed to a routing callable (rule 4). The growth check only *flags* leaves; re-clustering is the orchestrator's job."
  - 规则：`1:same_file` → `2:same_dir`（目录下只有一个 leaf 时）→ `3:neighbor_majority`（依赖邻居多数所在 leaf）→ `4:routing_agent`（LLM）→ `untracked`。
- `ownership.py:1-12` "ownership closure"：模块树只追踪部分组件（svelte 上 764/2239），未追踪但变化的组件用同样规则得到"effective owner"，保证变更不会因无主而被漏掉。
- `options.py:28,40`：`tau_grow = 0.33`（叶子新增组件占比超过即重聚类该叶子）、`tau_tree = 0.3`（(创建+删除+重聚类)/全部叶子 超过即全量）。
- `stale_scan.py`、`verdicts.py`、`reference_index.py`：页面引用索引 + 失效判定。

## 5. Google Code Wiki（codewiki.google）

来源：<https://infoq.com/news/2025/11/google-code-wiki/>、<https://devops.com/google-code-wiki-aims-to-solve-documentations-oldest-problem/>、<https://www.analyticsvidhya.com/blog/2025/12/google-code-wiki/>（2025-11 公测）。
- 每个 section 链接到相关文件/类/函数，"from high-level explanations to specific files, classes, and functions"——即 **overview → section → 代码符号** 的下钻。
- 自动生成架构图、类图、时序图，"regenerated when the code changes"。
- 每次提交后刷新；Gemini chat 回答带源码链接。未公开结构算法。

## 6. RepoAgent（OpenBMB/RepoAgent）

源码：<https://github.com/OpenBMB/RepoAgent>，本地 `$DW/RepoAgent`。
- `doc_meta_info.py:33-42` `DocItemType`：`_repo / _dir / _file / _class / _class_function / _function / _sub_function / _global_var` —— **完全镜像目录 + AST 树**，`project_hierarchy.json` 存储。
- `doc_meta_info.py:77-83` `DocItemStatus`：`doc_up_to_date / doc_has_not_been_generated / code_changed / add_new_referencer / referencer_not_exist` —— 对象级状态机，引用者变化也会使文档失效（`reference_who` / `who_reference_me` 双向边，L128-129）。
- `need_to_generate`：只给对象生成，文件及以上粒度跳过——所以 **没有综合性的上层页**，导航=目录。
- 启示：L4（符号）层的"状态机 + 双向引用"值得要；但目录镜像不能作为主树（Android/iOS 目录深且按技术分层，不按功能）。

## 7. Understand-Anything（Egonex-AI/Understand-Anything）

源码：<https://github.com/Egonex-AI/Understand-Anything>，本地 `$DW/Egonex-AI_Understand-Anything`，README L315-345。
- "Tree-sitter (deterministic) … Same input → same output, every run. Also powers fingerprint-based change detection" + "LLM (semantic) … architectural layer assignments, business-domain mapping, guided tours"。
- 7 个 agent：project-scanner / file-analyzer（并行 5 worker、每批 20–30 文件）/ architecture-analyzer（API/Service/Data/UI/Utility 层）/ tour-builder / graph-reviewer（"Validates graph completeness and referential integrity"，默认 inline 确定性检查）/ domain-analyzer / article-analyzer。
- 启示：**两条正交轴**——技术层（layer）与业务域（domain）。对移动 app：L2 按构建模块（技术），L3 按功能簇（业务）；另提供 "tour"（阅读顺序）= codewiki 的 flows。

## 8. 对 codewiki 的可执行模式

| # | 模式 | 证据 | codewiki v2 落地 |
|---|---|---|---|
| P1 | 树骨架由构建系统+依赖图确定性计算，LLM 只命名/摘要/处理放不下的 | CodeWiki 聚类与修树规则；DeepWiki 默认 cluster-based | L0–L2 纯确定性（repo / platform+project / Gradle·SwiftPM·HAP 模块），L3 用图社区检测（Leiden/Louvain 种子固定）+ LLM 命名 |
| P2 | 父节点综合子节点，叶子承载细节，bottom-up 写 | CodeWiki `processing_order` 叶子优先；OpenDeepWiki 父=导航 | 写作顺序 L3→L2→L1→L0；父页只读子页摘要（`summary` 字段），不读源码 |
| P3 | token 预算决定拆分 | `max_token_per_module=36,369`、`max_token_per_leaf_module=4,000`、`MAX_DEPTH=2` | 模块源码 token > 32k 才拆 L3；叶页正文 ≤ 1,500 词；树深上限 5（L0–L4） |
| P4 | 每页"Relevant source files" + 段落级 `Sources:` 行号 | deepwiki-open `prompts.py:108-118` | 保留 frontmatter `sources`（sym+hash），正文 `Sources:` 由 kb 从锚点渲染行号，LLM 不手写行号 |
| P5 | mermaid 图 | deepwiki-open 强制规范；Code Wiki 架构/类/时序 | 模块依赖图、路由导航图、类图由 facts **确定性生成**（`kb diagram`），LLM 只可引用不可改 |
| P6 | 结构守卫在代码里 | OpenDeepWiki `CatalogStorage.cs:74-80` | `module_tree.json` 只能由 `kb tree` 写；LLM 只能提交 `tree-patch`（rename/merge/split 建议），kb 验证后应用 |
| P7 | 增量修树规则链 + 阈值 | CodeWiki `tree_repair.py`、`tau_grow/tau_tree` | 照搬规则链 same_file→same_dir→neighbor_majority→LLM；`tau_grow=0.33`、`tau_tree=0.3` |
| P8 | 用户可声明式覆盖树 | `.devin/wiki.json`（pages/parent/notes，30 页上限） | `codewiki.yaml: tree.pins/notes`，并允许人类拥有的页挂到树上 |
| P9 | 结构可单独查询 | DeepWiki MCP `read_wiki_structure` | `kb tree [--depth N] --json`、MCP `kb_tree`；`llms.txt` 分层 |
| P10 | 页面元数据 importance/relatedPages | deepwiki-open `WikiPage` | `importance` 由 PageRank/入度确定性算；`related` 由跨簇引用边权重 top-k |
| P11 | 不要文件/类页（L3 以上） | OpenDeepWiki L32 | 符号级只作为页内 section/表格（L4），不独立成页 |
| P12 | 层 × 域双轴 | Understand-Anything | L2=构建模块（技术），L3=功能簇（业务）；跨端 feature 页（现有 `features/<route>`）作为"域视图"与模块树交叉链接 |
