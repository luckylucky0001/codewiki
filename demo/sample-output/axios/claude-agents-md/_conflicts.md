---
id: _conflicts
title: 文档核对（冲突与已验证断言）
kind: conflicts
sources:
  - sym: web://lib/adapters/fetch.js#factory
    hash: 15552026d9c25e8cd28834e3f5356449fae83dca71eab4c7c9990c1a88702719
  - sym: web://lib/axios.js#axios
    hash: bb6ce17929b79b9f00533f9e69d23c9629e510471232541fb551959b306815a5
  - sym: web://lib/cancel/CancelToken.js#CancelToken
    hash: 168b9df9eae9e6977c3804072522a82aaf21385b850ff1aafd613bde86ac4c97
  - sym: web://lib/core/Axios.js#Axios
    hash: 0704f06b6b76a023ac3b90ee1f784322eea80f95ed126fde1dc29d02fcd617e5
  - sym: web://lib/core/Axios.js#validators
    hash: e739d4af771b6344280dbc74586eefcbda75cb0e8527aa25b0764ec3ccf33862
  - sym: web://lib/core/AxiosError.js#AxiosError
    hash: 437c478ee7a77cdf78fd3b8fafb41b4173628d1e1b5b42bca5ac18424222ee1a
  - sym: web://lib/core/AxiosError.js#AxiosError.constructor
    hash: 8e236cf89bb5314ab25f718e939dee97773931a2f0a8683ab00da21777ec11f4
  - sym: web://lib/core/AxiosError.js#AxiosError.from
    hash: 35c3cc88f1e0d91647f27c56d5b88274069edce172a536f7334b0336288ca2c2
  - sym: web://lib/core/AxiosHeaders.js#$internals
    hash: 53816992e184cdb27471ee07128802646c7926c77175daeb70ceb70a70d6dc7f
  - sym: web://lib/core/AxiosHeaders.js#AxiosHeaders
    hash: 25fa6337f7e0e792c64b42da8610ed4132f4f5edbefaab575906049fea427826
  - sym: web://lib/core/InterceptorManager.js#$internals
    hash: 53816992e184cdb27471ee07128802646c7926c77175daeb70ceb70a70d6dc7f
  - sym: web://lib/core/InterceptorManager.js#InterceptorManager
    hash: 0ca165c0bd49bff856fe8246a6d517d9ddf7529b7ebb3b55c2cc1209196d9eba
  - sym: web://lib/core/dispatchRequest.js#dispatchRequest
    hash: c6b2a6d9fb20d9f6e7d50aacd1bc33a79824f7af1626023dfe28cd2c2173570e
  - sym: web://lib/core/mergeConfig.js#mergeConfig
    hash: 8a692d24fff7e4bcf2e6fbc1575aefdde1cab29a02ef5d135198e3f2e082c839
  - sym: web://lib/core/settle.js#settle
    hash: 710896ae6a15c0e6504fdbef5dc6a019dd085093e505818bd0368a13eb0a3606
  - sym: web://lib/defaults/index.js#defaults
    hash: 89fc4b949eabe910dd05c965b5863918a1667a9cada200cc02737488e5cef3b9
  - sym: web://lib/defaults/index.js#own
    hash: 9130494e77a76d665b0dd84859441fecab33dcbd62d05790b2f2568d79321507
  - sym: web://lib/helpers/bind.js#bind
    hash: 093a5e31a4c3a0b98eb75580e9913a0684024255a26ddc6e865dc8c89ccd5eff
  - sym: web://lib/helpers/buildURL.js#buildURL
    hash: f3d3ff4a833545d0e50270cf6b291f9cb5c0759f614e897f4e9ddbf5eda4adb2
  - sym: web://lib/helpers/composeSignals.js#composeSignals
    hash: 7e64f35e7d008badc82e83df270c4f34b7cad5610855329311903cd1e91b6dc5
  - sym: web://lib/helpers/resolveConfig.js#resolveConfig
    hash: 0334d8e1980b55af0a0c80c17b020cd19435295899b3f3ecf6cdbd29359b6b6f
