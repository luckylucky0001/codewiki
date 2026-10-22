// Feature × platform parity matrix and the generated pages/parity.md.
import type { Facts, Graph } from '../model.js';
import { snake } from '../facts/facts.js';
import { GeneratedMarker } from '../facts/render.js';
import { cmpStr } from '../util/go.js';
import { routeIDs } from './anchors.js';
import { childrenOf, parityDepth, reach, sortedKeys } from './graphutil.js';

export const ParityPage = 'pages/parity.md';

export interface ParityCell {
  route: boolean;
  testids: string[];
  apis: string[];
}
export interface ParityRow {
  route_id: string;
  platforms: Record<string, ParityCell>;
  missing_route: string[];
  missing_testids: Record<string, string[]>;
  missing_apis: Record<string, string[]>;
}
export interface ConstDiff {
  name: string;
  values: Record<string, { value: string; symbol: string }>;
}
export interface Parity {
  platforms: string[];
  features: ParityRow[];
  constant_diffs: ConstDiff[];
  gaps: number;
}

export function sharedSourceSet(file: string): boolean {
  return file.split('/').some((s) => s === 'commonMain' || s === 'mobileMain' || s === 'nonWebMain');
}

const sortRec = <V>(m: Record<string, V>): Record<string, V> => Object.fromEntries(Object.entries(m).sort((a, b) => cmpStr(a[0], b[0])));

export function computeParity(g: Graph, f: Facts, platforms: string[]): Parity {
  const p: Parity = { platforms, features: [], constant_diffs: [], gaps: 0 };
  const children = childrenOf(g);
  for (const rid of routeIDs(f)) {
    const row: ParityRow = { route_id: rid, platforms: {}, missing_route: [], missing_testids: {}, missing_apis: {} };
    const anchors = new Set<string>();
    for (const r of f.routes ?? []) if (r.route_id === rid) for (const id of reach(g, children, r.symbol, parityDepth)) anchors.add(id);
    for (const pl of platforms) {
      const c: ParityCell = { route: false, testids: [], apis: [] };
      for (const r of f.routes ?? []) if (r.route_id === rid && (r.platform === pl || sharedSourceSet(r.file))) c.route = true;
      const tids = new Set<string>();
      for (const t of f.testids ?? []) if (t.route_id === rid && (t.platform === pl || sharedSourceSet(t.file))) tids.add(t.tid);
      const apis = new Set<string>();
      for (const a of f.apis ?? []) if ((a.platform === pl || sharedSourceSet(a.file)) && anchors.has(a.symbol)) apis.add(a.method + ' ' + a.path);
      c.testids = sortedKeys(tids);
      c.apis = sortedKeys(apis);
      row.platforms[pl] = c;
    }
    const unionT = new Set<string>(), unionA = new Set<string>();
    for (const c of Object.values(row.platforms)) {
      c.testids.forEach((t) => unionT.add(t));
      c.apis.forEach((a) => unionA.add(a));
    }
    for (const pl of platforms) {
      const c = row.platforms[pl]!;
      if (!c.route) {
        row.missing_route.push(pl);
        p.gaps++;
        continue;
      }
      const mt = [...unionT].filter((x) => !c.testids.includes(x)).sort(cmpStr);
      if (mt.length) {
        row.missing_testids[pl] = mt;
        p.gaps += mt.length;
      }
      const ma = [...unionA].filter((x) => !c.apis.includes(x)).sort(cmpStr);
      if (ma.length) {
        row.missing_apis[pl] = ma;
        p.gaps += ma.length;
      }
    }
    row.platforms = sortRec(row.platforms);
    row.missing_testids = sortRec(row.missing_testids);
    row.missing_apis = sortRec(row.missing_apis);
    p.features.push(row);
  }
  const byName = new Map<string, Record<string, { value: string; symbol: string }>>();
  for (const s of g.symbols) {
    if (!s.value || s.value === '[]' || s.value === '""' || (s.kind !== 'property' && s.kind !== 'const')) continue;
    const n = snake(s.name);
    let m = byName.get(n);
    if (!m) {
      m = {};
      byName.set(n, m);
    }
    if (!(s.platform in m)) m[s.platform] = { value: s.value, symbol: s.id };
  }
  for (const [n, vals] of byName) {
    if (Object.keys(vals).length < 2) continue;
    if (new Set(Object.values(vals).map((v) => v.value)).size > 1) {
      p.constant_diffs.push({ name: n, values: sortRec(vals) });
      p.gaps++;
    }
  }
  p.constant_diffs.sort((a, b) => cmpStr(a.name, b.name));
  return p;
}

export function renderParity(p: Parity): string {
  let b = '---\nid: parity\ntitle: 三端一致性（parity）\nkind: parity\ngenerated: true\n---\n';
  b += GeneratedMarker + '\n\n# 三端一致性矩阵\n\n';
  b += `由 \`kb parity\` 根据 facts 与符号图生成：每个功能（route_id）在各平台是否实现了路由、testID 与接口，以及同名常量在各平台的取值差异。共 **${p.gaps}** 处差异。\n\n`;
  b += '| route_id | ' + p.platforms.join(' | ') + ' |\n|---|' + '---|'.repeat(p.platforms.length) + '\n';
  for (const r of p.features) {
    const cells = p.platforms.map((pl) => {
      const c = r.platforms[pl]!;
      if (!c.route) return '✗ 无路由';
      const mark = (r.missing_testids[pl]?.length ?? 0) + (r.missing_apis[pl]?.length ?? 0) > 0 ? '⚠' : '✓';
      return `${mark} ${c.testids.length} tid / ${c.apis.length} api`;
    });
    b += `| \`${r.route_id}\` | ${cells.join(' | ')} |\n`;
  }
  b += '\n## 缺口\n\n';
  let n = 0;
  for (const r of p.features) {
    if (r.missing_route.length) {
      b += `- \`${r.route_id}\`：${r.missing_route.join('、')} 缺少该路由\n`;
      n++;
    }
    for (const pl of p.platforms) {
      const mt = r.missing_testids[pl];
      if (mt?.length) {
        b += `- \`${r.route_id}\`：${pl} 缺少 testID \`${mt.join('`, `')}\`\n`;
        n++;
      }
      const ma = r.missing_apis[pl];
      if (ma?.length) {
        b += `- \`${r.route_id}\`：${pl} 的功能锚点中未调用 \`${ma.join('`, `')}\`\n`;
        n++;
      }
    }
  }
  if (n === 0) b += '（无）\n';
  b += '\n## 跨平台常量差异\n\n';
  if (p.constant_diffs.length === 0) b += '（无）\n';
  else {
    b += '| 常量 | ' + p.platforms.join(' | ') + ' |\n|---|' + '---|'.repeat(p.platforms.length) + '\n';
    for (const c of p.constant_diffs) b += `| \`${c.name}\` | ${p.platforms.map((pl) => (c.values[pl] ? `\`${c.values[pl]!.value}\`` : '—')).join(' | ')} |\n`;
    b += '\n符号：\n\n';
    for (const c of p.constant_diffs) for (const pl of p.platforms) if (c.values[pl]) b += `- \`${c.values[pl]!.symbol}\` (${pl}) = \`${c.values[pl]!.value}\`\n`;
  }
  b += '\n相关：功能页见 index.md · `kb lint-tid` · `kb parity --json`\n';
  return b;
}
