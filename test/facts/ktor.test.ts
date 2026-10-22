// Ktor client URL-builder DSL recognition, checked on small synthetic snippets written here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { detectedConfig } from '../../src/config/config.js';
import { scan } from '../../src/scan/scan.js';
import { extractFacts, ktorBuilderPaths } from '../../src/facts/facts.js';

const tmps: string[] = [];
afterAll(() => {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
});

async function apisOf(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-ktor-'));
  tmps.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  const cfg = detectedConfig(dir);
  const res = await scan(cfg, cfg.root, {});
  return extractFacts(cfg, res).apis.map((a) => `${a.method} ${a.path}`);
}

describe('ktorBuilderPaths', () => {
  it('path / appendPathSegments with non-literal segments', () => {
    const b = `suspend fun item(id: String) = client.get {
      url { path("v2", "items"); appendPathSegments("detail", id) }
    }`;
    expect(ktorBuilderPaths(b)).toEqual([['v2/items/detail/{id}', 'GET']]);
  });
  it('request with HttpMethod and encodedPath', () => {
    const b = `suspend fun save() = client.request {
      url { encodedPath = "/notes/save" }
      method = HttpMethod.Post
    }`;
    expect(ktorBuilderPaths(b)).toEqual([['notes/save', 'POST']]);
  });
  it('takeFrom(CONST) base stripped to its path', () => {
    const b = `suspend fun list() = httpClient.put {
      url { takeFrom(SERVER); path("tags") }
    }`;
    expect(ktorBuilderPaths(b, new Map([['SERVER', 'https://ex.test/api/']]))).toEqual([['api/tags', 'PUT']]);
  });
  it('url(BASE + "x") inside a post block', () => {
    const b = `suspend fun send(x: X) = client.post { url(BASE_URL + "messages/send"); setBody(x) }`;
    expect(ktorBuilderPaths(b, new Map([['BASE_URL', 'https://ex.test/']]))).toEqual([['messages/send', 'POST']]);
  });
  it('submitForm(url = ...)', () => {
    const b = `suspend fun login(u: String) = client.submitForm(url = "https://ex.test/auth/login", formParameters = parameters { append("u", u) })`;
    expect(ktorBuilderPaths(b)).toEqual([['auth/login', 'POST']]);
  });
  it('ignores non-client receivers and blocks without literal segments', () => {
    expect(ktorBuilderPaths(`fun f() = list.get { it }`)).toEqual([]);
    expect(ktorBuilderPaths(`fun f(p: String) = client.get { url { path(p) } }`)).toEqual([]);
  });
});

describe('Ktor URL builder end to end (KMP commonMain)', () => {
  it('extracts APIs from the URL DSL', async () => {
    const apis = await apisOf({
      'settings.gradle.kts': 'include(":shared")\n',
      'shared/build.gradle.kts': 'kotlin { androidTarget(); iosArm64() }\n',
      'shared/src/commonMain/kotlin/com/ex/Api.kt': `package com.ex

import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.http.*

const val BASE = "https://ex.test/api/"

class Api(private val client: HttpClient) {
    suspend fun item(id: String) = client.get {
        url {
            takeFrom(BASE)
            path("v1", "items", id)
        }
    }

    suspend fun create(body: String) = client.request {
        url { appendPathSegments("v1", "items") }
        method = HttpMethod.Post
        setBody(body)
    }

    suspend fun remove(id: String) = client.delete {
        url(BASE + "v1/items/" + id)
    }

    suspend fun login(u: String) = client.submitForm(url = "https://ex.test/auth/login") {
    }
}
`,
    });
    expect(apis).toEqual(expect.arrayContaining(['GET /api/v1/items/{id}', 'POST /v1/items', 'DELETE /api/v1/items/{id}', 'POST /auth/login']));
  });
  it('resolves constant references in path / appendPathSegments / encodedPath (= and +=)', () => {
    const k = new Map([['NOTIFICATIONS', 'notifications'], ['MainService.NOTIFICATIONS', 'notifications'], ['USERS', '/v1/users'], ['DETAIL', 'detail']]);
    const r = (x: string) => k.get(x) ?? k.get(x.split('.').pop()!);
    expect(ktorBuilderPaths(`fun a() = client.get { url { path(MainService.NOTIFICATIONS) } }`, undefined, r)).toEqual([['notifications', 'GET']]);
    expect(ktorBuilderPaths(`fun a(id: String) = client.get { url { appendPathSegments(USERS, id, DETAIL) } }`, undefined, r)).toEqual([['v1/users/{id}/detail', 'GET']]);
    expect(ktorBuilderPaths(`fun a() = client.post { url { encodedPath = USERS } }`, undefined, r)).toEqual([['v1/users', 'POST']]);
    expect(ktorBuilderPaths(`fun a() = client.post { url { encodedPath += NOTIFICATIONS } }`, undefined, r)).toEqual([['notifications', 'POST']]);
    // unresolved references stay placeholders / are ignored
    expect(ktorBuilderPaths(`fun a() = client.get { url { encodedPath = unknownVar } }`, undefined, r)).toEqual([]);
  });
});

describe('ktor constant resolution end to end', () => {
  it('companion, top-level, object and interface-companion constants', async () => {
    const apis = await apisOf({
      'settings.gradle.kts': 'include(":shared")\n',
      'shared/build.gradle.kts': 'kotlin { androidTarget(); iosArm64() }\n',
      'shared/src/commonMain/kotlin/t/ex/Paths.kt': `package t.ex
const val TOP_ITEMS = "items"
object Paths { const val TAGS = "tags" }
interface MainService { companion object { const val NOTIFICATIONS = "notifications" } }
`,
      'shared/src/commonMain/kotlin/t/ex/Api.kt': `package t.ex

import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.http.*

class Api(private val client: HttpClient) {
  companion object { const val PROFILE = "/me/profile" }
  suspend fun profile() = client.get {
    url { encodedPath = PROFILE }
  }
  suspend fun items() = client.get {
    url { path(TOP_ITEMS) }
  }
  suspend fun tags() = client.post {
    url { appendPathSegments(Paths.TAGS) }
  }
  suspend fun notes() = client.get {
    url { encodedPath += MainService.NOTIFICATIONS }
  }
}
`,
    });
    expect(apis).toEqual(expect.arrayContaining(['GET /me/profile', 'GET /items', 'POST /tags', 'GET /notifications']));
  });
});
