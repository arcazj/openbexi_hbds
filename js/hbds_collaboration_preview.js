const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 220;
const DEFAULT_MARGIN = 22;
const ATTRIBUTE_ROW_HEIGHT = 12;
const ATTRIBUTE_MARKER_SIZE = 5;
const DENSE_ATTRIBUTE_LIMIT = 18;
const DENSE_NODE_LIMIT = 8;
const DENSE_LINK_LIMIT = 10;
const MAX_CANVAS_WIDTH = 1280;
const MAX_CANVAS_HEIGHT = 820;

export function renderDraftDiagramSvg(model, options = {}) {
  const nodes = Array.isArray(model?.hypergraph?.class) ? model.hypergraph.class : [];
  const links = Array.isArray(model?.hypergraph?.link) ? model.hypergraph.link : [];
  if (!nodes.length) {
    return '<div class="collaboration-diagram-empty">No diagram preview</div>';
  }

  const metrics = modelMetrics(nodes, links);
  const dense = options.dense ?? isDensePreview(metrics);
  const selection = normalizeSelection(options.selection);
  const selectedNodeIds = selectedNodeIdSet(nodes, links, selection);
  const zoom = clamp(finiteNumber(options.zoom) ?? 1, 0.65, 2.25);
  let canvas = previewCanvasSize(metrics, dense, zoom, options);
  let layout = layoutNodes(nodes, canvas.width, canvas.height, { dense, selectedNodeIds });
  for (let attempt = 0; attempt < 4 && hasBlockingNodeOverlap(nodes, layout); attempt += 1) {
    canvas = {
      width: Math.min(MAX_CANVAS_WIDTH, Math.round(canvas.width * 1.22)),
      height: Math.min(MAX_CANVAS_HEIGHT, Math.round(canvas.height * 1.14))
    };
    layout = layoutNodes(nodes, canvas.width, canvas.height, { dense, selectedNodeIds });
  }

  const context = { dense, selection, selectedNodeIds, nodeCount: nodes.length };
  const linkMarkup = links
    .map(link => renderLink(link, layout, context))
    .filter(Boolean)
    .join('');
  const nodeMarkup = sortNodesForRendering(nodes)
    .map(node => renderNode(node, layout, context))
    .join('');

  return `
    <div class="collaboration-diagram-shell${dense ? ' is-dense' : ''}">
      <div class="collaboration-diagram-toolbar">
        <span>${dense ? 'Dense overview' : 'Diagram preview'}</span>
        <div class="collaboration-preview-zoom" aria-label="Preview zoom controls">
          <button type="button" data-collaboration-preview-action="zoom-out" title="Zoom out">-</button>
          <span>${Math.round(zoom * 100)}%</span>
          <button type="button" data-collaboration-preview-action="zoom-in" title="Zoom in">+</button>
          <button type="button" data-collaboration-preview-action="fit" title="Fit preview">Fit</button>
        </div>
      </div>
      <div class="collaboration-diagram-scroll" tabindex="0">
        <svg class="collaboration-diagram" style="width: ${canvas.width}px; height: ${canvas.height}px;" viewBox="0 0 ${canvas.width} ${canvas.height}" role="img" aria-label="Remote diagram preview">
          <rect class="collaboration-diagram-bg" x="0" y="0" width="${canvas.width}" height="${canvas.height}" rx="8"></rect>
          <g class="collaboration-diagram-links">${linkMarkup}</g>
          <g class="collaboration-diagram-nodes">${nodeMarkup}</g>
        </svg>
      </div>
    </div>
  `;
}

function previewCanvasSize(metrics, dense, zoom, options) {
  const requestedWidth = Number(options.width) || DEFAULT_WIDTH;
  const requestedHeight = Number(options.height) || DEFAULT_HEIGHT;
  if (!dense) {
    return {
      width: Math.round(clamp(requestedWidth * zoom, requestedWidth, 760)),
      height: Math.round(clamp(requestedHeight * zoom, requestedHeight, 520))
    };
  }
  const baseWidth = requestedWidth + (metrics.nodes * 70) + (metrics.links * 8) + (metrics.attributes * 3);
  const baseHeight = requestedHeight + (metrics.nodes * 34) + (metrics.hyperclasses * 36);
  return {
    width: Math.round(clamp(baseWidth * zoom, 640, MAX_CANVAS_WIDTH)),
    height: Math.round(clamp(baseHeight * zoom, 340, MAX_CANVAS_HEIGHT))
  };
}

function layoutNodes(nodes, width, height, options) {
  const positioned = nodes.map((node, index) => ({
    node,
    index,
    x: finiteNumber(node?.position?.x),
    y: finiteNumber(node?.position?.y),
    worldSize: nodeWorldSize(node)
  }));
  const hasPositions = positioned.some(item => item.x !== null && item.y !== null);

  const layout = hasPositions
    ? layoutPositionedNodes(positioned, width, height, options)
    : layoutGridNodes(positioned, width, height, options);

  fitHyperclassesAroundChildren(nodes, layout, width, height);
  return layout;
}

function layoutPositionedNodes(positioned, width, height, options) {
  const extents = positioned.map(item => {
    const x = item.x ?? 0;
    const y = item.y ?? 0;
    return {
      minX: x - item.worldSize.width / 2,
      maxX: x + item.worldSize.width / 2,
      minY: y - item.worldSize.height / 2,
      maxY: y + item.worldSize.height / 2
    };
  });
  const minX = Math.min(...extents.map(item => item.minX));
  const maxX = Math.max(...extents.map(item => item.maxX));
  const minY = Math.min(...extents.map(item => item.minY));
  const maxY = Math.max(...extents.map(item => item.maxY));
  const rangeX = Math.max(1, maxX - minX);
  const rangeY = Math.max(1, maxY - minY);
  const scale = Math.min(
    (width - DEFAULT_MARGIN * 2) / rangeX,
    (height - DEFAULT_MARGIN * 2) / rangeY
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 40;

  return new Map(positioned.map(item => {
    const x = DEFAULT_MARGIN + (((item.x ?? minX) - minX) * safeScale);
    const y = DEFAULT_MARGIN + ((maxY - (item.y ?? minY)) * safeScale);
    const size = nodeDisplaySize(item.node, safeScale, positioned.length, options);
    return [
      String(item.node.id),
      {
        x,
        y,
        width: size.width,
        height: size.height,
        node: item.node
      }
    ];
  }));
}

function layoutGridNodes(positioned, width, height, options) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(positioned.length)));
  const rows = Math.max(1, Math.ceil(positioned.length / cols));
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  return new Map(positioned.map(item => {
    const col = item.index % cols;
    const row = Math.floor(item.index / cols);
    const size = nodeDisplaySize(item.node, 48, positioned.length, options);
    return [
      String(item.node.id),
      {
        x: ((col + 0.5) / cols) * width,
        y: ((row + 0.5) / rows) * height,
        width: Math.min(size.width, Math.max(60, cellWidth - 24)),
        height: Math.min(size.height, Math.max(40, cellHeight - 24)),
        node: item.node
      }
    ];
  }));
}

function fitHyperclassesAroundChildren(nodes, layout, width, height) {
  const nodesById = new Map(nodes.map(node => [String(node?.id), node]));
  const maxWidth = Math.max(140, width - DEFAULT_MARGIN * 2);
  const maxHeight = Math.max(96, height - DEFAULT_MARGIN * 2);
  [...nodes]
    .filter(isHyperclass)
    .sort((left, right) => nodeArea(left) - nodeArea(right))
    .forEach(node => {
      const entry = layout.get(String(node?.id));
      if (!entry) return;
      const childIds = new Set([
        ...asArray(node?.children).map(String),
        ...nodes
          .filter(candidate => sameId(candidate?.parentClassId, node?.id))
          .map(candidate => String(candidate.id))
      ]);
      const childEntries = [...childIds]
        .map(id => nodesById.has(id) ? layout.get(id) : null)
        .filter(Boolean);
      if (!childEntries.length) return;

      const minX = Math.min(...childEntries.map(item => item.x - item.width / 2));
      const maxX = Math.max(...childEntries.map(item => item.x + item.width / 2));
      const minY = Math.min(...childEntries.map(item => item.y - item.height / 2));
      const maxY = Math.max(...childEntries.map(item => item.y + item.height / 2));
      entry.width = clamp(Math.max(entry.width, (maxX - minX) + 48), 140, maxWidth);
      entry.height = clamp(Math.max(entry.height, (maxY - minY) + 60), 96, maxHeight);
    });
}

