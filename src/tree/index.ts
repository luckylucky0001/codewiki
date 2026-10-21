// Public API of the hierarchical wiki tree (design-v2 §2). See docs/tree.md.
export * from './types.js';
export { detectProjects, fsSource, memorySource, DefaultSkipDirs } from './build/detect.js';
export { parseGradleSettings, parseGradleDeps, gradlePathToDir, detectGradle } from './build/gradle.js';
export { parsePackageSwift, detectSwiftPM } from './build/swiftpm.js';
export { parsePbxproj, detectXcode } from './build/xcode.js';
export { detectHvigor, harmonyModuleType, isHvigorProject } from './build/hvigor.js';
export { parseJSON5, parseOpenStep } from './build/parse.js';
export { layer, heuristicModuleDir, type Layering, type LayerModule, type LayerProject } from './layer.js';
export { buildCoreGraph, selectCore, pageRank, edgeKey, type CoreGraph } from './cluster/symgraph.js';
export { leiden, makeGraph, modularity, type WGraph } from './cluster/leiden.js';
export { partitionModule, clusterId, membersHash, matchPrev, defaultSlug, slugCandidates, type PrevCluster } from './cluster/cluster.js';
export {
  buildTree,
  prepare,
  resolveConfig,
  serializeTree,
  parseTree,
  walk,
  findNode,
  ancestors,
  explain,
  treeStats,
  updateDigests,
  fileTokens,
  type BuildContext,
  type TreeStats,
} from './tree.js';
export { repairTree, deltaFromGraphs, type RepairOptions } from './repair.js';
export { validatePatch, applyPatch } from './patch.js';
export {
  kbBlock,
  upsertKbBlock,
  readKbBlock,
  relLink,
  renderBreadcrumb,
  renderIndex,
  renderIndexes,
  renderLlmsTxt,
  moduleDependencyDiagram,
  projectDiagram,
  clusterDiagram,
  navigationDiagram,
  diagramBlock,
  diagramFresh,
  nodeDiagrams,
  mermaidId,
  GeneratedHeader,
} from './render.js';
export { nmi, ari, treeLabels, treeNMI, idRetention } from './nmi.js';
