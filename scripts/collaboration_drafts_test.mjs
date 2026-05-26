import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helperUrl = new URL('../js/hbds_collaboration_drafts.js', import.meta.url);
const source = readFileSync(helperUrl, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const drafts = await import(moduleUrl);

{
  const model = { hypergraph: { class: [{ id: 'a' }], link: [] } };
  const decision = drafts.shouldIncludeDraftModel({
    dirty: true,
    model,
    modelName: 'alpha.json',
    snapshotKey: 'snapshot-a',
    lastSnapshotKey: '',
    lastSnapshotAt: 0,
    now: 1000
  });
  assert.equal(decision.include, true);
  assert.equal(decision.reason, 'initial');
  assert.ok(decision.modelBytes > 0);
}

{
  const decision = drafts.shouldIncludeDraftModel({
    dirty: false,
    force: false,
    model: { hypergraph: { class: [], link: [] } },
    modelName: 'alpha.json',
    snapshotKey: 'snapshot-a',
    lastSnapshotKey: '',
    now: 1000
  });
  assert.equal(decision.include, false);
  assert.equal(decision.reason, 'presence');
}

{
  const decision = drafts.shouldIncludeDraftModel({
    dirty: true,
    model: { hypergraph: { class: [], link: [] } },
    modelName: 'alpha.json',
    snapshotKey: 'snapshot-b',
    lastSnapshotKey: 'snapshot-a',
    lastModelName: 'alpha.json',
    lastSnapshotAt: 1000,
    now: 2000,
    policy: { fullSnapshotIntervalMs: 10000 }
  });
  assert.equal(decision.include, false);
  assert.equal(decision.reason, 'throttled');
}

{
  const decision = drafts.shouldIncludeDraftModel({
    dirty: true,
    modelBytes: 25,
    modelName: 'alpha.json',
    snapshotKey: 'snapshot-b',
    lastSnapshotKey: 'snapshot-a',
    lastModelName: 'alpha.json',
    lastSnapshotAt: 1000,
    now: 12000,
    policy: { fullSnapshotIntervalMs: 10000, maxInlineModelBytes: 50 }
  });
  assert.equal(decision.include, true);
  assert.equal(decision.reason, 'interval');
}

{
  const decision = drafts.shouldIncludeDraftModel({
    dirty: true,
    force: true,
    modelBytes: 75,
    modelName: 'alpha.json',
    snapshotKey: 'snapshot-b',
    policy: { maxInlineModelBytes: 50 }
  });
  assert.equal(decision.include, false);
  assert.equal(decision.reason, 'model-too-large');
}

{
  const preview = drafts.shouldBuildDraftPreview({
    dirty: true,
    hasCachedPreview: false,
    lastPreviewAt: 0,
    now: 1000
  });
  assert.equal(preview.include, true);
  assert.equal(preview.reason, 'initial');
}

{
  const preview = drafts.shouldBuildDraftPreview({
    dirty: true,
    hasCachedPreview: true,
    lastPreviewAt: 1000,
    now: 2000,
    policy: { previewIntervalMs: 5000 }
  });
  assert.equal(preview.include, false);
  assert.equal(preview.reason, 'throttled');
}

{
  const preview = drafts.shouldBuildDraftPreview({
    dirty: true,
    hasCachedPreview: true,
    lastPreviewAt: 1000,
    now: 7000,
    policy: { previewIntervalMs: 5000 }
  });
  assert.equal(preview.include, true);
  assert.equal(preview.reason, 'interval');
}

{
  const preview = drafts.shouldBuildDraftPreview({
    dirty: false,
    force: false,
    hasCachedPreview: true,
    lastPreviewAt: 1000,
    now: 7000
  });
  assert.equal(preview.include, false);
  assert.equal(preview.reason, 'presence');
}

{
  const decision = drafts.collaborationWorkStatusDecision({
    kind: 'preview',
    startedAt: 1000,
    now: 1500,
    showAfterMs: 900
  });
  assert.equal(decision.show, false);
  assert.equal(decision.message, 'Generating collaboration preview...');
  assert.equal(decision.elapsedMs, 500);
}

{
  const decision = drafts.collaborationWorkStatusDecision({
    kind: 'merge',
    startedAt: 1000,
    now: 1950,
    showAfterMs: 900
  });
  assert.equal(decision.show, true);
  assert.equal(decision.message, 'Checking merge conflicts...');
}

{
  const decision = drafts.collaborationWorkStatusDecision({
    kind: 'render',
    message: 'Rendering a large remote diff...',
    force: true,
    startedAt: 1000,
    now: 1000,
    showAfterMs: 900
  });
  assert.equal(decision.show, true);
  assert.equal(decision.message, 'Rendering a large remote diff...');
}

{
  assert.equal(drafts.shouldKeepCollaborationStatusVisible({
    visibleAt: 1000,
    now: 1200,
    minVisibleMs: 450
  }), true);
  assert.equal(drafts.shouldKeepCollaborationStatusVisible({
    visibleAt: 1000,
    now: 1500,
    minVisibleMs: 450
  }), false);
}

{
  const collector = drafts.createBoundedChangeCollector(2);
  assert.equal(collector.push({ text: 'one' }), true);
  assert.equal(collector.push({ text: 'two' }), true);
  assert.equal(collector.push({ text: 'three' }), false);
  assert.equal(collector.shouldContinue(), false);
  assert.equal(collector.truncated, true);
  assert.equal(collector.observed, 3);
  assert.deepEqual(collector.toArray().map(item => item.text), ['one', 'two']);
}

{
  const collector = drafts.createBoundedChangeCollector(Number.POSITIVE_INFINITY);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(collector.push({ index }), true);
  }
  assert.equal(collector.shouldContinue(), true);
  assert.equal(collector.truncated, false);
  assert.equal(collector.length, 5);
}

