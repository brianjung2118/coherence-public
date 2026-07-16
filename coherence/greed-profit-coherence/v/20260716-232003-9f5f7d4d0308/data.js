(function (root) {
  "use strict";

  const caches = {
    universe: new Map(),
    company: new Map(),
    methodology: new Map(),
  };

  function embedded() {
    const node = root.document && root.document.getElementById("coherence-data");
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (_error) { return null; }
  }

  function embeddedValue(kind, key) {
    const payload = embedded();
    if (!payload) return undefined;
    if (kind === "universe") {
      if (payload.universe) return payload.universe;
      if (payload.metadata && Array.isArray(payload.companies)) {
        return {
          snapshot_id: payload.metadata.snapshot_id,
          diagnostic_as_of: payload.metadata.diagnostic_as_of,
          companies: payload.companies,
        };
      }
    }
    if (kind === "methodology") {
      if (payload.methodology) return payload.methodology;
      if (Array.isArray(payload.sources)) return {source_freshness: payload.sources};
    }
    if (kind === "company" && payload.company && payload.company.company && payload.company.company.code === key) return payload.company;
    if (kind === "company" && Array.isArray(payload.companies)) {
      const company = payload.companies.find((item) => item.code === key);
      if (company) return {company, history: null, history_unavailable: "offline-export"};
    }
    return undefined;
  }

  function loadJson(path, options) {
    const fetcher = root.fetch;
    if (typeof fetcher !== "function") return Promise.reject(new Error("data-loader-unavailable"));
    return fetcher(path, {signal: options && options.signal}).then((response) => {
      if (!response.ok) throw new Error(response.status === 404 ? "data-not-found" : "data-load-failed");
      return response.json();
    });
  }

  function cached(kind, key, path, options) {
    const settings = options || {};
    const cache = caches[kind];
    if (!settings.force && cache.has(key)) return cache.get(key);
    const local = embeddedValue(kind, key);
    const promise = local === undefined ? loadJson(path, settings) : Promise.resolve(local);
    cache.set(key, promise);
    return promise.catch((error) => {
      if (cache.get(key) === promise) cache.delete(key);
      throw error;
    });
  }

  function loadUniverse(options) {
    return cached("universe", "universe", "universe.json", options);
  }

  function loadCompany(code, options) {
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return Promise.reject(new Error("invalid-company-code"));
    return cached("company", code, `companies/${code}.json`, options);
  }

  function loadMethodology(options) {
    return cached("methodology", "methodology", "methodology.json", options);
  }

  function retry(kind, key, options) {
    if (kind === "universe") return loadUniverse(Object.assign({}, options, {force: true}));
    if (kind === "methodology") return loadMethodology(Object.assign({}, options, {force: true}));
    if (kind === "company") return loadCompany(key, Object.assign({}, options, {force: true}));
    return Promise.reject(new Error("invalid-retry-target"));
  }

  function clearCache() {
    Object.values(caches).forEach((cache) => cache.clear());
  }

  root.EDMData = Object.freeze({loadUniverse, loadCompany, loadMethodology, retry, clearCache});
}(typeof window === "undefined" ? globalThis : window));
