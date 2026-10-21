// Writer prompts for LLM tasks (page tasks; conflicts prompts arrive with ingest).
import fs from 'node:fs';
import path from 'node:path';
import type { Facts, Graph, Symbol } from '../model.js';
import { getSym } from '../model.js';
import { goJSON } from '../util/go.js';
import { idFromPath, renderPage } from '../wiki/page.js';
import { NavigationPage, SharedPage } from './anchors.js';
import type { Task } from './plan.js';
import { SafetyPreamble, dataBlock } from './safety.js';
import { platformsOf, templateConcept, templateFeature, templateOverview } from './template.js';
import { short } from './graphutil.js';

const maxBodyLines = 80;

export function symbolBody(dir: string, s: Symbol): string {
  let b: string;
  try {
    b = fs.readFileSync(path.join(dir, s.file), 'utf8');
  } catch {
    return '';
  }
  const lines = b.split('\n');
  const lo = Math.max(0, s.start_line - 1);
  const hi = Math.min(lines.length, s.end_line);
  if (hi - lo > maxBodyLines) return lines.slice(lo, lo + maxBodyLines).join('\n') + `\n… (${hi - lo - maxBodyLines} more lines)`;
  return lines.slice(lo, hi).join('\n');
}

export interface PromptCtx {
  g: Graph;
  f: Facts;
  srcDir: string;
  staging: string;
  head: string;
  platforms: string[];
}

export function buildPrompt(c: PromptCtx, t: Task): string {
  const { g, f } = c;
  let b = `# codewiki 任务 ${t.id}\n\n`;
  b += '你是 codewiki 的 wiki 写作 agent。当前工作目录是 wiki 的 staging 副本；用你自己的文件读写/编辑工具（或 shell）完成任务。\n';
  b += '非交互模式：不要提问，直接完成任务，完成后用一句话汇报。\n\n';
  b += SafetyPreamble;
  b += `## 任务\n\n- op: \`${t.op}\`\n- kind: \`${t.kind}\`\n- page: \`${t.page}\`\n- head commit: \`${short(c.head)}\`\n`;
  if (t.route_id) b += `- route_id: \`${t.route_id}\`\n`;
  b += '- 触发原因:\n';
  for (const r of t.reasons) b += `  - ${r.code} ${r.sym ?? ''} ${r.detail ?? ''}\n`;
  b += '\n## 可写集合（write set）——只能创建/修改这些文件，其他任何写入都会被自动回滚并记为违规\n\n';
  for (const w of t.write_set) b += `- \`${w}\`\n`;
  b += '\n## 规则\n\n';
  b += '1. 只使用下文给出的事实与符号源码；不要编造符号、路由、testID、接口。代码与旧文档冲突时以代码为准。\n';
  b += '2. 正文用中文，代码标识符保持英文；引用符号时用完整符号 ID 并加反引号，且只能引用下文列出的符号 ID。\n';
  b += '3. 只使用相对链接，且目标必须存在（可用：`../overview.md`、`../../facts/<platform>/routes.md`、`features/<route_id>.md` 等已存在页面）。\n';
  b += '4. 不要修改 facts/、raw/、index.md、log.md、.kb/（除非它在可写集合中）。\n';
  b += '5. 可以运行 `kb anchor <symbol-id>` 获取符号当前 hash（下文已给出，通常无需调用）。\n\n';
  b += '## frontmatter（必须使用；sources 可删减但不可新增未列出的符号）\n\n```yaml\n---\n';
  b += `id: ${idFromPath(t.page)}\ntitle: <中文标题>\nkind: ${t.kind}\n`;
  if (t.route_id) b += `platforms: [${platformsOf(f, t.route_id).join(', ')}]\nroutes: [${t.route_id}]\n`;
  if (t.context.length) {
    b += 'sources:\n';
    for (const id of t.context) {
      const s = getSym(g, id);
      if (s) b += `  - sym: ${s.id}\n    hash: ${s.hash}\n`;
    }
  }
  b += `source_commit: ${short(c.head)}\nstatus: current\n---\n\`\`\`\n\n`;
  b += '## 相关事实（来自 facts/*.json）\n\n';
  if (t.kind === 'overview') b += 'routes:\n```json\n' + goJSON(f.routes, ' ') + '\n```\n\n';
  else if (t.route_id) {
    for (const r of f.routes ?? []) if (r.route_id === t.route_id) b += `- route ${r.platform}: pattern \`${r.pattern}\` deeplink \`${r.deeplink}\` symbol \`${r.symbol}\`\n`;
    for (const tid of f.testids ?? []) if (tid.route_id === t.route_id) b += `- testID ${tid.platform}: \`${tid.tid}\` at \`${tid.file}:${tid.line}\`\n`;
    const ctx = new Set(t.context);
    for (const a of f.apis ?? []) if (ctx.has(a.symbol)) b += `- api ${a.platform}: ${a.method} \`${a.path}\` called by \`${a.symbol}\`\n`;
    b += '\n';
  }
  if (t.context.length) {
    b += '## 符号源码（当前 HEAD）\n\n';
    for (const id of t.context) {
      const s = getSym(g, id);
      if (!s) continue;
      b += `### \`${s.id}\`\n\nkind=${s.kind} hash=${s.hash.slice(0, 12)} refs=${s.refs?.length ?? 0} lang=${s.lang}\n\n${dataBlock('source', s.id, symbolBody(c.srcDir, s))}\n`;
    }
  }
  let existing: string | null = null;
  try {
    existing = fs.readFileSync(path.join(c.staging, t.page), 'utf8');
  } catch {
    existing = null;
  }
  if (existing !== null) b += '## 现有页面（请在此基础上更新，删除过时内容）\n\n' + dataBlock('existing-page', t.page, existing) + '\n';
  else {
    let draft = null;
    if (t.kind === 'feature') draft = templateFeature(g, f, t.route_id!, short(c.head));
    else if (t.kind === 'overview') draft = templateOverview(f, c.platforms, short(c.head));
    else if (t.page === NavigationPage || t.page === SharedPage) draft = templateConcept(g, f, t.page, short(c.head));
    if (draft) b += '## 确定性草稿（锚点正确；请改写为更有用的说明：职责、三端实现差异、数据流、测试要点）\n\n````markdown\n' + renderPage(draft) + '\n````\n\n';
  }
  b += `## 输出\n\n把完整页面（frontmatter + 正文）写入 \`${t.page}\`。建议结构：概述 → 路由与深链 → 三端实现对照（表格）→ 接口与数据流 → testID 与测试要点 → 相关页面。保持简洁（< 120 行）。\n`;
  return b;
}
