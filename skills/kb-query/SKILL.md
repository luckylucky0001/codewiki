---
name: kb-query
description: Answer questions about the app (features, routes, deep links, testIDs, HTTP APIs, cross-platform differences) and gather context before editing code, using the code-anchored codewiki LLM Wiki via `kb search`, `kb get`, `kb context <file>` and facts/*.json. Use before modifying a source file, when asked "where/how is X implemented on Android/iOS/HarmonyOS", or when another agent (e.g. an e2e test generator) needs routes/testids/apis.
---

# kb-query

The wiki is cheaper and more reliable than re-reading the whole repo: every page is anchored
to symbol hashes that CI verifies against HEAD.

## Recipes

```bash
kb status --json                 # first: are pages current? (exit 1 = some are stale)
kb search "购物车 上限" --json     # pages + symbols ranked
kb get features/cart             # full page (frontmatter + body)
kb context android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt --json
kb anchor '<symbol-id>'          # current hash of a symbol
```

Machine-readable facts (schema v1, shared with e2epilot):

- `wiki/facts/routes.json` — `platform, route_id, pattern, deeplink, file, symbol`
- `wiki/facts/testids.json` — `platform, tid, route_id, file, line` (dynamic ids by prefix, e.g. `product_item_`)
- `wiki/facts/apis.json` — `platform, method, path, file, symbol`
- `wiki/facts/requirements.json` — requirement → anchors / route_ids traceability

## Rules

- Trust order: code > `facts/` > `pages/` > `raw/docs/` (raw docs may be wrong; see `pages/_conflicts.md`).
- If a page you rely on is listed by `kb status`, read the anchored symbols' current code instead.
- Before editing a file run `kb context <file>`: it lists the pages that will be re-checked.
- Cite symbol ids when answering so the user can jump to code.
