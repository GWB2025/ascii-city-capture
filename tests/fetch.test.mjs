import test from 'node:test';
import assert from 'node:assert/strict';
import {CityVersions} from '../web/versions.mjs';

const documentStub = {getElementById: () => ({addEventListener() {}})};

test('default city requests retain the browser fetch receiver for GET and POST', async t => {
  const calls = [];
  // Native Window.fetch rejects an unrelated object as its receiver. Node's
  // fetch and the previous arrow-function mocks do not enforce this rule.
  t.mock.method(globalThis, 'fetch', async function(path, options) {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    calls.push({path, options});
    return {ok: true, json: async () => ({saved: true})};
  });
  const panel = new CityVersions({onSelect() {}, document: documentStub});
  assert.deepEqual(await panel.api('/api/cities'), {saved: true});
  assert.deepEqual(await panel.api('/api/cities/select', {id: 'prototype-4'}), {saved: true});
  assert.deepEqual(calls, [
    {path: '/api/cities', options: {}},
    {path: '/api/cities/select', options: {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: 'prototype-4'})
    }}
  ]);
});
