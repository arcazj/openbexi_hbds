import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/hbds_server_api.js', import.meta.url), 'utf8');
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalFetch = globalThis.fetch;
const requests = [];
let responseBody;
let responseStatus = 200;
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  return new Response(JSON.stringify(responseBody), { status: responseStatus });
};

try {
  for (const scope of ['models', 'test_models']) {
    const options = { apiBase: 'http://127.0.0.1:8010', modelScope: scope };
    const path = scope === 'models' ? '/api/models/sample.json' : '/api/model-files/test_models/sample.json';
    responseBody = {
      ok: true,
      model: { metadata: { name: 'Sample', revision: 'r1' }, hypergraph: { class: [], link: [] } }
    };
    const loaded = await api.loadScopedModel('sample.json', options);
    assert.equal(requests.at(-1).url, options.apiBase + path);
    const model = loaded.data.model;
    for (const revision of ['r2', 'r3']) {
      const previousRevision = model.metadata.revision;
      responseBody = { ok: true, metadata: { revision, contentHash: revision, modified: 123, modifiedIso: 'now' } };
      const result = await api.saveScopedModel('sample.json', model, options);
      const request = requests.at(-1);
      assert.equal(result.ok, true);
      assert.equal(request.url, options.apiBase + path);
      assert.equal(request.headers['If-Match'], previousRevision);
      assert.ok(request.headers['X-Client-Id']);
      assert.equal(model.metadata.revision, revision);
      assert.equal(model.metadata.name, 'Sample');
    }
    responseStatus = 409;
    responseBody = { ok: false, error: { code: 'model_conflict', message: 'Reload first' } };
    const before = structuredClone(model);
    const conflict = await api.saveScopedModel('sample.json', model, options);
    assert.equal(conflict.status, 409);
    assert.deepEqual(model, before);
    responseStatus = 200;
  }
  // Neither cancellation nor ambiguous POST failures may send a second paid call.
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new TypeError('Connection dropped'); };
  const failedPost = await api.prepareAiPrompt({ requestText: 'test' });
  assert.equal(failedPost.error.code, 'network_error');
  assert.equal(calls, 1);
  globalThis.fetch = async (_url, { signal }) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
  };
  calls = 0;
  const controller = new AbortController();
  const pending = api.prepareAiPrompt({}, { signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  assert.equal((await pending).error.code, 'canceled');
  assert.equal(calls, 1);
  calls = 0;
  const timedOut = await api.prepareAiPrompt({}, { timeoutMs: 10 });
  assert.equal(timedOut.error.code, 'timeout');
  assert.equal(calls, 1);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Server API revision helper tests passed.');