{
  const merged = drafts.coalesceDraftPublishRequest(
    { reason: 'Editing name', options: { dirty: true, forcePreview: true } },
    { reason: 'Moved element', options: { forceSnapshot: true } }
  );
  assert.equal(merged.reason, 'Moved element');
  assert.equal(merged.options.dirty, true);
  assert.equal(merged.options.forcePreview, true);
  assert.equal(merged.options.forceSnapshot, true);
}

{
  const merged = drafts.coalesceDraftPublishRequest(
    { reason: 'Editing', options: { dirty: true, forcePreview: true } },
    { reason: 'Viewing saved model', options: { dirty: false } }
  );
  assert.equal(merged.reason, 'Viewing saved model');
  assert.equal(merged.options.dirty, false);
  assert.equal(merged.options.forcePreview, true);
}

{
  const result = drafts.coalesceDraftOperations(
    [
      {
        type: 'updateClass',
        targetId: 'class-a',
        patch: { name: 'Old', rendering: { class: { color: '#111111' } } }
      }
    ],
    {
      type: 'updateClass',
      targetId: 'class-a',
      patch: { id: 'ignored', rendering: { class: { borderColor: '#222222' } } }
    },
    { maxOperations: 4 }
  );
  assert.equal(result.overflow, false);
  assert.equal(result.operations.length, 1);
  assert.deepEqual(result.operations[0].patch, {
    name: 'Old',
    rendering: { class: { color: '#111111', borderColor: '#222222' } }
  });
}

{
  const result = drafts.coalesceDraftOperations(
    [],
    [
      { type: 'updateClass', targetId: 'class-a', patch: { name: 'Alpha' } },
      { type: 'updateLink', targetId: 'link-a', patch: { name: 'Beta' } }
    ],
    { maxOperations: 4 }
  );
  assert.equal(result.overflow, false);
  assert.deepEqual(result.operations.map(operation => operation.type), ['updateClass', 'updateLink']);
}

{
  const result = drafts.coalesceDraftOperations(
    [
      { type: 'updateClass', targetId: 'class-a', patch: { name: 'Alpha' } },
      { type: 'updateLink', targetId: 'link-a', patch: { name: 'Beta' } }
    ],
    { type: 'updateLink', targetId: 'link-b', patch: { name: 'Gamma' } },
    { maxOperations: 2 }
  );
  assert.equal(result.overflow, true);
  assert.deepEqual(result.operations, []);
}

{
  const result = drafts.coalesceDraftOperations(
    [
      {
        type: 'createClass',
        targetId: 'class-new',
        class: { id: 'class-new', name: 'New', attributes: [] }
      }
    ],
    {
      type: 'updateClass',
      targetId: 'class-new',
      patch: { name: 'Renamed', rendering: { class: { color: '#123456' } } }
    },
    { maxOperations: 4 }
  );
  assert.equal(result.overflow, false);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].type, 'createClass');
  assert.deepEqual(result.operations[0].class, {
    id: 'class-new',
    name: 'Renamed',
    attributes: [],
    rendering: { class: { color: '#123456' } }
  });
}

{
  const result = drafts.coalesceDraftOperations(
    [
      { type: 'updateClass', targetId: 'class-a', patch: { name: 'Temporary' } },
      { type: 'updateLink', targetId: 'link-a', patch: { name: 'Temporary link' } }
    ],
    { type: 'deleteClass', targetId: 'class-a' },
    { maxOperations: 4 }
  );
  assert.equal(result.overflow, false);
  assert.deepEqual(result.operations.map(operation => operation.type), ['updateLink', 'deleteClass']);
  assert.equal(result.operations[1].targetId, 'class-a');
}

{
  const result = drafts.coalesceDraftOperations(
    [
      {
        type: 'createLink',
        targetId: 'link-new',
        link: { id: 'link-new', sourceClassId: 'a', targetClassId: 'b' }
      }
    ],
    { type: 'deleteLink', targetId: 'link-new' },
    { maxOperations: 4 }
  );
  assert.equal(result.overflow, false);
  assert.deepEqual(result.operations, []);
}

