// Measure the actual font, including bold/italic, once per text/style combination.
const widths = new Map();
let context;
export function textWidthEm(text, font = {}) {
  const family = font.family || 'Arial, sans-serif';
  const key = JSON.stringify([String(text), family, !!font.bold, !!font.italic]);
  if (!widths.has(key)) {
    context ||= globalThis.document?.createElement('canvas').getContext('2d');
    if (context) context.font = `${font.italic ? 'italic' : 'normal'} ${font.bold ? '700' : '400'} 100px ${family}`;
    const width = context ? context.measureText(String(text)).width / 100 : String(text).length * 0.62;
    if (widths.size > 4096) widths.clear();
    widths.set(key, Math.max(0.1, width));
  }
  return widths.get(key);
}

export function fitTextSize(text, font, width, height, maximum, iconEm = 0) {
  return Math.max(0.1, Math.min(maximum, width / (textWidthEm(text, font) + iconEm), height / 1.12));
}

export function linkLabelSize(text, font, rendering = {}) {
  return {
    width: Math.max(Number(rendering.labelCollisionWidth) || 0, 0.85, (textWidthEm(text, font) + 0.84) * 0.36 + 0.08),
    height: Math.max(Number(rendering.labelCollisionHeight) || 0, 0.56)
  };
}
