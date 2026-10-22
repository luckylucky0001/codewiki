// Synthetic graphs and repositories for src/tree tests.
import type { Graph, Symbol as GraphSymbol } from '../../src/model.js';

export interface SymSpec {
  file: string;
  name: string;
  kind?: string;
  refs?: string[];
  signature?: string;
  parent?: string;
  line?: number;
  platform?: string;
}

export function symId(s: { file: string; name: string; platform?: string }): string {
  return `${s.platform ?? 'android'}://${s.file}#${s.name}`;
}

/** Builds a graph; refs are symbol names resolved within the spec (first match). */
export function makeGraph(specs: SymSpec[], imports: Record<string, string[]> = {}): Graph {
  const byName = new Map<string, string>();
  for (const s of specs) if (!byName.has(s.name)) byName.set(s.name, symId(s));
  const lines = new Map<string, number>();
  const symbols: GraphSymbol[] = specs.map((s) => {
    const start = s.line ?? (lines.get(s.file) ?? 0) + 1;
    lines.set(s.file, start + 9);
    const sym: GraphSymbol = {
      id: symId(s),
      platform: s.platform ?? 'android',
      lang: 'kotlin',
      kind: s.kind ?? 'class',
      name: s.name.split('.').pop()!,
      qual: s.name,
      file: s.file,
      start_line: start,
      end_line: start + 8,
      signature: s.signature ?? `class ${s.name}`,
      hash: 'h-' + s.name,
      sig_hash: 's-' + s.name,
      norm_hash: 'n-' + s.name,
      simhash: '0',
    };
    if (s.parent) sym.parent = symId({ file: s.file, name: s.parent, platform: s.platform });
    const refs = (s.refs ?? []).map((r) => byName.get(r)).filter((x): x is string => !!x);
    if (refs.length) sym.refs = refs;
    return sym;
  });
  const files: Graph['files'] = {};
  for (const s of symbols) {
    const f = (files[s.file] ??= { platform: s.platform, lang: s.lang, hash: 'f', symbols: 0 });
    f.symbols++;
  }
  for (const [f, xs] of Object.entries(imports)) if (files[f]) files[f]!.imports = xs;
  return { version: 1, symbols, files, parse_failures: [] };
}

/** `groups` feature groups of `size` classes each, densely linked inside, one link between neighbors. */
export function featureModule(dirRoot: string, groups: string[], size: number): SymSpec[] {
  const specs: SymSpec[] = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < size; i++) {
      const name = `${cap(g)}${i}`;
      const refs: string[] = [];
      for (let j = 0; j < size; j++) if (j !== i && (j === (i + 1) % size || j === (i + 2) % size || j === (i + 5) % size)) refs.push(`${cap(g)}${j}`);
      if (i === 0 && gi > 0) refs.push(`${cap(groups[gi - 1]!)}0`);
      specs.push({ file: `${dirRoot}/${g}/${name}.kt`, name, refs });
    }
  });
  return specs;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const gradleRepo: Record<string, string> = {
  'settings.gradle.kts': `
rootProject.name = "MiniShop"
// include(":commented")
include(":app")
include(
    ":core:net",
    ":feature:cart",
)
include(":legacy")
project(":legacy").projectDir = file("old/legacy-module")
`,
  'app/build.gradle.kts': `plugins { id("com.android.application") }\ndependencies { implementation(project(":feature:cart")); implementation(projects.core.net) }`,
  'core/net/build.gradle.kts': `plugins { id("com.android.library") }`,
  'feature/cart/build.gradle.kts': `plugins { alias(libs.plugins.android.library) }\ndependencies { api(project(":core:net")) }`,
  'old/legacy-module/build.gradle': `apply plugin: 'java-library'`,
};