{
  const tracker = drafts.createCollaborationPerformanceTracker({ maxSamples: 2, slowThresholdMs: 50 });
  tracker.record('draft.publish', 25, { mode: 'presence' });
  tracker.record('draft.publish', 75, { mode: 'editing' });
  tracker.record('draft.publish', 100, { mode: 'editing' });
  tracker.count('draft.skipped.duplicate');
  tracker.count('draft.skipped.duplicate', 2);
  const summary = tracker.summary();
  assert.equal(summary.metrics['draft.publish'].count, 2);
  assert.equal(summary.metrics['draft.publish'].lastMs, 100);
  assert.equal(summary.metrics['draft.publish'].maxMs, 100);
  assert.equal(summary.metrics['draft.publish'].slow, 2);
  assert.equal(summary.metrics['draft.publish'].lastDetails.mode, 'editing');
  assert.equal(summary.counters['draft.skipped.duplicate'], 3);
}

{
  const left = drafts.draftPublishSignature('alpha.json', {
    mode: 'presence',
    dirty: false,
    selection: { selectedElementId: 'a', selectedElementIds: ['a', 'b'] },
    viewport: { zoom: 1, target: { x: 0, y: 0, z: 0 } },
    summary: { classes: 2, links: 1 },
    status: 'Viewing model'
  });
  const right = drafts.draftPublishSignature('alpha.json', {
    status: 'Viewing model',
    summary: { links: 1, classes: 2 },
    viewport: { target: { z: 0, y: 0, x: 0 }, zoom: 1 },
    selection: { selectedElementIds: ['a', 'b'], selectedElementId: 'a' },
    dirty: false,
    mode: 'presence'
  });
  assert.equal(left, right);
}

{
  const left = drafts.draftPublishSignature('alpha.json', {
    mode: 'presence',
    dirty: false,
    selection: { selectedElementId: 'a' }
  });
  const right = drafts.draftPublishSignature('alpha.json', {
    mode: 'presence',
    dirty: false,
    selection: { selectedElementId: 'b' }
  });
  assert.notEqual(left, right);
}

{
  const left = drafts.draftPublishSignature('alpha.json', {
    mode: 'editing',
    dirty: true,
    modelOmitted: true,
    status: 'Moved element',
    operations: [
      { type: 'updateClass', targetId: 'class-a', patch: { position: { x: 1, y: 2, z: 0 } } }
    ]
  });
  const right = drafts.draftPublishSignature('alpha.json', {
    mode: 'editing',
    dirty: true,
    modelOmitted: true,
    status: 'Moved element',
    operations: [
      { type: 'updateClass', targetId: 'class-a', patch: { position: { x: 3, y: 2, z: 0 } } }
    ]
  });
  assert.notEqual(left, right);
}

{
  const left = drafts.draftOperationsSignature([
    { type: 'updateLayout', targetId: 'model', mergeable: false, patch: { layout: { algorithm: 'grid' } } }
  ]);
  const right = drafts.draftOperationsSignature([
    { targetId: 'model', patch: { layout: { algorithm: 'grid' } }, mergeable: false, type: 'updateLayout' }
  ]);
  const changed = drafts.draftOperationsSignature([
    { type: 'updateLayout', targetId: 'model', mergeable: false, patch: { layout: { algorithm: 'radial' } } }
  ]);
  assert.equal(left, right);
  assert.notEqual(left, changed);
}

{
  assert.equal(drafts.isMergeableDraftOperation({ type: 'updateClass', targetId: 'class-a', patch: { name: 'A' } }), true);
  assert.equal(drafts.isMergeableDraftOperation({ type: 'updateLayout', targetId: 'model', mergeable: false }), false);
}

{
  const existing = {
    clientId: 'client-a',
    modelName: 'alpha.json',
    model: { hypergraph: { class: [{ id: 'old' }], link: [] } },
    preview: { kind: 'live-canvas-snapshot', dataUrl: 'data:image/png;base64,aaa' },
    updatedAt: 'old'
  };
  const incoming = {
    clientId: 'client-a',
    modelName: 'alpha.json',
    modelOmitted: true,
    preview: { kind: 'model-preview' },
    summary: { classes: 2 },
    updatedAt: 'new'
  };
  const merged = drafts.mergeDraftUpdate(existing, incoming);
  assert.equal(merged.updatedAt, 'new');
  assert.equal(merged.model.hypergraph.class[0].id, 'old');
  assert.equal(merged.modelPreservedFromPreviousDraft, true);
  assert.equal(merged.preview.dataUrl, 'data:image/png;base64,aaa');
  assert.equal(merged.previewPreservedFromPreviousDraft, true);
}

{
  const existing = {
    clientId: 'client-a',
    modelName: 'alpha.json',
    model: { hypergraph: { class: [{ id: 'old' }], link: [] } }
  };
  const incoming = {
    clientId: 'client-a',
    modelName: 'beta.json',
    modelOmitted: true
  };
  const merged = drafts.mergeDraftUpdate(existing, incoming);
  assert.equal(merged.model, undefined);
}

console.log('Collaboration draft helper tests passed.');