source_commit: 56a5f1a
status: current
---
# 文档核对：冲突与已验证断言

> 代码为准（code wins）。本页由 `kb ingest` / `kb compound` 根据 `raw/docs/` 中的文档逐条核对生成；机器可读版本见 [facts/requirements.json](../facts/requirements.json)。

| 状态 | 数量 |
|---|---|
| conflict（与代码冲突） | 3 |
| verified（有代码锚点） | 23 |
| unverifiable（无证据，不提升为知识） | 22 |

## 冲突 conflicts（文档已过时，以代码为准）

- **AGENTS-613914** （[AGENTS.md](../raw/docs/AGENTS.md) L56）Throw `AxiosError` for axios-originated failures; never raw `Error`. Pass `(message, code, config, request, response)` so consumers can introspect.
  - 证据：[llm] AxiosError 构造函数签名为 (message, code, config, request, response)，但库中仍有 raw Error：lib/helpers/toFormData.js 抛 new Error('Circular reference detected')，lib/helpers/formDataToStream.js 抛 new Error('boundary must be 1-70 characters long')，CancelToken 构造函数抛 TypeError；符号 `AxiosError` 存在（1 处）；`Error` 出现在代码中（web://lib/core/AxiosError.js#AxiosError.from）；字面量 `(message, code, config, request, response)` 出现在 web://lib/core/AxiosError.js#AxiosError.constructor
- **AGENTS-0eb273** （[AGENTS.md](../raw/docs/AGENTS.md) L90）Do not use `Function.prototype.bind` directly — use `lib/helpers/bind.js`, which forwards `arguments` via `apply` and is what the rest of the library relies on.
  - 证据：[llm] helpers/bind 存在，但 lib/core/Axios.js 使用 dispatchRequest.bind(this)，lib/utils.js 使用 queueMicrotask.bind(_global)，lib/adapters/http.js 使用 process.nextTick.bind(process)，即库内仍直接使用原生 bind；`Function.prototype.bind` 在代码中找不到（无法确定性判断）；文件 `lib/helpers/bind.js` 存在（lib/helpers/bind.js）；`arguments` 出现在代码中（web://lib/helpers/bind.js#bind）；`apply` 出现在代码中（web://lib/helpers/bind.js#bind）
- **AGENTS-7b13e1** （[AGENTS.md](../raw/docs/AGENTS.md) L91）Do not throw raw `Error` from library code; use `AxiosError` with an appropriate code (see Error Handling).
  - 证据：[llm] lib/helpers/toFormData.js 与 lib/helpers/formDataToStream.js 仍抛出 raw Error，CancelToken 抛出 TypeError；`Error` 出现在代码中（web://lib/core/AxiosError.js#AxiosError.from）；符号 `AxiosError` 存在（1 处）

## 已验证 verified

- **AGENTS-d61cd0** （[AGENTS.md](../raw/docs/AGENTS.md) L27）Source is ESM (`type: module`); public ESM entry is `index.js`, which re-exports the default instance from `lib/axios.js`.
  - 证据：[llm] index.js 与 lib/axios.js 存在，lib/axios.js 导出 createInstance(defaults) 创建的默认实例；文件 `index.js` 存在（index.js）；文件 `lib/axios.js` 存在（lib/axios.js）
- **AGENTS-72c10f** （[AGENTS.md](../raw/docs/AGENTS.md) L41）`lib/core/` is axios domain logic: request dispatch, config merge, interceptors, headers, errors. Key classes: `Axios` (request dispatch + interceptor chains), `AxiosError` (standardized error codes), `AxiosHeaders` (case-insensitive header normalization), `InterceptorManager` (sync/async interceptor registration).
  - 证据：[llm] 四个类均位于 lib/core/；符号 `Axios` 存在（1 处）；符号 `AxiosError` 存在（1 处）；符号 `AxiosHeaders` 存在（1 处）；符号 `InterceptorManager` 存在（1 处）
