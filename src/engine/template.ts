// Offline deterministic page writer (`--llm template`).
import type { Facts, Graph } from '../model.js';
import { getSym } from '../model.js';
import { type Page, StatusCurrent, idFromPath } from '../wiki/page.js';
import { cmpStr } from '../util/go.js';
import { NavigationPage, SharedThreshold, computeAnchors, featureSymbols, routeIDs } from './anchors.js';
import { OverviewPage, featurePage } from './plan.js';
import { sortedKeys } from './graphutil.js';

const routeTitles: Record<string, string> = {
  login: '登录', products: '商品列表', product_detail: '商品详情', cart: '购物车', checkout: '结算', order_detail: '订单详情',
  profile: '个人中心', home: '首页', settings: '设置', search: '搜索',
};

export function routeTitle(rid: string): string {
  return Object.prototype.hasOwnProperty.call(routeTitles, rid) ? routeTitles[rid] + '（' + rid + '）' : rid;
}

export function platformsOf(f: Facts, rid: string): string[] {
  return sortedKeys(new Set((f.routes ?? []).filter((r) => r.route_id === rid).map((r) => r.platform)));
}

const esc = (s: string) => s.replaceAll('|', '\\|');

export function templateFeature(g: Graph, f: Facts, rid: string, commit: string): Page {
  const syms = featureSymbols(g, f, rid);
  const symSet = new Set(syms);
  let b = `# ${routeTitle(rid)}\n\n`;
  b += '> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。\n\n';
  b += '## 路由与深链\n\n| 平台 | pattern | deeplink | 入口符号 |\n|---|---|---|---|\n';
  for (const r of f.routes ?? []) if (r.route_id === rid) b += `| ${r.platform} | \`${r.pattern}\` | \`${r.deeplink}\` | \`${r.symbol}\` |\n`;
  const tids = (f.testids ?? []).filter((t) => t.route_id === rid).map((t) => `| ${t.platform} | \`${t.tid}\` | \`${t.file}:${t.line}\` |`);
  b += '\n## testID\n\n';
  b += tids.length === 0 ? '（无归属于该路由的 testID；共享组件的 testID 见 facts）\n' : '| 平台 | tid | 位置 |\n|---|---|---|\n' + tids.join('\n') + '\n';
  const apis = (f.apis ?? []).filter((a) => symSet.has(a.symbol)).map((a) => `| ${a.platform} | ${a.method} | \`${a.path}\` | \`${a.symbol}\` |`);
  b += '\n## 接口\n\n';
  b += apis.length === 0 ? '（该功能的锚点符号未直接调用 HTTP 接口）\n' : '| 平台 | 方法 | 路径 | 调用符号 |\n|---|---|---|---|\n' + apis.join('\n') + '\n';
  const consts: string[] = [];
  for (const id of syms) {
    const s = getSym(g, id);
    if (s && s.value && s.kind !== 'case') consts.push(`- \`${s.qual}\` = \`${s.value}\`（${s.platform}）`);
  }
  if (consts.length) b += '\n## 关键常量\n\n' + consts.join('\n') + '\n';
  b += '\n## 相关代码\n\n';
  const byPlat = new Map<string, string[]>();
  for (const id of syms) {
    const s = getSym(g, id)!;
    const a = byPlat.get(s.platform) ?? [];
    a.push(`- \`${s.id}\` — ${s.kind} \`${s.signature}\``);
    byPlat.set(s.platform, a);
  }
  const plats = [...byPlat.keys()].sort(cmpStr);
  for (const p of plats) b += `**${p}**\n\n${byPlat.get(p)!.join('\n')}\n\n`;
  const page = featurePage(rid);
  // route ids may contain '/', nesting the page deeper than pages/features/
  const up = '../'.repeat(page.split('/').length - 2);
  b += `## 相关页面\n\n- [总览](${up}overview.md)\n- [导航与深链](${up}concepts/navigation.md) · [共享组件](${up}concepts/shared-components.md)\n`;
  for (const p of plats) b += `- [${p} routes facts](${up}../facts/${p}/routes.md)\n`;
  return {
    path: page, hasFM: true, body: b,
    front: { id: idFromPath(page), title: routeTitle(rid), kind: 'feature', platforms: platformsOf(f, rid), routes: [rid], sources: syms.map((id) => ({ sym: id, hash: getSym(g, id)!.hash })), source_commit: commit, status: StatusCurrent },
  };
}