function renderLink(link, layout, context) {
  const source = layout.get(String(link?.sourceClassId));
  const target = layout.get(String(link?.targetClassId));
  if (!source || !target) return '';
  const selected = sameId(link?.id, context.selection.selectedLinkId || context.selection.linkId);
  const stroke = safeColor(link?.rendering?.lineColor || link?.color, '#64748b');
  const lineWidth = selected
    ? 3.2
    : clamp(finiteNumber(link?.rendering?.lineWidth) || 1.5, 1.1, context.dense ? 2.3 : 3);
  return `<line class="collaboration-diagram-link${selected ? ' is-selected' : ''}" x1="${round(source.x)}" y1="${round(source.y)}" x2="${round(target.x)}" y2="${round(target.y)}" stroke="${stroke}" stroke-width="${round(lineWidth)}"></line>`;
}

function renderNode(node, layout, context) {
  const position = layout.get(String(node?.id));
  if (!position) return '';
  const hyperclass = isHyperclass(node);
  const selected = context.selectedNodeIds.has(String(node?.id));
  const classRendering = node?.rendering?.class || {};
  const fill = safeColor(classRendering.color || node?.color, hyperclass ? '#dbeafe' : '#ffffff');
  const stroke = safeColor(classRendering.borderColor || node?.borderColor, hyperclass ? '#2563eb' : '#475569');
  const textColor = safeColor(node?.rendering?.textColor || classRendering.textColor || node?.textColor, '#172033');
  const fillOpacity = hyperclass
    ? clamp(finiteNumber(classRendering.opacity) ?? 0.74, 0.62, 1)
    : clamp(finiteNumber(classRendering.opacity) ?? 1, 0.38, 1);
  const x = position.x - position.width / 2;
  const y = position.y - position.height / 2;
  const radius = hyperclass
    ? clamp((finiteNumber(classRendering.cornerRadius) || 0.18) * 48, 7, 16)
    : clamp((finiteNumber(classRendering.cornerRadius) || 0.1) * 48, 4, 10);
  const attributes = attributeList(node);
  const showAttributes = false;
  const label = truncate(String(node?.name || node?.id || 'Untitled'), titleLimit(position.width, hyperclass));
  const hasAttributeBadge = attributes.length > 0 && !showAttributes;
  const titleY = showAttributes
    ? y + (hyperclass ? 18 : 17)
    : (hasAttributeBadge ? y + 20 : y + (position.height / 2) + 4);
  const titleAnchor = hyperclass ? 'start' : 'middle';
  const titleX = hyperclass ? x + 13 : position.x;
  const attributeMarkup = showAttributes
    ? renderAttributes(node, position, stroke, context)
    : renderAttributeCount(node, position, stroke);

  return `
    <g class="collaboration-diagram-node${hyperclass ? ' is-hyperclass' : ''}${selected ? ' is-selected' : ''}" data-node-id="${escapeHtml(node?.id ?? '')}">
      <rect class="collaboration-diagram-node-body" x="${round(x)}" y="${round(y)}" width="${round(position.width)}" height="${round(position.height)}" rx="${round(radius)}" fill="${fill}" fill-opacity="${round(fillOpacity)}" stroke="${stroke}"></rect>
      ${hyperclass ? renderHyperclassHeader(x, y, position.width, stroke) : ''}
      <text class="collaboration-diagram-title" x="${round(titleX)}" y="${round(titleY)}" text-anchor="${titleAnchor}" fill="${textColor}">${escapeHtml(label)}</text>
      ${attributeMarkup}
    </g>
  `;
}

function renderHyperclassHeader(x, y, width, color) {
  return `<rect class="collaboration-diagram-hyperclass-header" x="${round(x + 1.5)}" y="${round(y + 1.5)}" width="${round(Math.max(1, width - 3))}" height="24" rx="7" fill="${color}"></rect>`;
}