- **AGENTS-6f63ca** （[AGENTS.md](../raw/docs/AGENTS.md) L42）`lib/adapters/` performs I/O; default adapter preference is `['xhr', 'http', 'fetch']`, with capability selection in `lib/adapters/adapters.js`. Detect by capability, not environment name.
  - 证据：[llm] defaults.adapter 为 ['xhr','http','fetch']；字面量 `['xhr', 'http', 'fetch']` 出现在 web://lib/defaults/index.js#defaults；文件 `lib/adapters/adapters.js` 存在（lib/adapters/adapters.js）
- **AGENTS-5df2af** （[AGENTS.md](../raw/docs/AGENTS.md) L45）New `lib//*.js` files should match existing source style: ESM imports with explicit `.js` extensions, `'use strict';` where current library files use it, and `AxiosError` for axios-originated failures.
  - 证据：[llm] lib/helpers 等文件以 import AxiosError from '../core/AxiosError.js' 使用显式 .js 扩展；符号 `AxiosError` 存在（1 处）
- **AGENTS-289a41** （[AGENTS.md](../raw/docs/AGENTS.md) L49）Classes: PascalCase (`Axios`, `AxiosError`, `InterceptorManager`).
  - 证据：[llm] 类名均为 PascalCase；符号 `Axios` 存在（1 处）；符号 `AxiosError` 存在（1 处）；符号 `InterceptorManager` 存在（1 处）
- **AGENTS-40dc97** （[AGENTS.md](../raw/docs/AGENTS.md) L50）Functions: camelCase (`buildURL`, `mergeConfig`, `dispatchRequest`).
  - 证据：[llm] 函数名均为 camelCase；符号 `buildURL` 存在（1 处）；符号 `mergeConfig` 存在（1 处）；符号 `dispatchRequest` 存在（1 处）
- **AGENTS-0ccff1** （[AGENTS.md](../raw/docs/AGENTS.md) L51）Error codes: UPPER_SNAKE_CASE constants on `AxiosError` (`ERR_NETWORK`, `ETIMEDOUT`).
  - 证据：[llm] AxiosError 上以静态 UPPER_SNAKE_CASE 常量定义错误码；符号 `AxiosError` 存在（1 处）；`ERR_NETWORK` 出现在代码中（web://lib/adapters/fetch.js#factory）；`ETIMEDOUT` 出现在代码中（web://lib/helpers/composeSignals.js#composeSignals）
- **AGENTS-0fa2f6** （[AGENTS.md](../raw/docs/AGENTS.md) L52）Internal class slots: `Symbol`-keyed (e.g. `const $internals = Symbol('internals')` in `lib/core/AxiosHeaders.js`) rather than underscore-prefixed properties.
  - 证据：[llm] const $internals = Symbol('internals') 存在；`Symbol` 出现在代码中（web://lib/adapters/http.js#kAxiosCurrentReq）；字面量 `const $internals = Symbol('internals')` 出现在 web://lib/core/AxiosHeaders.js#$internals, web://lib/core/InterceptorManager.js#$internals；文件 `lib/core/AxiosHeaders.js` 存在（lib/core/AxiosHeaders.js）
