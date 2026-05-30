const OVERVIEW_PADDING = 12;
const FALLBACK_CANVAS_SIZE = { width: 224, height: 150 };

let overviewInitialized = false;
let latestData = null;
let latestContext = null;
let overviewDragState = null;

export function initModelOverview(context, data) {
  const canvas = overviewCanvas();
  if (!canvas) return null;
  latestContext = context;
  if (!overviewInitialized) {
    bindOverviewPointerEvents(canvas);
    overviewInitialized = true;
  }
  return updateModelOverview(context, data);
}

export function updateModelOverview(context, data) {
  latestData = data;
  latestContext = context || latestContext;
  const canvas = overviewCanvas();
  if (!canvas) return null;

  syncCanvasSize(canvas);
  const drawingContext = canvas.getContext('2d');
  if (!drawingContext) return null;

  clearOverviewCanvas(drawingContext, canvas);
  const nodes = normalizedOverviewNodes(data);
  if (!nodes.length) {
    updateOverviewViewport(null, null, context);
    return null;
  }

  const bounds = modelBounds(nodes);
  const transform = overviewTransform(bounds, canvas);
  drawOverviewLinks(drawingContext, data, transform);
  drawOverviewHyperclasses(drawingContext, data, transform);
  drawOverviewClasses(drawingContext, data, transform);
  updateOverviewViewport(bounds, transform, context);
  return { bounds, transform };
}

export function drawOverviewHyperclasses(drawingContext, data, transform) {
  drawOverviewNodes(drawingContext, data, transform, true);
}

export function drawOverviewClasses(drawingContext, data, transform) {
  drawOverviewNodes(drawingContext, data, transform, false);
}

export function drawOverviewLinks(drawingContext, data, transform) {
  if (!drawingContext || !transform) return;
  const nodesById = new Map(normalizedOverviewNodes(data).map(node => [node.id, node]));
  const links = Array.isArray(data?.hypergraph?.link) ? data.hypergraph.link : [];
  drawingContext.save();
  drawingContext.lineWidth = 1.4;
  drawingContext.globalAlpha = 0.78;
  for (const link of links) {
    const source = nodesById.get(String(link?.sourceClassId ?? ''));
    const target = nodesById.get(String(link?.targetClassId ?? ''));
    if (!source || !target) continue;
    const a = transform.point(source.x, source.y);
    const b = transform.point(target.x, target.y);
    drawingContext.strokeStyle = link?.rendering?.lineColor || '#64748b';
    drawingContext.beginPath();
    drawingContext.moveTo(a.x, a.y);
    drawingContext.lineTo(b.x, b.y);
    drawingContext.stroke();
  }
  drawingContext.restore();
}

export function updateOverviewViewport(bounds, transform, context) {
  const viewport = document.getElementById('model-overview-viewport');
  if (!viewport) return;
  if (!bounds || !transform || !context?.camera) {
    viewport.style.display = 'none';
    return;
  }

  const target = context.orbitControls?.target || { x: context.camera.position.x, y: context.camera.position.y };
  const distance = Math.max(1, Math.abs((context.camera.position?.z ?? 10) - (target.z ?? 0)));
  const fov = ((context.camera.fov || 50) * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(fov / 2) * distance;
  const visibleWidth = visibleHeight * Math.max(context.camera.aspect || 1, 0.1);
  const topLeft = transform.point((target.x || 0) - visibleWidth / 2, (target.y || 0) + visibleHeight / 2);
  const bottomRight = transform.point((target.x || 0) + visibleWidth / 2, (target.y || 0) - visibleHeight / 2);
  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const width = Math.max(8, Math.abs(bottomRight.x - topLeft.x));
  const height = Math.max(8, Math.abs(bottomRight.y - topLeft.y));

  viewport.style.display = 'block';
  viewport.style.left = `${left}px`;
  viewport.style.top = `${top}px`;
  viewport.style.width = `${width}px`;
  viewport.style.height = `${height}px`;
}

function overviewCanvas() {
  return document.getElementById('model-overview-canvas');
}

function overviewHost() {
  return document.getElementById('model-overview') || overviewCanvas();
}

function syncCanvasSize(canvas) {
  const width = Math.max(1, Math.round(canvas.clientWidth || FALLBACK_CANVAS_SIZE.width));
  const height = Math.max(1, Math.round(canvas.clientHeight || FALLBACK_CANVAS_SIZE.height));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function clearOverviewCanvas(drawingContext, canvas) {
  drawingContext.save();
  drawingContext.fillStyle = '#fbfcfe';
  drawingContext.fillRect(0, 0, canvas.width, canvas.height);
  drawingContext.restore();
}

function normalizedOverviewNodes(data) {
  const classes = Array.isArray(data?.hypergraph?.class) ? data.hypergraph.class : [];
  return classes
    .filter(Boolean)
    .map(node => {
      const size = node.size || {};
      const position = node.position || {};
      return {
        id: String(node.id ?? ''),
        type: node.type || 'class',
        x: finiteNumber(position.x, 0),
        y: finiteNumber(position.y, 0),
        width: Math.max(0.2, finiteNumber(size.width, node.type === 'hyperclass' ? 4 : 1.4)),
        height: Math.max(0.2, finiteNumber(size.height, node.type === 'hyperclass' ? 3 : 1.6)),
        fill: node.rendering?.class?.color || (node.type === 'hyperclass' ? '#dbeafe' : '#f8fafc'),
        stroke: node.rendering?.class?.borderColor || (node.type === 'hyperclass' ? '#2563eb' : '#475569')
      };
    })
    .filter(node => node.id);
}

function modelBounds(nodes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }
  if (!Number.isFinite(minX + maxX + minY + maxY)) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1, width: 2, height: 2 };
  }
  const width = Math.max(0.1, maxX - minX);
  const height = Math.max(0.1, maxY - minY);
  return { minX, maxX, minY, maxY, width, height };
}

