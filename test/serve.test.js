import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePath } from '../tools/serve.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('dev server never serves files outside the project folder', () => {
  for (const attempt of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc/passwd', '/src/../../x']) {
    const p = resolvePath(attempt);
    assert.ok(p === null || p.startsWith(root + sep), `${attempt} -> ${p}`);
  }
  assert.equal(resolvePath('/src/main.js'), resolve(root, 'src/main.js'));
});