export const swiftPackage = `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "Shop",
  products: [.library(name: "Shop", targets: ["Cart"])],
  dependencies: [.package(url: "https://github.com/x/y", from: "1.0.0")],
  targets: [
    .target(name: "Core", dependencies: [.product(name: "Y", package: "y")]),
    .target(
      name: "Cart",
      dependencies: ["Core", .target(name: "Net")],
      path: "Sources/CartFeature"
    ),
    .target(name: "Net"),
    .executableTarget(name: "Tool", dependencies: ["Core"]),
    .testTarget(name: "CartTests", dependencies: ["Cart"]),
  ]
)
`;

export const harmonyRepo: Record<string, string> = {
  'build-profile.json5': `{
  // app config
  app: { signingConfigs: [], products: [{ name: 'default' }] },
  "modules": [
    { "name": "entry", "srcPath": "./product/entry", targets: [{ name: 'default', applyToProducts: ['default'] }] },
    { name: 'cart', srcPath: './feature/cart', },
    { name: "common", "srcPath": "./common/utils" },
    { name: "dyn", srcPath: "./feature/dyn" },
  ],
}`,
  'product/entry/src/main/module.json5': `{ module: { name: 'entry', type: 'entry', /* c */ deviceTypes: ['phone'] } }`,
  'product/entry/oh-package.json5': `{ dependencies: { "@shop/cart": "file:../../feature/cart", "@ohos/axios": "^2.0.0" } }`,
  'feature/cart/src/main/module.json5': `{ "module": { "name": "cart", "type": "har" } }`,
  'feature/cart/oh-package.json5': `{ "dependencies": { "@shop/common": "file:../../common/utils" } }`,
  'common/utils/src/main/module.json5': `{ "module": { "name": "common", "type": "shared" } }`,
  'feature/dyn/src/main/module.json5': `{ "module": { "name": "dyn", "type": "feature" } }`,
  'feature/dyn/build-profile.json5': `{ apiType: 'stageMode', buildOption: {} }`,
};

export const pbxproj = `// !$*UTF8*$!
{
	archiveVersion = 1;
	objects = {
		F1 /* AppDelegate.swift */ = {isa = PBXFileReference; path = AppDelegate.swift; sourceTree = "<group>"; };
		F2 /* CartView.swift */ = {isa = PBXFileReference; path = CartView.swift; sourceTree = "<group>"; };
		F3 /* WidgetMain.swift */ = {isa = PBXFileReference; path = "WidgetMain.swift"; sourceTree = "<group>"; };
		B1 = {isa = PBXBuildFile; fileRef = F1; };
		B2 = {isa = PBXBuildFile; fileRef = F2; };
		B3 = {isa = PBXBuildFile; fileRef = F3; };
		G0 = {isa = PBXGroup; children = (G1, G2, G3); sourceTree = "<group>"; };
		G1 /* Shop */ = {isa = PBXGroup; children = (F1, G4); path = Shop; sourceTree = "<group>"; };
		G4 /* Cart */ = {isa = PBXGroup; children = (F2); path = Features/Cart; sourceTree = "<group>"; };
		G2 /* Widget */ = {isa = PBXGroup; children = (F3); path = Widget; sourceTree = "<group>"; };
		G3 = {isa = PBXFileSystemSynchronizedRootGroup; path = ShopKit; sourceTree = "<group>"; };
		P1 = {isa = PBXSourcesBuildPhase; files = (B1, B2); };
		P2 = {isa = PBXSourcesBuildPhase; files = (B3, ); };
		T1 /* Shop */ = {isa = PBXNativeTarget; buildPhases = (P1); dependencies = (D1); name = Shop; productType = "com.apple.product-type.application"; };
		T2 /* ShopWidget */ = {isa = PBXNativeTarget; buildPhases = (P2); dependencies = (); name = ShopWidget; productType = "com.apple.product-type.app-extension"; };
		T3 /* ShopKit */ = {isa = PBXNativeTarget; buildPhases = (); fileSystemSynchronizedGroups = (G3); name = ShopKit; productType = "com.apple.product-type.framework"; };
		D1 = {isa = PBXTargetDependency; target = T2; };
		R0 = {isa = PBXProject; mainGroup = G0; targets = (T1, T2, T3); };
	};
	rootObject = R0;
}
`;
