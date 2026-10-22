// zero-config / kb init: Kotlin Multiplatform modules outside the android root are scanned.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig, detect } from '../src/config/config.js';
import { collectJobs } from '../src/scan/scan.js';

const made: string[] = [];
const mk = (files: Record<string, string>) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kbkmp-'));
  made.push(d);
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), c);
  }
  return d;
};
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
const jobs = (d: string) => {
  const c = defaultConfig();
  c.root = d;
  c.platforms = detect(d);
  return collectJobs(c, d)
    .map((j) => `${j.platform}:${j.rel}`)
    .sort();
};

describe('detect: Kotlin Multiplatform modules', () => {
  it('root Gradle + shared/ is already covered by the root android platform', () => {
    const d = mk({ 'settings.gradle.kts': '', 'shared/src/commonMain/kotlin/A.kt': 'class A', 'app/src/main/java/B.kt': 'class B' });
    expect(detect(d)).toEqual([{ name: 'android', root: '.' }]);
    expect(jobs(d)).toEqual(['android:app/src/main/java/B.kt', 'android:shared/src/commonMain/kotlin/A.kt']);
  });

  it('androidApp/ + iosApp/ + shared/ under a root Gradle build: no double counting', () => {
    const d = mk({
      'settings.gradle.kts': '',
      'androidApp/src/main/java/M.kt': 'class M',
      'iosApp/iosApp/ContentView.swift': 'struct ContentView {}',
      'shared/src/commonMain/kotlin/S.kt': 'class S',
      'shared/src/iosMain/kotlin/I.kt': 'class I',
    });
    expect(detect(d)).toEqual([
      { name: 'android', root: '.' },
      { name: 'ios', root: 'iosApp' },
    ]);
    expect(jobs(d)).toEqual([
      'android:androidApp/src/main/java/M.kt',
      'android:shared/src/commonMain/kotlin/S.kt',
      'android:shared/src/iosMain/kotlin/I.kt',
      'ios:iosApp/iosApp/ContentView.swift',
    ]);
  });

  it('android/ + ios/ + shared/, composeApp/ and libs/core/ at the root are added to android', () => {
    const d = mk({
      'settings.gradle.kts': '',
      'android/app/src/main/java/M.kt': 'class M',
      'ios/App/ContentView.swift': 'struct ContentView {}',
      'shared/src/commonMain/kotlin/S.kt': 'class S',
      'composeApp/src/androidMain/kotlin/C.kt': 'class C',
      'libs/core/src/commonMain/kotlin/K.kt': 'class K',
      'docs/x/Doc.kt': 'class Doc',
    });
    expect(detect(d)).toEqual([
      { name: 'android', root: '.', include: ['android/**', 'composeApp/**', 'libs/core/**', 'shared/**'] },
      { name: 'ios', root: 'ios' },
    ]);
    expect(jobs(d)).toEqual([
      'android:android/app/src/main/java/M.kt',
      'android:composeApp/src/androidMain/kotlin/C.kt',
      'android:libs/core/src/commonMain/kotlin/K.kt',
      'android:shared/src/commonMain/kotlin/S.kt',
      'ios:ios/App/ContentView.swift',
    ]);
  });

  it('Gradle build inside android/ also picks up sibling KMP modules', () => {
    const d = mk({ 'android/settings.gradle': '', 'android/app/src/main/java/M.kt': 'class M', 'shared/src/commonMain/kotlin/S.kt': 'class S' });
    expect(detect(d)).toEqual([{ name: 'android', root: '.', include: ['android/**', 'shared/**'] }]);
  });

  it('unchanged without KMP modules or without Gradle', () => {
    expect(detect(mk({ 'settings.gradle': '', 'android/app/src/main/java/M.kt': '', 'shared/README.md': '' }))).toEqual([{ name: 'android', root: 'android' }]);
    expect(detect(mk({ 'android/app/src/main/java/M.kt': '', 'shared/src/commonMain/kotlin/S.kt': '' }))).toEqual([{ name: 'android', root: 'android' }]);
  });

  it('skipped when another platform owns the repo root', () => {
    const d = mk({ 'settings.gradle': '', 'App.xcodeproj/project.pbxproj': '', 'android/app/src/main/java/M.kt': '', 'shared/src/commonMain/kotlin/S.kt': '' });
    expect(detect(d)).toEqual([
      { name: 'android', root: 'android' },
      { name: 'ios', root: '.' },
    ]);
  });
});
