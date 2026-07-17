(function (root) {
  "use strict";

  const DEFAULT = Object.freeze({view: "company", code: "005930", range: "24m"});
  const VIEWS = new Set(["company", "discovery", "methodology"]);
  const RANGES = new Set(["12m", "24m", "all"]);
  const MARKETS = new Set(["all", "kospi", "kosdaq"]);

  function defaultState(code) {
    return {view: "company", code: canonicalCode(code) || DEFAULT.code, range: "24m"};
  }

  function canonicalCode(value) {
    return typeof value === "string" && /^\d{6}$/.test(value) ? value : null;
  }

  function parseStrict(search) {
    const raw = String(search || "").replace(/^\?/, "");
    if (!raw || raw.includes("%")) return null;
    const pairs = raw.split("&").map((item) => item.split("="));
    if (pairs.some((pair) => pair.length !== 2 || !pair[0] || !pair[1])) return null;
    const keys = pairs.map((pair) => pair[0]);
    if (new Set(keys).size !== keys.length) return null;
    return Object.fromEntries(pairs);
  }

  function read(search) {
    const values = parseStrict(search);
    if (!values || !VIEWS.has(values.view)) return defaultState();
    if (values.view === "company") {
      if (Object.keys(values).join(",") !== "view,code,range") return defaultState();
      const code = canonicalCode(values.code);
      if (!code || !RANGES.has(values.range)) return defaultState();
      return {view: "company", code, range: values.range};
    }
    if (values.view === "discovery") {
      if (Object.keys(values).join(",") !== "view,market" || !MARKETS.has(values.market)) return defaultState();
      return {view: "discovery", market: values.market};
    }
    if (Object.keys(values).join(",") !== "view") return defaultState();
    return {view: "methodology"};
  }

  function canonicalize(state, options) {
    const settings = options || {};
    const codes = Array.isArray(settings.codes) ? new Set(settings.codes.filter(canonicalCode)) : null;
    const fallback = canonicalCode(settings.fallbackCode) || DEFAULT.code;
    if (!state || !VIEWS.has(state.view)) return defaultState(fallback);
    if (state.view === "company") {
      const candidate = canonicalCode(state.code);
      const code = candidate && (!codes || codes.has(candidate)) ? candidate : fallback;
      return {view: "company", code, range: RANGES.has(state.range) ? state.range : "24m"};
    }
    if (state.view === "discovery") {
      return {view: "discovery", market: MARKETS.has(state.market) ? state.market : "all"};
    }
    return {view: "methodology"};
  }

  function query(state) {
    const value = canonicalize(state);
    if (value.view === "company") return `view=company&code=${value.code}&range=${value.range}`;
    if (value.view === "discovery") return `view=discovery&market=${value.market}`;
    return "view=methodology";
  }

  function write(state, target) {
    const locationObject = target && target.location ? target.location : root.location;
    const historyObject = target && target.history ? target.history : root.history;
    const suffix = `?${query(state)}`;
    if (historyObject && locationObject) {
      historyObject.replaceState(null, "", `${locationObject.pathname}${suffix}${locationObject.hash || ""}`);
    }
    return suffix;
  }

  root.EDMState = Object.freeze({read, canonicalize, write, query, DEFAULT});
}(typeof window === "undefined" ? globalThis : window));
