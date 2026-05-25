const DEFAULT_MARGIN = 12;
const boundPanels = new WeakSet();

export function bindFloatingPanel(panel, handle, options = {}) {
  if (!panel || !handle || boundPanels.has(panel)) return;
  boundPanels.add(panel);

  const storageKey = options.storageKey || '';
  const sizeStorageKey = options.sizeStorageKey || (storageKey ? `${storageKey}:size` : '');
  const resizeOptions = {
    minWidth: options.minWidth || 320,
    minHeight: options.minHeight || 320,
    maxWidth: options.maxWidth || null,
    maxHeight: options.maxHeight || null
  };
  if (options.resizable) restoreSize(panel, sizeStorageKey, resizeOptions);
  restorePosition(panel, storageKey);

  let drag = null;
  let resize = null;
  let resizeObserverTimer = null;

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    panel.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    movePanel(panel, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });

  const endDrag = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    panel.classList.remove('is-dragging');
    persistPosition(panel, storageKey);
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  if (options.resizable) {
    panel.classList.add('is-floating-resizable');

    const startResize = (event, direction, captureTarget) => {
      const rect = panel.getBoundingClientRect();
      resize = {
        pointerId: event.pointerId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
      panel.classList.add('is-resizing');
      try {
        captureTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Some synthetic/headless pointer events do not create an active pointer capture target.
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const endResize = event => {
      if (!resize || event.pointerId !== resize.pointerId) return;
      resize = null;
      panel.classList.remove('is-resizing');
      persistSize(panel, sizeStorageKey);
      persistPosition(panel, storageKey);
      event.stopPropagation();
    };

    panel.querySelectorAll('[data-floating-resize]').forEach(resizeHandle => {
      resizeHandle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        startResize(event, resizeHandle.dataset.floatingResize || '', resizeHandle);
      });

      resizeHandle.addEventListener('pointermove', event => {
        if (!resize || event.pointerId !== resize.pointerId) return;
        resizePanel(panel, resize, event, resizeOptions);
        event.stopPropagation();
      });

      resizeHandle.addEventListener('pointerup', endResize);
      resizeHandle.addEventListener('pointercancel', endResize);
    });

    panel.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.defaultPrevented || isInteractiveTarget(event.target)) return;
      const direction = edgeResizeDirection(panel.getBoundingClientRect(), event);
      if (!direction) return;
      startResize(event, direction, panel);
    });

    panel.addEventListener('pointermove', event => {
      if (!resize || event.pointerId !== resize.pointerId) return;
      resizePanel(panel, resize, event, resizeOptions);
      event.stopPropagation();
    });

    panel.addEventListener('pointerup', endResize);
    panel.addEventListener('pointercancel', endResize);
    window.addEventListener('pointermove', event => {
      if (!resize || event.pointerId !== resize.pointerId) return;
      resizePanel(panel, resize, event, resizeOptions);
    });
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        if (resize || panel.hidden) return;
        window.clearTimeout(resizeObserverTimer);
        resizeObserverTimer = window.setTimeout(() => {
          clampPanelSize(panel, resizeOptions);
          clampPanel(panel);
          persistSize(panel, sizeStorageKey);
          persistPosition(panel, storageKey);
        }, 120);
      });
      resizeObserver.observe(panel);
    }
  }

  window.addEventListener('resize', () => {
    if (!panel.hidden) {
      if (options.resizable) {
        clampPanelSize(panel, resizeOptions);
      }
      clampPanel(panel);
      if (options.resizable) persistSize(panel, sizeStorageKey);
      persistPosition(panel, storageKey);
    }
  });
}

export function clampFloatingPanel(panel) {
  if (!panel || panel.hidden) return;
  clampPanel(panel);
}