- **AGENTS-317f2f** （[AGENTS.md](../raw/docs/AGENTS.md) L57）Wrap third-party errors with `AxiosError.from(error, code, config, request, response)`.
  - 证据：[llm] AxiosError.from(error, code, config, request, response, customProps) 存在并包装原始错误；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-89562e** （[AGENTS.md](../raw/docs/AGENTS.md) L58）Canonical code list lives in `lib/core/AxiosError.js`; current codes include `ERR_BAD_OPTION_VALUE`, `ERR_BAD_OPTION`, `ECONNABORTED`, `ETIMEDOUT`, `ECONNREFUSED`, `ERR_NETWORK`, `ERR_FR_TOO_MANY_REDIRECTS`, `ERR_DEPRECATED`, `ERR_BAD_RESPONSE`, `ERR_BAD_REQUEST`, `ERR_CANCELED`, `ERR_NOT_SUPPORT`, `ERR_INVALID_URL`, `ERR_FORM_DATA_DEPTH_EXCEEDED`.
  - 证据：[llm] lib/core/AxiosError.js 定义所列错误码（含 ERR_FR_TOO_MANY_REDIRECTS、ERR_DEPRECATED 静态常量）；文件 `lib/core/AxiosError.js` 存在（lib/core/AxiosError.js）；`ERR_BAD_OPTION_VALUE` 出现在代码中（web://lib/adapters/http.js#resolveFamily）；`ERR_BAD_OPTION` 出现在代码中（web://lib/helpers/validator.js#assertOptions）；`ECONNABORTED` 出现在代码中（web://lib/core/AxiosError.js#AxiosError）；`ETIMEDOUT` 出现在代码中（web://lib/helpers/composeSignals.js#composeSignals）；`ERR_NETWORK` 出现在代码中（web://lib/adapters/fetch.js#factory）；`ERR_FR_TOO_MANY_REDIRECTS` 在代码中找不到（无法确定性判断）；`ERR_DEPRECATED` 在代码中找不到（无法确定性判断）；`ERR_BAD_RESPONSE` 出现在代码中（web://lib/core/settle.js#settle）；`ERR_BAD_REQUEST` 出现在代码中（web://lib/core/settle.js#settle）；`ERR_CANCELED` 出现在代码中（web://lib/cancel/CanceledError.js#CanceledError.constructor）；`ERR_NOT_SUPPORT` 出现在代码中（web://lib/helpers/fromDataURI.js#fromDataURI）；`ERR_INVALID_URL` 出现在代码中（web://lib/core/buildFullPath.js#assertValidHttpProtocolURL）；`ERR_FORM_DATA_DEPTH_EXCEEDED` 出现在代码中（web://lib/helpers/formDataToJSON.js#throwIfDepthExceeded）
- **AGENTS-d986b4** （[AGENTS.md](../raw/docs/AGENTS.md) L59）Validate config options through the `validator` helper; do not invent ad-hoc validation paths.
  - 证据：[llm] Axios.js 使用 validator.assertOptions 校验 transitional 等选项；`validator` 出现在代码中（web://lib/core/Axios.js#validators）
- **AGENTS-0a0642** （[AGENTS.md](../raw/docs/AGENTS.md) L65）Both support `synchronous: true` (avoids Promise wrapping when no async handler is in the chain) and `runWhen: (config) => boolean` for conditional execution.
  - 证据：[llm] InterceptorManager.use 存储 synchronous 与 runWhen；Axios._request 检查 runWhen(config) === false 及 synchronous；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-d33ea4** （[AGENTS.md](../raw/docs/AGENTS.md) L70）User calls `axios()` or a method alias.
  - 证据：[llm] axios 为 createInstance(defaults) 返回的可调用实例；符号 `axios()` 存在（1 处）
- **AGENTS-21fb52** （[AGENTS.md](../raw/docs/AGENTS.md) L71）Merge instance defaults with request config via `mergeConfig`.
  - 证据：[llm] Axios._request 调用 mergeConfig(this.defaults, config)；符号 `mergeConfig` 存在（1 处）
- **AGENTS-e10b4c** （[AGENTS.md](../raw/docs/AGENTS.md) L73）Select adapter via `lib/adapters/adapters.js` capability check.
  - 证据：[llm] dispatchRequest 调用 adapters.getAdapter(config.adapter || defaults.adapter, config)；文件 `lib/adapters/adapters.js` 存在（lib/adapters/adapters.js）
- **AGENTS-0319f8** （[AGENTS.md](../raw/docs/AGENTS.md) L74）Apply `transformRequest` functions.
  - 证据：[llm] dispatchRequest 对 config.transformRequest 调用 transformData；`transformRequest` 出现在代码中（web://lib/core/dispatchRequest.js#dispatchRequest）
