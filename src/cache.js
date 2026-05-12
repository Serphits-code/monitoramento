const config = require('./config');

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > config.cacheTtl) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data) {
  store.set(key, { data, ts: Date.now() });
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear };
