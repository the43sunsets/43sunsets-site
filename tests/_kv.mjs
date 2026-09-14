export class KV {
  constructor() { this.data = new Map(); this.options = new Map(); }
  async get(key, type) { const value = this.data.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; }
  async put(key, value, options) { this.data.set(key, value); this.options.set(key, options); }
  async delete(key) { this.data.delete(key); this.options.delete(key); }
  async list({ prefix = "", cursor = "0", limit = 1000 } = {}) {
    const all = [...this.data.keys()].filter(k => k.startsWith(prefix)).sort();
    const offset = Number(cursor), end = offset + Math.min(limit, 2); // Exercise pagination even with small fixtures.
    return { keys: all.slice(offset, end).map(name => ({ name })), list_complete: end >= all.length, cursor: String(end) };
  }
}