function movePanel(panel, left, top) {
  const clamped = clampPosition(panel, left, top);
  panel.style.left = `${clamped.left}px`;
  panel.style.top = `${clamped.top}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function clampPanel(panel) {
  const rect = panel.getBoundingClientRect();
  movePanel(panel, rect.left, rect.top);
}

function resizePanel(panel, resize, event, options) {
  const direction = resize.direction;
  const dx = event.clientX - resize.startX;
  const dy = event.clientY - resize.startY;
  let width = resize.width;
  let height = resize.height;
  let left = resize.left;
  let top = resize.top;

  if (direction.includes('e')) width = resize.width + dx;
  if (direction.includes('s')) height = resize.height + dy;
  if (direction.includes('w')) {
    width = resize.width - dx;
    left = resize.right - width;
  }
  if (direction.includes('n')) {
    height = resize.height - dy;
    top = resize.bottom - height;
  }

  const limits = sizeLimits(options);
  width = Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(width)));
  height = Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(height)));
  if (direction.includes('w')) left = resize.right - width;
  if (direction.includes('n')) top = resize.bottom - height;

  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  movePanel(panel, left, top);
}

function clampPanelSize(panel, options) {
  const rect = panel.getBoundingClientRect();
  const limits = sizeLimits(options);
  const width = Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(rect.width)));
  const height = Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(rect.height)));
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
}

function clampPosition(panel, left, top) {
  const rect = panel.getBoundingClientRect();
  const maxLeft = Math.max(DEFAULT_MARGIN, window.innerWidth - rect.width - DEFAULT_MARGIN);
  const maxTop = Math.max(DEFAULT_MARGIN, window.innerHeight - rect.height - DEFAULT_MARGIN);
  return {
    left: Math.min(maxLeft, Math.max(DEFAULT_MARGIN, Math.round(left))),
    top: Math.min(maxTop, Math.max(DEFAULT_MARGIN, Math.round(top)))
  };
}

function edgeResizeDirection(rect, event) {
  const zone = 14;
  const nearNorth = event.clientY - rect.top <= zone;
  const nearSouth = rect.bottom - event.clientY <= zone;
  const nearWest = event.clientX - rect.left <= zone;
  const nearEast = rect.right - event.clientX <= zone;
  if (!nearNorth && !nearSouth && !nearWest && !nearEast) return '';
  return `${nearNorth ? 'n' : ''}${nearSouth ? 's' : ''}${nearWest ? 'w' : ''}${nearEast ? 'e' : ''}`;
}

function persistPosition(panel, storageKey) {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const rect = panel.getBoundingClientRect();
    window.localStorage.setItem(storageKey, JSON.stringify({
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    }));
  } catch {
    // Position persistence is optional.
  }
}

function persistSize(panel, storageKey) {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const rect = panel.getBoundingClientRect();
    window.localStorage.setItem(storageKey, JSON.stringify({
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }));
  } catch {
    // Size persistence is optional.
  }
}

function restorePosition(panel, storageKey) {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return;
    const position = JSON.parse(value);
    if (!Number.isFinite(position?.left) || !Number.isFinite(position?.top)) return;
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  } catch {
    // Ignore invalid stored panel coordinates.
  }
}

function restoreSize(panel, storageKey, options) {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return;
    const size = JSON.parse(value);
    if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return;
    const limits = sizeLimits(options);
    panel.style.width = `${Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(size.width)))}px`;
    panel.style.height = `${Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(size.height)))}px`;
  } catch {
    // Ignore invalid stored panel sizes.
  }
}

function sizeLimits(options) {
  const maxAvailableWidth = Math.max(160, window.innerWidth - DEFAULT_MARGIN * 2);
  const maxAvailableHeight = Math.max(160, window.innerHeight - DEFAULT_MARGIN * 2);
  const configuredMaxWidth = options.maxWidth == null ? NaN : Number(options.maxWidth);
  const configuredMaxHeight = options.maxHeight == null ? NaN : Number(options.maxHeight);
  const maxWidth = Number.isFinite(configuredMaxWidth)
    ? Math.min(configuredMaxWidth, maxAvailableWidth)
    : maxAvailableWidth;
  const maxHeight = Number.isFinite(configuredMaxHeight)
    ? Math.min(configuredMaxHeight, maxAvailableHeight)
    : maxAvailableHeight;
  const minWidth = Math.min(maxWidth, Math.max(220, Number(options.minWidth) || 320));
  const minHeight = Math.min(maxHeight, Math.max(220, Number(options.minHeight) || 320));
  return { minWidth, minHeight, maxWidth, maxHeight };
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, input, select, textarea, a, [role="button"], [data-floating-resize]'));
}