export function templateOverview(f: Facts, platforms: string[], commit: string): Page {
  const rids = routeIDs(f);
  let b = '# 总览：自动抽取的路由事实\n\n> 由 facts 确定性生成（`kb compound`）。每个功能页覆盖一个 `route_id`；各平台实际覆盖以表格为准。自动事实为零不代表没有业务能力。\n\n';
  b += '| route_id | pattern | ' + platforms.join(' | ') + ' | 页面 |\n|---|---|' + '---|'.repeat(platforms.length) + '---|\n';
  for (const rid of rids) {
    let pattern = '';
    const cells = platforms.map((p) => {
      let c = '—';
      for (const r of f.routes ?? []) {
        if (r.route_id === rid && r.platform === p) {
          c = '✓';
          pattern = r.pattern;
        }
      }
      return c;
    });
    b += `| \`${rid}\` | \`${pattern}\` | ${cells.join(' | ')} | [${routeTitle(rid)}](features/${rid}.md) |\n`;
  }
  const schemes = new Set<string>();
  for (const sc of Object.values(f.schemes ?? {})) sc.forEach((s) => schemes.add(s));
  if (schemes.size) b += `\n深链 scheme：\`${sortedKeys(schemes).join('`, `')}\`。\n`;
  b += `\n规模：${f.routes?.length ?? 0} 条路由、${f.testids?.length ?? 0} 个 testID、${f.apis?.length ?? 0} 个接口调用点。三端差异见 [parity.md](parity.md)。机器可读：[routes.json](../facts/routes.json) · [testids.json](../facts/testids.json) · [apis.json](../facts/apis.json)\n`;
  return { path: OverviewPage, hasFM: true, body: b, front: { id: idFromPath(OverviewPage), title: '总览', kind: 'overview', platforms, routes: rids, source_commit: commit, status: StatusCurrent } };
}

export function templateConcept(g: Graph, f: Facts, page: string, commit: string): Page {
  const as = computeAnchors(g, f);
  let [ids, title, intro] = [as.shared, '共享组件', `被 ≥${SharedThreshold} 个路由引用的符号（返回按钮、顶栏、API 客户端等）。它们不计入单个功能页的锚点，改动它们只会让本页失效，而不会让所有功能页一起变 stale。`];
  if (page === NavigationPage) [ids, title, intro] = [as.navigation, '导航与深链', '路由表、路由器、导航栈与深链/测试参数处理代码（三端）。路由事实见 facts/*/routes.md。'];
  let b = `# ${title}\n\n> ${intro}\n\n`;
  const byPlat = new Map<string, string[]>();
  for (const id of ids) {
    const s = getSym(g, id)!;
    const u = as.usedBy.get(id);
    const used = u && u.length ? '（routes: ' + u.join(', ') + '）' : '';
    const a = byPlat.get(s.platform) ?? [];
    a.push(`| ${s.kind} | \`${s.id}\` | \`${esc(s.signature)}\` | ${used} |`);
    byPlat.set(s.platform, a);
  }
  const plats = [...byPlat.keys()].sort(cmpStr);
  if (plats.length === 0) b += '（无）\n';
  for (const p of plats) b += `## ${p}\n\n| kind | 符号 | 签名 | 使用方 |\n|---|---|---|---|\n${byPlat.get(p)!.join('\n')}\n\n`;
  b += '## 相关页面\n\n- [总览](../overview.md)\n';
  const front = { id: idFromPath(page), title, kind: 'concept', platforms: plats, source_commit: commit, status: StatusCurrent } as Page['front'];
  if (ids.length) front.sources = ids.map((id) => ({ sym: id, hash: getSym(g, id)!.hash }));
  return { path: page, hasFM: true, body: b, front };
}
