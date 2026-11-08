import { QUERY_TYPES, QUERY_PROFILE, createQuerySnapshot, buildQueryIndex,
  functorCapability, availableQuerySteps, executeQuery } from './hbds_metamodel_queries.js?v=query-v3';
import { createQueryCombo } from './hbds_query_combo.js?v=query-compact-v1';

const SINGULAR = { class: 'Class', hyperclass: 'Hyperclass', classAttribute: 'Class attribute',
  hyperattribute: 'Hyperclass attribute', classLink: 'Class link', hyperlink: 'Hyperclass link' };
const keyOf = record => JSON.stringify([record.type, record.id]);
const params = new URLSearchParams(location.search);
if (params.get('legacy') !== '1') initializeWorkspace();

async function initializeWorkspace() {
  document.body.classList.add('metamodel-query');
  if (params.get('embeddedShell') === '1') document.body.classList.add('mq-embedded');
  const root = document.getElementById('metamodel-workspace'); root.hidden = false;
  root.innerHTML = `
    <header class="mq-heading"><h1>Query <span id="mq-model-name" class="mq-sr-only">Current model</span></h1><div id="mq-model-slot"></div></header>
    <div class="mq-main">
      <section class="mq-card mq-builder" aria-labelledby="mq-builder-title">
        <div class="mq-row mq-section-heading"><h2 id="mq-builder-title">Query builder</h2></div>
        <div id="mq-query-row" class="mq-query-row"><div id="mq-operation-slot"></div><div id="mq-inputs" class="mq-inputs"></div></div>
        <p id="mq-description" class="mq-muted mq-description" hidden></p>
        <div id="mq-steps" class="mq-steps" aria-label="Additional query steps"></div>
        <p id="mq-query-state" class="mq-muted" role="status">Loading the functor reference…</p>
        <div class="mq-chain-actions"><button id="mq-add" type="button" disabled>+ Add step</button><button id="mq-clear" type="button" hidden>Clear steps</button></div>
      </section>
      <p id="mq-notice" class="mq-notice" role="status" hidden></p>
      <section class="mq-card mq-results" aria-labelledby="mq-results-title">
        <div class="mq-row mq-section-heading"><h2 id="mq-results-title">Results <span id="mq-result-count" class="mq-count">—</span></h2><div class="mq-result-actions"><button id="mq-locate-all" type="button" disabled>Locate all</button><button id="mq-copy" type="button" disabled>Copy JSON</button></div></div>
        <p id="mq-result-summary" class="mq-muted" aria-live="polite">Select a functor and its inputs.</p>
        <label for="mq-result-filter" class="mq-sr-only">Filter results by name, identifier or path</label>
        <input id="mq-result-filter" type="search" placeholder="Filter results…" title="Filter by name, identifier or path">
        <div class="mq-table-wrap"><table><caption class="mq-sr-only">Query result elements</caption><thead><tr><th>Type</th><th>Name</th><th>Locate</th></tr></thead><tbody id="mq-results"></tbody></table></div>
        <div class="mq-pagination"><label for="mq-page-size">Rows <select id="mq-page-size"><option>25</option><option>50</option><option>100</option></select></label>
          <span id="mq-page">No results yet</span><div><button id="mq-prev" type="button" aria-label="Previous page" title="Previous page" disabled>‹</button><button id="mq-more" type="button" aria-label="Next page" title="Next page" disabled>›</button></div></div>
        <details id="mq-details" hidden><summary>Selected result data</summary><pre id="mq-detail-json"></pre></details>
      </section>
      <details class="mq-card mq-catalog"><summary>Functor reference <span id="mq-catalog-count">Loading catalog…</span></summary>
        <p class="mq-muted">All 141 documented functors are listed here with their source pages. The builder uses their original names and offers the implemented metamodel subset. Queries read recorded definitions; inherited definitions and object data are outside this subset.</p>
        <div class="mq-reference-filters"><div><label for="mq-catalog-search">Search the catalog</label><input id="mq-catalog-search" type="search" placeholder="Name, description or family"></div>
          <div><label for="mq-catalog-status">Availability</label><select id="mq-catalog-status"><option value="all">All functors</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></div></div>
        <div id="mq-catalog-list" class="mq-catalog-list"></div>
      </details>
      <footer class="mq-muted"><a href="functor_queries.html?legacy=1" target="_blank" rel="noopener">Instance query examples</a></footer>
    </div>`;
  const $ = id => root.querySelector(`#mq-${id}`);
  const embedded = window.parent !== window && params.get('embeddedShell') === '1';
  const state = { catalog: [], models: [], selectedModel: '@current', snapshot: null, index: null, sourceKey: '', serial: '', ticket: null, lastTicket: 0,
    operation: '', inputType: 'class', values: { element: '', target: '' }, steps: [],
    result: null, compiled: null, generation: 0, locateRequest: 0, page: 0, pageSize: 25, waiting: true, initialized: false, message: '' };
  const inputs = new Map(), stepControls = new Map();
  const send = message => window.parent.postMessage(message, location.origin);
  const notice = (message, error = false) => { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('mq-error', error); };
  const operations = () => state.catalog.filter(entry => functorCapability(entry.name, state.index).supported);
  const operation = () => operations().find(entry => entry.name === state.operation);
  const firstOutputType = () => operation()?.outputType || state.inputType;
  const modelCombo = createQueryCombo({ id: 'mq-model', label: 'Model', placeholder: 'Current model', onChange: value => {
    state.selectedModel = value; state.waiting = true; notice(''); renderBuilder(); scheduleQuery();
    send({ type: 'hbds-query-select-model', value });
  } });
  modelCombo.element.querySelector('label').classList.add('mq-sr-only');
  modelCombo.setOptions([], '', true);
  $('model-slot').append(modelCombo.element);

  function mount(container, elements) {
    for (const child of [...container.children]) if (!elements.includes(child)) child.remove();
    elements.forEach((element, i) => { if (container.children[i] !== element) container.insertBefore(element, container.children[i] || null); });
  }
  function selectedDiagramElement() {
    const selection = state.snapshot?.source.selection;
    if (!selection || !state.index) return null;
    if (selection.ownerId != null && selection.attributeKey != null) {
      return state.index.attrs.get(String(selection.ownerId))?.find(record =>
        (record.synthetic ? `idx-${record.attributeIndex}` : record.id) === String(selection.attributeKey));
    }
    if (selection.linkId != null) return state.index.byType.get('link').find(record => record.id === String(selection.linkId));
    return state.index.nodes.get(String(selection.nodeId));
  }
  function recordChoices(type, all) {
    const records = [...(state.index?.byType.get(type) || [])].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return [
      { value: '', label: `Select ${SINGULAR[type]?.toLowerCase() || 'an element'}…` },
      ...(all ? [{ value: '*', label: `All ${QUERY_TYPES[type].toLowerCase()} (${records.length})`, hint: 'Includes hidden and nested elements' }] : []),
      ...records.map(record => ({ value: keyOf(record), label: record.name || record.id,
        hint: [record.ownerName, record.id].filter(Boolean).join(' · ') }))
    ];
  }
  const operationCombo = createQueryCombo({ id: 'mq-functor', label: 'Functor', placeholder: 'Select a functor…', onChange: name => {
    state.operation = name; state.values.target = '';
    renderBuilder(true); scheduleQuery();
  } });
  $('operation-slot').append(operationCombo.element);

  function renderInputs(prefill = false) {
    const entry = operation();
    const descriptors = [];
    if (entry && state.index) {
      if (entry.inputTypes.includes('*')) descriptors.push({ key: 'type', label: 'Element type', choices: Object.entries(QUERY_TYPES).map(([value, label]) => ({ value, label })) });
      else state.inputType = entry.inputTypes[0];
      descriptors.push({ key: 'element', label: entry.name === 'COUPLE' ? 'Source class' : SINGULAR[state.inputType], type: state.inputType, all: true, prefill });
      if (entry.name === 'COUPLE') descriptors.push({ key: 'target', label: 'Target class', type: 'class' });
    }
    for (const [key, combo] of inputs) if (!descriptors.some(item => item.key === key)) { combo.destroy(); inputs.delete(key); }
    const elements = descriptors.map(descriptor => {
      let combo = inputs.get(descriptor.key);
      if (combo && combo.label !== descriptor.label) { combo.destroy(); inputs.delete(descriptor.key); combo = null; }
      if (!combo) {
        combo = createQueryCombo({ id: `mq-${descriptor.key}`, label: descriptor.label, onChange: value => {
          if (descriptor.key === 'type') { state.inputType = value; renderBuilder(true); }
          else state.values[descriptor.key] = value;
          scheduleQuery();
        } });
        combo.label = descriptor.label; inputs.set(descriptor.key, combo);
      }
      const choices = descriptor.choices || recordChoices(descriptor.type, descriptor.all);
      let value = descriptor.key === 'type' ? state.inputType : state.values[descriptor.key];
      if (!choices.some(choice => choice.value === value)) value = '';
      if (!value && descriptor.prefill) {
        const selected = selectedDiagramElement();
        if (selected && choices.some(choice => choice.value === keyOf(selected))) value = keyOf(selected);
      }
      if (descriptor.key !== 'type') state.values[descriptor.key] = value;
      combo.setOptions(choices, value, state.waiting); return combo.element;
    });
    mount($('inputs'), elements);
  }
  function renderSteps() {
    let type = firstOutputType();
    const elements = [];
    for (let i = 0; i < state.steps.length; i++) {
      const choices = state.index && operation() ? availableQuerySteps(type, state.index, state.catalog) : [];
      const step = state.steps[i];
      if (!choices.length || step.functor && !choices.some(entry => entry.name === step.functor)) { state.steps.length = i; break; }
      let control = stepControls.get(i);
      if (!control) {
        const row = document.createElement('div'); row.className = 'mq-step';
        const combo = createQueryCombo({ id: `mq-step-${i}`, label: `Then · step ${i + 2}`, placeholder: 'Select a compatible functor…', onChange: value => {
          state.steps[i] = { functor: value, target: '' }; renderSteps(); scheduleQuery();
        } });
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove step ${i + 2}`);
        remove.addEventListener('click', () => { state.steps.splice(i, 1); renderSteps(); scheduleQuery(); });
        const description = document.createElement('p'); description.className = 'mq-muted mq-description'; description.id = `mq-step-${i}-description`;
        combo.input.setAttribute('aria-describedby', description.id);
        row.append(combo.element, remove); control = { row, combo, remove, description, target: null }; stepControls.set(i, control);
      }
      control.combo.setOptions([{ value: '', label: 'Select a compatible functor…' }, ...choices.map(entry => ({ value: entry.name, label: entry.name,
        hint: entry.description, group: entry.group }))], step.functor, state.waiting);
      control.description.textContent = choices.find(entry => entry.name === step.functor)?.description || '';
      control.description.hidden = !control.description.textContent;
      if (step.functor === 'COUPLE') {
        if (!control.target) {
          control.target = createQueryCombo({ id: `mq-step-${i}-target`, label: 'Target class', onChange: value => {
            state.steps[i].target = value; scheduleQuery();
          } });
          control.row.insertBefore(control.target.element, control.remove);
        }
        const targets = recordChoices('class', false);
        if (!targets.some(choice => choice.value === step.target)) step.target = '';
        control.target.setOptions(targets, step.target, state.waiting);
      } else if (control.target) { control.target.destroy(); control.target = null; }
      control.row.classList.toggle('mq-step-parameterized', step.functor === 'COUPLE');
      elements.push(control.row, control.description);
      if (!step.functor) { state.steps.length = i + 1; break; }
      type = choices.find(entry => entry.name === step.functor).outputType;
    }
    for (const [i, control] of stepControls) if (i >= state.steps.length) { control.combo.destroy(); control.target?.destroy(); control.row.remove(); stepControls.delete(i); }
    mount($('steps'), elements);
    $('add').disabled = !state.index || state.waiting || !operation() || state.steps.some(step => !step.functor) || type === 'scalar' || state.steps.length >= 31;
    $('clear').hidden = !state.steps.length;
  }
  function renderBuilder(prefill = false) {
    operationCombo.setOptions([{ value: '', label: 'Select a functor…' }, ...operations().map(entry => ({ value: entry.name,
      label: entry.name, hint: entry.description, group: entry.group }))], state.operation, !state.index || state.waiting);
    const containment = ['CONT', 'CONTN', 'CONTOF', 'HCONT', 'HCONTOF'].includes(state.operation)
      ? state.index?.containmentMode === 'explicitMembership' ? ' Uses the model’s explicit memberships.' : ' Uses the containment declared in this model.'
      : '';
    operationCombo.input.title = operation() ? operation().description + containment : 'Select a functor to see the inputs it needs.';
    operationCombo.input.setAttribute('aria-description', operationCombo.input.title);
    operationCombo.input.setAttribute('aria-describedby', 'mq-description');
    $('description').textContent = operation() ? operationCombo.input.title : '';
    $('description').hidden = !operation();
    renderInputs(prefill); renderSteps();
  }
  function compileQuery() {
    if (state.waiting || !state.index) return { message: embedded ? 'Waiting for the current diagram…' : 'Open Query from Models, Edit, or Tests to use the selected model.' };
    const entry = operation();
    if (!entry) return { message: 'Select a functor.' };
    if (state.steps.some(step => !step.functor)) return { message: 'Select the next functor, or remove the unfinished step.' };
    if (!state.values.element) return { message: `Select ${SINGULAR[state.inputType].toLowerCase()}, or choose all ${QUERY_TYPES[state.inputType].toLowerCase()}.` };
    const calls = [{ functor: entry.name, target: state.values.target }, ...state.steps];
    if (calls.some(step => step.functor === 'COUPLE' && !step.target)) return { message: 'Select a target class for COUPLE. Links run from the source class to this target.' };
    const selected = state.index.byIdentity.get(state.values.element);
    const query = { type: state.inputType, ids: state.values.element === '*' ? undefined : [selected.id],
      steps: calls.map(step => step.functor === 'COUPLE'
        ? { functor: 'COUPLE', parameters: { targetClass: { type: 'class', id: state.index.byIdentity.get(step.target).id } } }
        : step.functor) };
    return { query };
  }
  function scheduleQuery() {
    clearHighlights();
    const generation = ++state.generation, index = state.index, ticket = state.ticket;
    state.page = 0; state.result = null; state.compiled = null; $('results').replaceChildren(); $('details').hidden = true;
    $('copy').disabled = true; $('result-count').textContent = '—';
    try {
      const plan = compileQuery();
      state.message = plan.message || 'Updating results…';
      $('query-state').textContent = plan.message || '';
      $('query-state').hidden = !plan.message;
      $('query-state').classList.remove('mq-error-text'); renderResults();
      if (!plan.query) return;
      queueMicrotask(() => {
        if (generation !== state.generation || index !== state.index || ticket !== state.ticket) return;
        try {
          const result = executeQuery(index, plan.query);
          if (generation !== state.generation || index !== state.index || ticket !== state.ticket) return;
          state.result = result; state.compiled = plan.query;
          $('copy').disabled = false; $('result-count').textContent = String(result.kind === 'scalar' ? result.value : result.items.length);
          state.message = result.kind === 'scalar' ? `Count: ${result.value} · calculated from the complete query result.` : result.items.length
            ? `${result.items.length} ${QUERY_TYPES[result.type]?.toLowerCase() || 'elements'} · select a name to inspect its data.`
            : `No matching ${QUERY_TYPES[result.type]?.toLowerCase() || 'elements'}.`;
          renderResults();
        } catch (error) { showQueryError(error); }
      });
    } catch (error) { showQueryError(error); }
  }
  function showQueryError(error) {
    state.result = null; state.compiled = null; state.message = `${error.code || 'QUERY_ERROR'}: ${error.message}`;
    $('query-state').textContent = state.message; $('query-state').classList.add('mq-error-text');
    $('query-state').hidden = false;
    $('copy').disabled = true; $('result-count').textContent = '—'; renderResults();
  }
  function filteredResults() {
    const search = $('result-filter').value.toLocaleLowerCase();
    return state.result?.kind === 'elements' ? state.result.items.filter(record => `${record.name} ${record.id} ${record.ownerName || ''} ${record.path}`.toLocaleLowerCase().includes(search)) : [];
  }
  function clearHighlights() {
    ++state.locateRequest;
    if (embedded) send({ type: 'hbds-query-clear-highlights' });
  }
  function locate(records) {
    if (!embedded || state.waiting || !records.length) return;
    send({ type: 'hbds-query-locate', ticket: state.ticket, requestId: ++state.locateRequest, records: records.map(record => ({
      id: record.id, name: record.name, type: record.type, path: record.path, ownerId: record.ownerId,
      attributeIndex: record.attributeIndex, synthetic: record.synthetic, sourceId: record.sourceId, targetId: record.targetId
    })) });
  }
  function renderResults() {
    const result = state.result, search = $('result-filter').value.toLocaleLowerCase(), rows = filteredResults();
    const pages = Math.max(1, Math.ceil(rows.length / state.pageSize)); state.page = Math.max(0, Math.min(state.page, pages - 1));
    $('results').replaceChildren(); $('details').hidden = true; $('result-summary').textContent = state.message;
    $('result-summary').hidden = !result;
    $('result-summary').classList.toggle('mq-sr-only', Boolean(result && (result.kind === 'scalar' || result.items.length)));
    for (const record of rows.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize)) {
      const tr = document.createElement('tr');
      let owner = record.ownerName || '—';
      if (record.direction === 'reverse') owner = `${state.index.nodes.get(record.targetId)?.name} → ${state.index.nodes.get(record.sourceId)?.name}`;
      [SINGULAR[record.type] + (record.direction === 'reverse' ? ' (reverse)' : ''), record.name].forEach((value, i) => {
        const td = document.createElement('td');
        if (i === 1) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'mq-result-name'; button.textContent = value;
          button.title = `Identifier: ${record.id}\nPath: ${record.path}\nOwner / endpoints: ${owner}`;
          button.setAttribute('aria-description', button.title);
          button.addEventListener('click', () => { $('detail-json').textContent = JSON.stringify(record.data, null, 2); $('details').hidden = false; $('details').open = true; }); td.append(button);
        } else td.textContent = value;
        tr.append(td);
      });
      const td = document.createElement('td'), button = document.createElement('button'); button.type = 'button'; button.textContent = 'Locate'; button.disabled = !embedded || state.waiting || state.ticket === null;
      button.title = `Highlight ${record.name || record.id} in the diagram`;
      button.addEventListener('click', () => locate([record]));
      td.append(button); tr.append(td); $('results').append(tr);
    }
    $('locate-all').disabled = !embedded || state.waiting || state.ticket === null || !rows.length;
    $('locate-all').title = `Highlight all ${rows.length} matching results across every page`;
    $('prev').disabled = !state.page; $('more').disabled = state.page >= pages - 1;
    $('page-size').disabled = result?.kind !== 'elements'; $('result-filter').disabled = result?.kind !== 'elements';
    $('page').textContent = result?.kind === 'scalar' ? 'Count uses all results' : result
      ? `${rows.length ? state.page * state.pageSize + 1 : 0}–${Math.min((state.page + 1) * state.pageSize, rows.length)} of ${rows.length}${search ? ` matching / ${result.items.length} total` : ''} · Page ${state.page + 1} of ${pages}` : 'No results yet';
  }
  function renderCatalog() {
    const available = state.catalog.filter(entry => functorCapability(entry.name, state.index).supported).length;
    $('catalog-count').textContent = `${available} available / ${state.catalog.length} catalogued`;
    const search = $('catalog-search').value.toLocaleLowerCase(), filter = $('catalog-status').value; $('catalog-list').replaceChildren();
    for (const entry of state.catalog) {
      const capability = functorCapability(entry.name, state.index);
      if (filter === 'available' && !capability.supported || filter === 'unavailable' && capability.supported) continue;
      if (!`${entry.name} ${entry.description} ${entry.group}`.toLocaleLowerCase().includes(search)) continue;
      const card = document.createElement('article'), heading = document.createElement('strong'), description = document.createElement('p'), detail = document.createElement('small');
      heading.textContent = `${entry.name} · ${capability.supported ? 'Available' : 'Unavailable'}`; description.textContent = entry.description;
      const sources = entry.sources.map(source => `${source.document}, p. ${source.pages.join(', ')}`).join('; ');
      detail.textContent = `${entry.inputTypes.join(', ')} → ${entry.outputType}. ${capability.reason} Source: ${sources}.`;
      card.append(heading, description, detail); $('catalog-list').append(card);
    }
  }
  function acceptSnapshot(model, source, ticket) {
    if (!Number.isSafeInteger(ticket) || ticket <= state.lastTicket) return;
    state.lastTicket = ticket;
    try {
      const sourceKey = JSON.stringify([source.selectionKey, source.view, source.scope, source.name]), serial = JSON.stringify([sourceKey, model]);
      const changed = serial !== state.serial || !state.index, newModel = sourceKey !== state.sourceKey;
      state.ticket = ticket; state.waiting = false;
      $('model-name').textContent = source.name || 'Untitled model';
      const sourceHint = `${source.name || 'Untitled model'} · ${source.selectionKey !== '@current' ? 'Query preview' : source.view === 'tests' ? 'Tests, includes unsaved edits' : source.view === 'edit' ? 'Edit, includes unsaved edits' : 'Models'} · Read-only query`;
      $('model-name').title = sourceHint; $('model-name').setAttribute('aria-description', sourceHint);
      root.dataset.ticket = String(ticket); notice('');
      if (!changed) {
        state.snapshot = Object.freeze({ ...state.snapshot, source: Object.freeze({ ...source }) });
        renderBuilder(); scheduleQuery(); return;
      }
      state.snapshot = createQuerySnapshot(model, source); state.index = buildQueryIndex(state.snapshot);
      state.serial = serial; state.sourceKey = sourceKey;
      if (newModel) {
        state.values = { element: state.values.element === '*' ? '*' : '', target: '' };
        state.steps.forEach(step => { step.target = ''; });
        $('result-filter').value = ''; state.page = 0;
      }
      if (!state.initialized) {
        state.operation = ({ hyperclass: 'CONT', classAttribute: 'ATTOF', hyperattribute: 'HATTOF', classLink: 'FIN', hyperlink: 'HFIN' })[selectedDiagramElement()?.type] || 'ATT';
        state.initialized = true;
      }
      if (!operation()) { state.operation = ''; state.steps = []; }
      renderBuilder(newModel); renderCatalog(); scheduleQuery();
    } catch (error) {
      state.index = null; state.waiting = true; ++state.generation;
      renderBuilder(); renderCatalog(); notice(`Cannot query the current model: ${error.message}`, true); showQueryError(error);
    }
  }
  $('add').addEventListener('click', () => { state.steps.push({ functor: '', target: '' }); renderSteps(); scheduleQuery(); stepControls.get(state.steps.length - 1)?.combo.input.focus(); });
  $('clear').addEventListener('click', () => { state.steps = []; renderSteps(); scheduleQuery(); });
  $('prev').addEventListener('click', () => { state.page--; renderResults(); });
  $('more').addEventListener('click', () => { state.page++; renderResults(); });
  $('page-size').addEventListener('change', () => { state.pageSize = Number($('page-size').value); state.page = 0; renderResults(); });
  let resultFilterTimer;
  $('result-filter').addEventListener('input', () => { clearHighlights(); clearTimeout(resultFilterTimer); resultFilterTimer = setTimeout(() => { state.page = 0; renderResults(); }, 150); });
  $('locate-all').addEventListener('click', () => locate(filteredResults()));
  $('catalog-search').addEventListener('input', renderCatalog); $('catalog-status').addEventListener('change', renderCatalog);
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ profile: QUERY_PROFILE, snapshot: { ...state.snapshot.source, revision: state.snapshot.revision, capturedAt: state.snapshot.capturedAt }, query: state.compiled, result: state.result }, null, 2));
      $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy JSON'; }, 1800);
    } catch { notice('Clipboard is unavailable. Select a result name to inspect its data.', true); }
  });
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'hbds-query-models') {
      state.models = event.data.models; state.selectedModel = event.data.selected;
      modelCombo.setOptions(state.models, state.selectedModel, false);
    }
    if (event.data?.type === 'hbds-query-model-error') notice(event.data.message, true);
    if (event.data?.type === 'hbds-query-snapshot') { const { model, ...source } = event.data.source; acceptSnapshot(model, source, event.data.ticket); }
    if (event.data?.type === 'hbds-query-waiting') { state.waiting = true; renderBuilder(); scheduleQuery(); }
    if (event.data?.type === 'hbds-query-stale') { state.waiting = true; renderBuilder(); scheduleQuery(); send({ type: 'hbds-query-refresh' }); }
    if (event.data?.type === 'hbds-query-located' && event.data.ticket === state.ticket && event.data.requestId === state.locateRequest) {
      if (event.data.missing) notice(`${event.data.missing} result${event.data.missing === 1 ? '' : 's'} could not be displayed in the diagram.`, true);
    }
  });
  try {
    const response = await fetch('js/hbds_functor_catalog.json');
    if (!response.ok) throw new Error('Could not load the functor catalog.');
    const catalog = await response.json();
    if (catalog.functors?.length !== 141) throw new Error('The functor catalog is incomplete.');
    state.catalog = catalog.functors; renderBuilder(); renderCatalog(); scheduleQuery();
    if (embedded) send({ type: 'hbds-query-ready' });
    else {
      $('model-name').textContent = 'model';
      const link = document.createElement('a'); link.href = 'index.html#models'; link.textContent = 'Open the application';
      notice('Open Query from Models, Edit, or Tests to use the model already selected there. '); $('notice').append(link);
    }
  } catch (error) { notice(error.message, true); }
}
