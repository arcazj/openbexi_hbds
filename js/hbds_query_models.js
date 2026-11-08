import { listServerModels, loadServerModel } from './hbds_server_api.js?v=server-api-20260718a';

// Use the same libraries as Models and Tests, without loading a renderer into
// the shell or replacing the live editor's model.
export async function listQueryModels(serverConnected) {
  const scopes = ['models', 'test_models'];
  const results = await Promise.allSettled(scopes.map(async scope => {
    if (scope === 'models' && serverConnected) {
      const result = await listServerModels({ timeoutMs: 2500 });
      if (result.ok) return result.models.map(item => ({
        value: `models/${item.name}`, name: item.name, label: item.label,
        scope, server: true, description: item.description
      }));
    }
    const response = await fetch(`${scope}/${scope}_manifest.json`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Cannot load ${scope === 'models' ? 'Models' : 'Tests'}.`);
    const manifest = await response.json();
    return (manifest.models || []).map(item => {
      const path = String(item.value || item.path || item.id || '').replace(/^\.\//, '');
      const name = path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : path;
      return { value: `${scope}/${name}`, name, label: item.label || item.name || name, scope, description: item.description };
    });
  }));
  const entries = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      if (!/^[^/\\]+\.json$/i.test(item.name) || item.name.includes('..') || /manifest\.json$/i.test(item.name)) continue;
      entries.set(item.value, { ...item, group: item.scope === 'models' ? 'Models' : 'Tests' });
    }
  }
  return [...entries.values()].sort((a, b) => a.scope.localeCompare(b.scope) || a.label.localeCompare(b.label));
}

export async function loadQueryModel(entry) {
  if (entry.server) {
    const result = await loadServerModel(entry.name, { timeoutMs: 12000 });
    if (!result.ok) throw new Error(result.error?.message || 'Could not load this model.');
    return result.data.model;
  }
  const response = await fetch(`${entry.scope}/${encodeURIComponent(entry.name)}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Could not load ${entry.label} (${response.status}).`);
  return response.json();
}