- **AGENTS-d55a37** （[AGENTS.md](../raw/docs/AGENTS.md) L76）Apply `transformResponse` functions.
  - 证据：[llm] dispatchRequest 在适配器成功/失败时应用 config.transformResponse；`transformResponse` 出现在代码中（web://lib/core/dispatchRequest.js#dispatchRequest）
- **AGENTS-94eed0** （[AGENTS.md](../raw/docs/AGENTS.md) L78）Resolve promise with `AxiosResponse` or reject with `AxiosError`.
  - 证据：[llm] settle 成功时 resolve(response)，否则 reject AxiosError；`AxiosResponse` 在代码中找不到（无法确定性判断）；符号 `AxiosError` 存在（1 处）
- **AGENTS-eb7f10** （[AGENTS.md](../raw/docs/AGENTS.md) L82）Both `CancelToken` (legacy) and `AbortSignal` (modern) are supported simultaneously; do not break either path.
  - 证据：[llm] CancelToken 类存在，composeSignals 处理 AbortSignal 列表；符号 `CancelToken` 存在（1 处）；`AbortSignal` 在代码中找不到（无法确定性判断）
- **AGENTS-e62e39** （[AGENTS.md](../raw/docs/AGENTS.md) L103）For config reads that affect behavior, do not use prototype-walking reads (`in`, destructuring, or direct `config.foo` on untrusted config); guard with own-property checks as in `utils.hasOwnProp` / local `own()` helpers.
  - 证据：[llm] own(obj,key) 使用 utils.hasOwnProp 做自有属性检查；`config.foo` 在代码中找不到（无法确定性判断）；`utils.hasOwnProp` 出现在代码中（web://lib/defaults/index.js#own）；符号 `own()` 存在（1 处）
- **AGENTS-27dbbf** （[AGENTS.md](../raw/docs/AGENTS.md) L104）New merge or object materialization code must continue filtering `proto`, `constructor`, and `prototype`; regressions here are security bugs.
  - 证据：[llm] lib/utils.js 过滤 __proto__/constructor/prototype；mergeConfig 使用 null 原型对象；`proto` 出现在代码中（web://lib/utils.js#isFormData）；符号 `constructor` 存在（9 处）；符号 `prototype` 存在（1 处）
- **AGENTS-acf768** （[AGENTS.md](../raw/docs/AGENTS.md) L106）Keep `withXSRFToken` cross-origin behavior explicit: only `true` forces cross-origin XSRF header attachment.
  - 证据：[llm] resolveConfig 以严格 withXSRFToken === true 判断跨域附带 XSRF 头；`withXSRFToken` 出现在代码中（web://lib/helpers/resolveConfig.js#resolveConfig）；`true` 出现在代码中（web://lib/utils.js#isBoolean）
- **AGENTS-c1cd42** （[AGENTS.md](../raw/docs/AGENTS.md) L107）Do not weaken `beforeRedirect`, proxy, or `socketPath` safeguards without tests covering credential leakage or SSRF-style cases.
  - 证据：[llm] mergeConfig 处理 beforeRedirect 与 socketPath 配置；`beforeRedirect` 出现在代码中（web://lib/core/mergeConfig.js#mergeConfig）；`socketPath` 出现在代码中（web://lib/core/mergeConfig.js#mergeConfig）

## 无法验证 unverifiable

- **AGENTS-a63cdd** （[AGENTS.md](../raw/docs/AGENTS.md) L9）Use `npm ci`; repo `.npmrc` sets `ignore-scripts=true`, and CI also uses `npm ci --ignore-scripts`.
  - 证据：[llm] 根目录 .npmrc 含 ignore-scripts=true；CI workflow 使用 npm ci --ignore-scripts；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-e7ae6f** （[AGENTS.md](../raw/docs/AGENTS.md) L10）Do not remove `ignore-scripts=true`; if git hooks are needed after a fresh install, run `npm rebuild husky && npx husky` once.
  - 证据：[llm] package.json 的 prepare 脚本为 husky，.npmrc 设置 ignore-scripts=true，与描述一致；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-1e2396** （[AGENTS.md](../raw/docs/AGENTS.md) L11）Adding or updating dependencies is security-sensitive; `package-lock.json` is checked by `lockfile-lint` for npm HTTPS hosts and integrity hashes.
  - 证据：[llm] package-lock.json 存在，但 lockfile-lint 未在所给事实中确认；文件 `package-lock.json` 存在（docs/package-lock.json）