function renderAttributes(node, position, fallbackColor, context) {
  const attributes = attributeList(node);
  if (!attributes.length) return '';

  const hyperclass = isHyperclass(node);
  const startY = position.y - position.height / 2 + (hyperclass ? 34 : 29);
  const availableHeight = (position.y + position.height / 2) - startY - 7;
  const selected = context.selectedNodeIds.has(String(node?.id));
  const rowLimit = context.dense && selected ? 3 : (hyperclass ? 4 : 5);
  const maxRows = Math.max(0, Math.min(rowLimit, Math.floor(availableHeight / ATTRIBUTE_ROW_HEIGHT)));
  if (!maxRows) return renderAttributeCount(node, position, fallbackColor);

  const visibleAttributes = attributes.slice(0, maxRows);
  const remaining = attributes.length - visibleAttributes.length;
  const markerColor = safeColor(node?.rendering?.attributes?.checkboxColor, fallbackColor);
  const labelWidth = Math.max(8, Math.floor((position.width - 28) / 5.2));
  const x = position.x - position.width / 2 + 10;
  const selectedAttrKey = context.selection.selectedAttributeKey;
  const selectedOwnerId = context.selection.selectedAttributeOwnerId;
  const rows = visibleAttributes.map((attribute, index) => {
    const y = startY + (index * ATTRIBUTE_ROW_HEIGHT);
    const label = truncate(attributeDisplayName(attribute, index), labelWidth);
    const attrSelected = sameId(selectedOwnerId, node?.id) && sameId(attributeKeyFor(attribute, index), selectedAttrKey);
    return `
      <g class="collaboration-diagram-attribute${attrSelected ? ' is-selected' : ''}">
        <rect class="collaboration-diagram-attribute-marker" x="${round(x)}" y="${round(y - ATTRIBUTE_MARKER_SIZE + 1)}" width="${ATTRIBUTE_MARKER_SIZE}" height="${ATTRIBUTE_MARKER_SIZE}" rx="1" fill="${markerColor}"></rect>
        <text class="collaboration-diagram-attribute-label" x="${round(x + 10)}" y="${round(y + 1)}">${escapeHtml(label)}</text>
      </g>
    `;
  });
  if (remaining > 0 && visibleAttributes.length) {
    const y = startY + (visibleAttributes.length * ATTRIBUTE_ROW_HEIGHT);
    rows.push(`<text class="collaboration-diagram-attribute-more" x="${round(x + 10)}" y="${round(y + 1)}">+${remaining} attribute${remaining === 1 ? '' : 's'}</text>`);
  }
  return rows.join('');
}

function renderAttributeCount(node, position, fallbackColor) {
  const count = attributeList(node).length;
  if (!count) return '';
  const label = `${count} attr${count === 1 ? '' : 's'}`;
  const badgeWidth = Math.min(Math.max(42, label.length * 5.7 + 14), Math.max(42, position.width - 14));
  const x = position.x - position.width / 2 + 8;
  const y = position.y + position.height / 2 - 18;
  return `
    <g class="collaboration-diagram-attribute-count">
      <rect x="${round(x)}" y="${round(y)}" width="${round(badgeWidth)}" height="14" rx="7" fill="${safeColor(fallbackColor, '#64748b')}"></rect>
      <text x="${round(x + badgeWidth / 2)}" y="${round(y + 10)}">${escapeHtml(label)}</text>
    </g>
  `;
}

function shouldRenderAttributeRows(node, position, context) {
  return false;
}

function sortNodesForRendering(nodes) {
  return [...nodes].sort((left, right) => {
    const leftHyperclass = isHyperclass(left);
    const rightHyperclass = isHyperclass(right);
    if (leftHyperclass !== rightHyperclass) return leftHyperclass ? -1 : 1;
    if (leftHyperclass && rightHyperclass) return nodeArea(right) - nodeArea(left);
    return 0;
  });
}

function nodeDisplaySize(node, scale, nodeCount, options) {
  const hyperclass = isHyperclass(node);
  const dense = Boolean(options?.dense);
  const selected = options?.selectedNodeIds?.has(String(node?.id));
  const worldSize = nodeWorldSize(node);
  const requiredHeight = hyperclass ? 42 : 34;
  const minWidth = hyperclass ? (dense ? 146 : 128) : (selected ? 122 : (dense ? 86 : 76));
  const minHeight = hyperclass ? (dense ? 96 : 86) : (selected ? 72 : (dense ? 46 : 46));
  const maxWidth = hyperclass ? (dense ? 560 : 300) : (selected ? 176 : (dense ? 130 : 146));
  const maxHeight = hyperclass ? (dense ? 260 : 190) : (selected ? 124 : (dense ? 74 : 112));
  return {
    width: clamp(Math.max(worldSize.width * scale, minWidth), minWidth, maxWidth),
    height: clamp(Math.max(worldSize.height * scale, requiredHeight, minHeight), minHeight, maxHeight)
  };
}

