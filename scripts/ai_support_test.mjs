import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helperUrl = new URL('../js/hbds_ai_support.js', import.meta.url);
const source = readFileSync(helperUrl, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  AI_PROVIDER_DEFINITIONS,
  AI_CUSTOM_MODEL_VALUE,
  buildAiPromptRequestPayload,
  credentialStateForProvider,
  defaultModelForProvider,
  defaultReasoningEffortForModel,
  hasApplyableAiModelResponse,
  isManualWorkflowProvider,
  mergeProviderCapabilities,
  modelOptionsForProvider,
  normalizeAiHbdsModelResponse,
  parseManualAiResponseText,
  providerById,
  providerSupportsReasoningEffort,
  sanitizeAiConfigForDiagnostics,
  validateAiRequestConfig,
  validateManualHbdsModelResponse
} = await import(moduleUrl);

const providers = mergeProviderCapabilities([
  { id: 'openai', configuredOnServer: true },
  { id: 'ollama', configuredOnServer: false }
], AI_PROVIDER_DEFINITIONS);

const openai = providerById('openai', providers);
assert.equal(openai.configuredOnServer, true);
assert.equal(defaultModelForProvider(openai), 'gpt-5.5');
assert.ok(modelOptionsForProvider(openai).some(model => model.id === 'gpt-5.5'));
assert.equal(providerSupportsReasoningEffort(openai, 'gpt-5.5'), true);
assert.equal(defaultReasoningEffortForModel(openai, 'gpt-5.5'), 'medium');
assert.deepEqual(credentialStateForProvider(openai, true), {
  status: 'configured',
  message: 'Configured on server',
  showKeyField: false,
  keyRequired: false
});

const anthropic = providerById('anthropic', providers);
assert.equal(credentialStateForProvider(anthropic, false).showKeyField, true);
assert.equal(validateAiRequestConfig({
  providerId: 'anthropic',
  requestText: 'Validate this HBDS model',
  operationMode: 'validate',
  apiKey: ''
}, anthropic).valid, false);
assert.equal(validateAiRequestConfig({
  providerId: 'anthropic',
  requestText: 'Prepare the HBDS validation prompt only',
  operationMode: 'validate',
  apiKey: ''
}, anthropic, { serverEnabled: false }).valid, true);

const ollama = providerById('ollama', providers);
assert.equal(credentialStateForProvider(ollama, false).message, 'No key required');
assert.equal(validateAiRequestConfig({
  providerId: 'ollama',
  requestText: 'Generate an HBDS model',
  operationMode: 'generate',
  baseUrl: 'http://127.0.0.1:11434'
}, ollama).valid, true);

const custom = providerById('custom-openai', providers);
assert.equal(validateAiRequestConfig({
  providerId: 'custom-openai',
  requestText: 'Generate an HBDS model',
  operationMode: 'generate',
  baseUrl: ''
}, custom).valid, false);
assert.equal(validateAiRequestConfig({
  providerId: 'openai',
  requestText: 'Generate an HBDS model',
  operationMode: 'generate',
  reasoningEffort: 'xhight'
}, openai).valid, false);

const manual = providerById('chatgpt-manual', providers);
assert.equal(isManualWorkflowProvider(manual), true);
assert.equal(credentialStateForProvider(manual, true).showKeyField, false);
assert.equal(validateAiRequestConfig({
  providerId: 'chatgpt-manual',
  requestText: 'Generate an HBDS prompt for manual ChatGPT use',
  operationMode: 'generate',
  apiKey: ''
}, manual, { serverEnabled: true }).valid, true);

const redacted = sanitizeAiConfigForDiagnostics({
  providerId: 'openai',
  modelName: 'gpt-test',
  apiKey: 'sk-secret',
  reasoningEffort: 'xhigh',
  operationMode: 'generate'
});
assert.equal(redacted.apiKey, '[redacted]');
assert.equal(redacted.hasUserKey, true);
assert.equal(redacted.reasoningEffort, 'xhigh');

const payloadWithoutModel = buildAiPromptRequestPayload({
  providerId: 'openai',
  modelName: 'gpt-test',
  operationMode: 'generate',
  reasoningEffort: 'low',
  apiKey: 'sk-test-key',
  requestText: 'Generate a model'
}, { metadata: {}, hypergraph: { class: [], link: [] } });
assert.equal(Object.hasOwn(payloadWithoutModel, 'currentModel'), false);
assert.equal(payloadWithoutModel.apiKey, 'sk-test-key');
assert.equal(payloadWithoutModel.reasoningEffort, 'low');
assert.equal(AI_CUSTOM_MODEL_VALUE, '__custom__');

const payloadWithModel = buildAiPromptRequestPayload({
  providerId: 'openai',
  modelName: 'gpt-test',
  operationMode: 'improve',
  requestText: 'Improve this model'
}, { metadata: {}, hypergraph: { class: [], link: [] } });
assert.equal(Object.hasOwn(payloadWithModel, 'currentModel'), true);

assert.equal(hasApplyableAiModelResponse({ hypergraph: { class: [], link: [] } }), true);
assert.equal(hasApplyableAiModelResponse({ hypergraph: { class: [] } }), false);

assert.equal(parseManualAiResponseText('```json\n{}\n```').valid, false);
assert.equal(parseManualAiResponseText('not json').valid, false);
const manualModel = {
  metadata: { name: 'Manual Model', purpose: 'test' },
  hypergraph: {
    class: [
      { id: 'manual_a', type: 'class', name: 'A', position: { x: 0, y: 0, z: 0 }, attributes: [] }
    ],
    link: []
  }
};
const parsedManual = parseManualAiResponseText(JSON.stringify(manualModel));
assert.equal(parsedManual.valid, true);
assert.equal(validateManualHbdsModelResponse(parsedManual.model).valid, true);
const aliasedAiModel = normalizeAiHbdsModelResponse({
  metadata: { name: 'Aliased AI Model' },
  hypergraph: {
    class: [
      {
        id: 'hc_mushroom',
        kind: 'hyperclass',
        name: 'Mushroom',
        position: { x: '0', y: -120 },
        attribute: [{ id: 'attr_hc_mushroom_domain', name: 'domain', value: 'Fungi' }]
      },
      {
        id: 'c_cap',
        kind: 'class',
        name: 'Cap',
        position: { x: -240, y: 40 },
        attribute: [{ id: 'attr_c_cap_role', name: 'role', value: 'protects spores' }]
      }
    ],
    link: [{ id: 'l_mushroom_has_cap', source: 'hc_mushroom', target: 'c_cap', name: 'has part' }]
  }
});
assert.equal(aliasedAiModel.hypergraph.class[0].type, 'hyperclass');
assert.equal(Array.isArray(aliasedAiModel.hypergraph.class[0].attributes), true);
assert.equal(aliasedAiModel.hypergraph.link[0].sourceClassId, 'hc_mushroom');
assert.equal(aliasedAiModel.hypergraph.link[0].targetClassId, 'c_cap');
assert.equal(validateManualHbdsModelResponse(aliasedAiModel).valid, true);
assert.equal(validateManualHbdsModelResponse({
  metadata: {},
  hypergraph: {
    class: [{ id: 'manual_a', type: 'class', attributes: [], position: { x: '0', y: 0 } }],
    link: []
  }
}).valid, false);

console.log('AI support helper tests passed.');