- **AGENTS-a53a81** （[AGENTS.md](../raw/docs/AGENTS.md) L13）Build/test/lint tools still execute dependency code despite `ignore-scripts`; avoid unnecessary full builds when a focused check proves the change.
  - 证据：[llm] 开发流程建议，无代码证据；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-0daf13** （[AGENTS.md](../raw/docs/AGENTS.md) L18）Build published artifacts: `npm run build` (`gulp clear` deletes `dist/`, then Rollup writes browser ESM/UMD/CJS and Node CJS bundles).
  - 证据：[llm] package.json: build = gulp clear && cross-env NODE_ENV=production rollup -c；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-ac2769** （[AGENTS.md](../raw/docs/AGENTS.md) L19）Lint source only: `npm run lint`; focused lint: `npx eslint lib/path/to/file.js`.
  - 证据：[llm] package.json: lint = eslint lib/**/*.js；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-a67657** （[AGENTS.md](../raw/docs/AGENTS.md) L20）Unit tests: `npm run test:vitest:unit`; focused unit test: `npm run test:vitest:unit -- tests/unit/path.test.js`.
  - 证据：[llm] package.json: test:vitest:unit = vitest run --project unit；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-628e09** （[AGENTS.md](../raw/docs/AGENTS.md) L21）Browser tests need Playwright installed first (`npx playwright install` locally; CI uses `npx playwright install --with-deps`); run `npm run test:vitest:browser:headless` for CI parity.
  - 证据：[llm] package.json 有 test:vitest:browser:headless；release-branch.yml 使用 npx playwright install --with-deps；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-45fc50** （[AGENTS.md](../raw/docs/AGENTS.md) L22）Smoke/module compatibility suites test the packed package, not the source tree: run `npm run build`, `npm pack`, install the tarball into the relevant `tests/smoke/*` or `tests/module/*` package, then run that suite's npm script.
  - 证据：[llm] tests/smoke 与 tests/module 目录存在，但打包安装流程未在给定事实中确认；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-f66160** （[AGENTS.md](../raw/docs/AGENTS.md) L28）Do not edit `dist/` by hand; it is ignored and generated from `lib/` by Rollup.
  - 证据：[llm] 无法由给定符号确认 dist/ 的忽略与生成关系；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-9fd788** （[AGENTS.md](../raw/docs/AGENTS.md) L29）Runtime package exports are split by environment: browser/react-native map Node HTTP/platform files to browser/null replacements, while Node CJS ships as `dist/node/axios.cjs`.
  - 证据：[llm] package.json browser 字段将 ./dist/node/axios.cjs 映射到 ./dist/browser/axios.cjs，lib/platform/node/index.js 映射到 lib/platform/browser/index.js；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-74b3c2** （[AGENTS.md](../raw/docs/AGENTS.md) L30）Keep public runtime exports, `index.d.ts` (ESM types), and `index.d.cts` (CJS `export = axios` types) in sync for API changes.
  - 证据：[llm] index.d.ts 与 index.d.cts 均存在；文件 `index.d.ts` 存在（index.d.ts）；`index.d.cts` 在代码中找不到（无法确定性判断）
- **AGENTS-4715f9** （[AGENTS.md](../raw/docs/AGENTS.md) L31）`lib/env/data.js` is version-generated by `gulp version`; do not edit it for normal feature work.
  - 证据：[llm] lib/env/data.js 存在，但由 gulp version 生成无符号证据；文件 `lib/env/data.js` 存在（lib/env/data.js）