function hasBlockingNodeOverlap(nodes, layout) {
  const classEntries = nodes
    .filter(node => !isHyperclass(node))
    .map(node => ({ node, rect: layoutRect(layout.get(String(node?.id))) }))
    .filter(item => item.rect);
  for (let i = 0; i < classEntries.length; i += 1) {
    for (let j = i + 1; j < classEntries.length; j += 1) {
      const area = intersectionArea(classEntries[i].rect, classEntries[j].rect);
      if (area > 12) return true;
    }
  }
  return false;
}

function layoutRect(entry) {
  if (!entry) return null;
  return {
    left: entry.x - entry.width / 2,
    right: entry.x + entry.width / 2,
    top: entry.y - entry.height / 2,
    bottom: entry.y + entry.height / 2
  };
}

function intersectionArea(left, right) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function titleLimit(width, hyperclass) {
  return Math.max(hyperclass ? 14 : 10, Math.floor((width - (hyperclass ? 26 : 14)) / 5.7));
}

function modelMetrics(nodes, links) {
  const hyperclasses = nodes.filter(isHyperclass).length;
  return {
    nodes: nodes.length,
    classes: nodes.length - hyperclasses,
    hyperclasses,
    links: links.length,
    attributes: nodes.reduce((total, node) => total + attributeList(node).length, 0)
  };
}

function isDensePreview(metrics) {
  return metrics.nodes >= DENSE_NODE_LIMIT
    || metrics.links >= DENSE_LINK_LIMIT
    || metrics.attributes >= DENSE_ATTRIBUTE_LIMIT;
}

function selectedNodeIdSet(nodes, links, selection) {
  const ids = new Set(asArray(selection.selectedElementIds).filter(value => value != null).map(String));
  if (selection.selectedElementId != null) ids.add(String(selection.selectedElementId));
  if (selection.classId != null) ids.add(String(selection.classId));
  if (selection.selectedAttributeOwnerId != null) ids.add(String(selection.selectedAttributeOwnerId));
  const selectedLinkId = selection.selectedLinkId || selection.linkId;
  if (selectedLinkId != null) {
    const link = links.find(item => sameId(item?.id, selectedLinkId));
    if (link?.sourceClassId != null) ids.add(String(link.sourceClassId));
    if (link?.targetClassId != null) ids.add(String(link.targetClassId));
  }
  return ids;
}

function normalizeSelection(selection = {}) {
  return selection && typeof selection === 'object' ? selection : {};
}

function nodeWorldSize(node) {
  const hyperclass = isHyperclass(node);
  const width = finiteNumber(node?.size?.width) ?? finiteNumber(node?.width) ?? (hyperclass ? 4.2 : 1.35);
  const height = finiteNumber(node?.size?.height) ?? finiteNumber(node?.height) ?? (hyperclass ? 3.2 : 1.45);
  return {
    width: Math.max(0.5, width),
    height: Math.max(0.4, height)
  };
}

function nodeArea(node) {
  const size = nodeWorldSize(node);
  return size.width * size.height;
}

function attributeList(node) {
  return Array.isArray(node?.attributes) ? node.attributes : [];
}

function attributeDisplayName(attribute, index) {
  if (attribute == null) return `attribute ${index + 1}`;
  if (typeof attribute === 'string' || typeof attribute === 'number' || typeof attribute === 'boolean') {
    return String(attribute);
  }
  if (typeof attribute === 'object') {
    return String(attribute.name || attribute.label || attribute.id || attribute.key || `attribute ${index + 1}`);
  }
  return String(attribute);
}

function attributeKeyFor(attribute, index) {
  if (attribute && typeof attribute === 'object' && attribute.id != null) return String(attribute.id);
  return `idx-${index}`;
}

function isHyperclass(node) {
  return node?.type === 'hyperclass';
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, '');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}...` : value;
}

function safeColor(value, fallback = '#64748b') {
  const clean = String(value || '').trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(clean)) return clean;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(clean)) {
    return clean;
  }
  return fallback;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
