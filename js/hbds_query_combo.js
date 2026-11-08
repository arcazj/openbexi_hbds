// Search edits only filter choices. A committed option changes the query.
export function createQueryCombo({ id, label, placeholder = 'Select…', onChange }) {
  const element = document.createElement('div'); element.className = 'mq-field';
  const caption = document.createElement('label'); caption.htmlFor = id; caption.textContent = label;
  const control = document.createElement('div'); control.className = 'mq-combo';
  const input = document.createElement('input'); input.id = id; input.type = 'text';
  input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = placeholder;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', `${id}-list`);
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'mq-combo-toggle';
  toggle.textContent = '⌄'; toggle.tabIndex = -1; toggle.setAttribute('aria-label', `Show ${label.toLowerCase()} choices`);
  const popup = document.createElement('div'); popup.className = 'mq-combo-popup'; popup.hidden = true;
  const list = document.createElement('div'); list.id = `${id}-list`; list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  const status = document.createElement('div'); status.className = 'mq-combo-status'; status.setAttribute('role', 'status');
  popup.append(list, status); control.append(input, toggle, popup); element.append(caption, control);
  let choices = [], visible = [], selected = '', search = '', active = -1, editing = false;

  function displaySelection() {
    const choice = choices.find(choice => choice.value === selected);
    input.value = choice?.label || ''; input.title = choice?.hint || '';
  }
  function close() {
    popup.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    element.classList.remove('mq-field-open'); editing = false; search = ''; displaySelection();
  }
  function highlight(index) {
    active = index;
    for (const [i, row] of [...list.querySelectorAll('[role=option]')].entries()) row.classList.toggle('mq-option-active', i === active);
    const row = list.querySelectorAll('[role=option]')[active];
    if (row) { input.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function commit(choice) {
    selected = choice.value; input.dataset.value = selected; close();
    onChange(selected);
  }
  function renderOptions() {
    // Compact fields still get a readable popup, kept inside the Query panel.
    const rect = control.getBoundingClientRect(), viewportWidth = document.documentElement.clientWidth;
    const popupWidth = Math.min(Math.max(rect.width, 260), viewportWidth - 20);
    popup.style.width = `${popupWidth}px`; popup.style.right = 'auto';
    popup.style.left = `${Math.max(10, Math.min(rect.left, viewportWidth - popupWidth - 10)) - rect.left}px`;
    const needle = search.trim().toLocaleLowerCase();
    const matches = choices.filter(choice => `${choice.label} ${choice.hint || ''} ${choice.group || ''}`.toLocaleLowerCase().includes(needle));
    visible = matches.slice(0, 200); list.replaceChildren();
    let group = '';
    visible.forEach((choice, index) => {
      if (choice.group && choice.group !== group) {
        const title = document.createElement('div'); title.className = 'mq-combo-group'; title.textContent = choice.group;
        title.setAttribute('role', 'presentation'); list.append(title); group = choice.group;
      }
      const row = document.createElement('div'); row.id = `${id}-option-${index}`; row.className = 'mq-combo-option';
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(choice.value === selected)); row.dataset.value = choice.value;
      const name = document.createElement('span'); name.textContent = choice.label; row.append(name);
      if (choice.hint) { const hint = document.createElement('small'); hint.textContent = choice.hint; row.append(hint); }
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('click', () => commit(choice)); list.append(row);
    });
    status.textContent = !matches.length ? 'No matching choices' : matches.length > 200 ? `Showing 200 of ${matches.length}. Refine your search.` : `${matches.length} choices`;
    active = -1; input.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (input.disabled) return;
    popup.hidden = false; element.classList.add('mq-field-open'); input.setAttribute('aria-expanded', 'true');
    search = ''; editing = false; renderOptions();
  }
  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', () => { if (popup.hidden) { open(); input.select(); } });
  input.addEventListener('input', () => {
    if (popup.hidden) open(); editing = true; search = input.value; renderOptions();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (popup.hidden) open();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      highlight(Math.max(0, Math.min(visible.length - 1, active < 0 ? (delta > 0 ? 0 : visible.length - 1) : active + delta)));
    } else if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault(); const choice = visible[active >= 0 ? active : 0]; if (choice) commit(choice);
    } else if (event.key === 'Escape') {
      if (!popup.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
    } else if (event.key === 'Tab') close();
  });
  input.addEventListener('blur', close);
  toggle.addEventListener('pointerdown', event => event.preventDefault());
  toggle.addEventListener('click', () => {
    if (popup.hidden) { input.focus(); open(); input.select(); } else close();
  });
  const outside = event => { if (!element.contains(event.target)) close(); };
  document.addEventListener('pointerdown', outside);
  return {
    element, input,
    setOptions(next, value, disabled = false) {
      choices = next; selected = choices.some(choice => choice.value === value) ? value : '';
      input.dataset.value = selected; input.disabled = disabled; toggle.disabled = disabled;
      if (!editing) displaySelection();
      if (disabled) close(); else if (!popup.hidden) renderOptions();
    },
    destroy() { document.removeEventListener('pointerdown', outside); element.remove(); }
  };
}