- **AGENTS-f5d9b1** （[AGENTS.md](../raw/docs/AGENTS.md) L35）Add user-visible unreleased changes to `PRE_RELEASE_CHANGELOG.md`, not `CHANGELOG.md`. `CHANGELOG.md` is release-owned and should only be updated as part of preparing an actual release.
  - 证据：[llm] PRE_RELEASE_CHANGELOG.md 与 CHANGELOG.md 均存在；文件 `PRE_RELEASE_CHANGELOG.md` 存在（PRE_RELEASE_CHANGELOG.md）；文件 `CHANGELOG.md` 存在（CHANGELOG.md）；文件 `CHANGELOG.md` 存在（CHANGELOG.md）
- **AGENTS-1579d3** （[AGENTS.md](../raw/docs/AGENTS.md) L36）Track deferred README, docs site, examples, migration guide, and translated docs updates in `PRE_RELEASE_DOCS.md`. Use enough context for release preparation; do not store brittle diffs or line-number-only notes.
  - 证据：[llm] PRE_RELEASE_DOCS.md 存在；文件 `PRE_RELEASE_DOCS.md` 存在（PRE_RELEASE_DOCS.md）
- **AGENTS-c12108** （[AGENTS.md](../raw/docs/AGENTS.md) L37）Do not update `README.md` or the docs site for unreleased runtime/API changes unless the task is explicitly release preparation. During feature/fix work, record what docs need to say in `PRE_RELEASE_DOCS.md` so it can be applied during release work.
  - 证据：[llm] README.md 与 PRE_RELEASE_DOCS.md 存在；文件 `README.md` 存在（README.md）；文件 `PRE_RELEASE_DOCS.md` 存在（PRE_RELEASE_DOCS.md）
- **AGENTS-eb8272** （[AGENTS.md](../raw/docs/AGENTS.md) L43）`lib/platform/` selects Node by default; browser builds rely on package/rollup aliasing to `lib/platform/browser`.
  - 证据：[llm] package.json browser 字段将 lib/platform/node/index.js 别名到 lib/platform/browser/index.js；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-70df2f** （[AGENTS.md](../raw/docs/AGENTS.md) L44）`lib/helpers/` should stay generic and reusable outside axios; do not put axios-specific request lifecycle logic there.
  - 证据：[llm] 设计约定，无法确定性校验；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-55cf19** （[AGENTS.md](../raw/docs/AGENTS.md) L95）Test layout is runtime-first: `tests/unit//*.test.js`, `tests/browser//*.browser.test.js`, `tests/smoke/esm//*.smoke.test.js`, `tests/smoke/cjs//*.smoke.test.cjs`.
  - 证据：[llm] tests 下存在 unit、browser、smoke/esm、smoke/cjs，但文件命名模式未逐一核实（smoke 还有 bun、deno 目录）；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-9d035e** （[AGENTS.md](../raw/docs/AGENTS.md) L96）Use `tests/setup/server.js` for local HTTP servers and cleanup with `try/finally`; leaking servers causes Vitest hangs.
  - 证据：[llm] tests/setup/server.js 存在；文件 `tests/setup/server.js` 存在（tests/setup/server.js）
- **AGENTS-808c26** （[AGENTS.md](../raw/docs/AGENTS.md) L98）Type compatibility is exercised through `tests/module/cjs` with TypeScript 4.9 and `tests/module/esm` with TypeScript 5.x; run the matching module suite for declaration changes.
  - 证据：[llm] tests/module/cjs 与 esm 存在，TypeScript 版本未核实；没有可确定性校验的锚点（需要 LLM 语义核对）
- **AGENTS-c825f1** （[AGENTS.md](../raw/docs/AGENTS.md) L105）Changes touching URL construction, redirects, proxy/env handling, XSRF, socket paths, decompression limits, or adapters should consult `THREATMODEL.md` and add focused regression tests.
  - 证据：[llm] THREATMODEL.md 存在；文件 `THREATMODEL.md` 存在（THREATMODEL.md）