function overviewTransform(bounds, canvas) {
  const availableWidth = Math.max(1, canvas.width - OVERVIEW_PADDING * 2);
  const availableHeight = Math.max(1, canvas.height - OVERVIEW_PADDING * 2);
  const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const offsetX = (canvas.width - bounds.width * scale) / 2;
  const offsetY = (canvas.height - bounds.height * scale) / 2;
  return {
    scale,
    point(x, y) {
      return {
        x: offsetX + (x - bounds.minX) * scale,
        y: offsetY + (bounds.maxY - y) * scale
      };
    },
    size(width, height) {
      return {
        width: Math.max(2, width * scale),
        height: Math.max(2, height * scale)
      };
    },
    world(x, y) {
      return {
        x: bounds.minX + (x - offsetX) / scale,
        y: bounds.maxY - (y - offsetY) / scale
      };
    }
  };
}

function drawOverviewNodes(drawingContext, data, transform, hyperclasses) {
  if (!drawingContext || !transform) return;
  const nodes = normalizedOverviewNodes(data).filter(node => (node.type === 'hyperclass') === hyperclasses);
  drawingContext.save();
  for (const node of nodes) {
    const center = transform.point(node.x, node.y);
    const size = transform.size(node.width, node.height);
    const x = center.x - size.width / 2;
    const y = center.y - size.height / 2;
    drawingContext.globalAlpha = hyperclasses ? 0.36 : 0.9;
    drawingContext.fillStyle = node.fill;
    drawingContext.strokeStyle = node.stroke;
    drawingContext.lineWidth = hyperclasses ? 1.5 : 1.2;
    roundedRectPath(drawingContext, x, y, size.width, size.height, hyperclasses ? 5 : 3);
    drawingContext.fill();
    drawingContext.globalAlpha = 0.95;
    drawingContext.stroke();
  }
  drawingContext.restore();
}

function roundedRectPath(drawingContext, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  drawingContext.beginPath();
  drawingContext.moveTo(x + r, y);
  drawingContext.lineTo(x + width - r, y);
  drawingContext.quadraticCurveTo(x + width, y, x + width, y + r);
  drawingContext.lineTo(x + width, y + height - r);
  drawingContext.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  drawingContext.lineTo(x + r, y + height);
  drawingContext.quadraticCurveTo(x, y + height, x, y + height - r);
  drawingContext.lineTo(x, y + r);
  drawingContext.quadraticCurveTo(x, y, x + r, y);
  drawingContext.closePath();
}

function bindOverviewPointerEvents(canvas) {
  const host = overviewHost() || canvas;
  host.addEventListener('pointerdown', handleOverviewPointerDown);
  host.addEventListener('pointermove', handleOverviewPointerMove);
  host.addEventListener('pointerup', handleOverviewPointerEnd);
  host.addEventListener('pointercancel', handleOverviewPointerEnd);
  host.addEventListener('lostpointercapture', handleOverviewPointerEnd);
}

function handleOverviewPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const context = latestContext;
  if (!canPanOverview(context)) return;
  overviewDragState = { pointerId: event.pointerId };
  overviewHost()?.classList?.add('is-dragging');
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events used by regression tests do not always own capture.
  }
  event.preventDefault();
  panOverviewToEvent(event, context);
}

function handleOverviewPointerMove(event) {
  if (!overviewDragState || event.pointerId !== overviewDragState.pointerId) return;
  const context = latestContext;
  if (!canPanOverview(context)) return;
  event.preventDefault();
  panOverviewToEvent(event, context);
}

function handleOverviewPointerEnd(event) {
  if (!overviewDragState || event.pointerId !== overviewDragState.pointerId) return;
  try {
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
  } catch {
    // Ignore capture release errors for synthetic events and interrupted drags.
  }
  overviewDragState = null;
  overviewHost()?.classList?.remove('is-dragging');
}

function canPanOverview(context) {
  return Boolean(context?.camera && context?.orbitControls);
}

function panOverviewToEvent(event, context) {
  const canvas = overviewCanvas();
  if (!canvas || !context?.camera || !context?.orbitControls) return;
  const data = latestData;
  const nodes = normalizedOverviewNodes(data);
  if (!nodes.length) return;
  const bounds = modelBounds(nodes);
  const transform = overviewTransform(bounds, canvas);
  const rect = canvas.getBoundingClientRect();
  const world = transform.world(event.clientX - rect.left, event.clientY - rect.top);
  const dx = world.x - context.orbitControls.target.x;
  const dy = world.y - context.orbitControls.target.y;
  context.camera.position.x += dx;
  context.camera.position.y += dy;
  context.orbitControls.target.x = world.x;
  context.orbitControls.target.y = world.y;
  context.orbitControls.update?.();
  context.renderOnce?.();
  updateModelOverview(context, data);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
