(async function () {
  "use strict";

  const dataApi = window.EDMData;
  const stateApi = window.EDMState;
  const root = document.getElementById("workspace-root");
  if (!dataApi || !stateApi || !root || !window.EDMCompany || !window.EDMDiscovery || !window.EDMMethodology) return;

  let requested = stateApi.read(window.location.search);
  const embedded = document.getElementById("coherence-data");
  if (!window.location.search && embedded) {
    try {
      const payload = JSON.parse(embedded.textContent);
      const code = payload.company && payload.company.company && payload.company.company.code;
      if (/^\d{6}$/.test(code || "")) requested = {view: "company", code, range: "24m"};
    } catch (_error) { /* loader renders the recoverable state */ }
  }

  let universe = null;
  let state = requested;
  let requestId = 0;
  let controller = null;

  function markNavigation(view) {
    document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-current", button.dataset.view === view ? "page" : "false"));
  }

  function focusHeading() {
    const heading = root.querySelector("h1");
    if (heading) heading.focus({preventScroll: true});
  }

  function write(next) {
    state = stateApi.canonicalize(next, {codes: universe.companies.map((company) => company.code), fallbackCode: universe.companies.find((company) => company.code === "005930")?.code || universe.companies[0].code});
    stateApi.write(state);
  }

  function loading(label) {
    root.innerHTML = `<section class="loading-state" aria-busy="true"><span class="spinner" aria-hidden="true"></span><p>${label}</p></section>`;
  }

  async function boot() {
    loading("종목 자료를 불러오는 중");
    try {
      universe = await dataApi.loadUniverse();
      if (!universe || !Array.isArray(universe.companies) || !universe.companies.length) throw new Error("empty-universe");
    } catch (_error) {
      root.innerHTML = '<section class="load-error boot-error" role="alert"><strong>종목 자료를 불러오지 못했습니다</strong><span>연결을 확인한 뒤 다시 시도하세요.</span><button type="button">다시 시도</button></section>';
      const retry = root.querySelector("button");
      retry.addEventListener("click", async () => { retry.disabled = true; try { universe = await dataApi.retry("universe"); await start(); } catch (_again) { retry.disabled = false; retry.focus(); } });
      retry.focus();
      return false;
    }
    return true;
  }

  async function showCompany(code, range, options) {
    const entry = universe.companies.find((company) => company.code === code) || universe.companies.find((company) => company.code === "005930") || universe.companies[0];
    write({view: "company", code: entry.code, range: range || "24m"});
    markNavigation("company");
    loading("기업 자료를 불러오는 중");
    if (controller) controller.abort();
    controller = new AbortController();
    const current = ++requestId;
    let payload = null, error = null;
    try {
      payload = options && options.force ? await dataApi.retry("company", entry.code, {signal: controller.signal}) : await dataApi.loadCompany(entry.code, {signal: controller.signal});
    } catch (caught) {
      if (caught && caught.name === "AbortError") return;
      error = caught;
    }
    if (current !== requestId) return;
    window.EDMCompany.mount(root, {
      company: payload,
      universe,
      universeEntry: entry,
      diagnosticAsOf: universe.diagnostic_as_of,
      state,
      error,
      onRangeChange(nextRange) { showCompany(entry.code, nextRange); },
      onRetry() { showCompany(entry.code, state.range, {force: true}); },
    });
    if (!error) focusHeading();
  }

  function showDiscovery(market) {
    if (controller) controller.abort();
    requestId += 1;
    write({view: "discovery", market: market || "all"});
    markNavigation("discovery");
    window.EDMDiscovery.mount(root, {
      universe,
      state,
      onOpenCompany(code) { showCompany(code, "24m"); },
      onStateChange(next) { if (state.view === "discovery" && next.market !== state.market) write({view: "discovery", market: next.market}); },
    });
    focusHeading();
  }

  async function showMethodology(options) {
    if (controller) controller.abort();
    const current = ++requestId;
    write({view: "methodology"});
    markNavigation("methodology");
    loading("방법론 자료를 불러오는 중");
    let methodology = null;
    try { methodology = options && options.force ? await dataApi.retry("methodology") : await dataApi.loadMethodology(); } catch (_error) { methodology = null; }
    if (current !== requestId) return;
    window.EDMMethodology.mount(root, {methodology, onRetry() { showMethodology({force: true}); }});
    if (methodology) focusHeading();
  }

  async function route(next) {
    if (next.view === "discovery") return showDiscovery(next.market);
    if (next.view === "methodology") return showMethodology();
    return showCompany(next.code, next.range);
  }

  async function start() {
    const fallback = universe.companies.find((company) => company.code === "005930") || universe.companies[0];
    state = stateApi.canonicalize(requested, {codes: universe.companies.map((company) => company.code), fallbackCode: fallback.code});
    document.getElementById("global-date").textContent = `기준 ${universe.diagnostic_as_of}`;
    document.getElementById("snapshot-id").textContent = universe.snapshot_id;
    await route(state);
  }

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view === "company") {
      const code = state.view === "company" ? state.code : (universe.companies.find((company) => company.code === "005930") || universe.companies[0]).code;
      showCompany(code, state.view === "company" ? state.range : "24m");
    } else if (button.dataset.view === "discovery") showDiscovery("all");
    else showMethodology();
  }));

  if (await boot()) await start();
}());
