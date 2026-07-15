(function (root) {
  "use strict";

  const STATE_LABEL = {aligned: "동행", "attention-led": "관심 선행", "expectations-led": "기대 선행", "delivery-led": "실적 선행", mixed: "혼재", insufficient: "자료 부족"};
  const BUCKETS = [
    {key: "aligned", label: "동행", states: ["aligned"]},
    {key: "attention-led", label: "관심 선행", states: ["attention-led"]},
    {key: "expectations-led", label: "기대 선행", states: ["expectations-led"]},
    {key: "delivery-led", label: "실적 선행", states: ["delivery-led"]},
    {key: "mixed-insufficient", label: "혼재·자료부족", states: ["mixed", "insufficient"]},
  ];

  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]); }
  function cap(value) { return Number.isFinite(value) ? `${new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value / 1e12)}조원` : "자료 없음"; }
  function score(value) { return Number.isFinite(value) ? new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value) : "—"; }
  function pillarAudit(item, key) {
    const audit = (item.pillar_audit || []).find((row) => row.key === key);
    if (!audit) return "감사자료 없음";
    const status = audit.stale ? "오래됨" : audit.missing ? "결측" : "정상";
    return `${audit.source_as_of || "기준일 없음"} · ${status} · ${audit.coverage || "범위 없음"}${audit.missing_reason ? ` · ${audit.missing_reason}` : ""}`;
  }
  function auditScore(item, key) { return `${score(item[`${key}_score`])}<small>${esc(pillarAudit(item, key))}</small>`; }
  function nullLastNumber(a, b, direction) {
    const av = Number.isFinite(a) ? a : null, bv = Number.isFinite(b) ? b : null;
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av == null && bv == null) return 0;
    return direction * (av - bv);
  }

  function mount(container, context) {
    if (!container || !context || !context.universe) throw new Error("invalid-discovery-context");
    const companies = (context.universe.companies || []).slice();
    const sectors = [...new Set(companies.map((item) => item.sector_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    const state = {market: context.state && context.state.market || "all", sector: "", bucket: "", stateFilter: "", confidence: "", coverage: "", search: "", sort: "market-cap"};

    container.innerHTML = `<section class="discovery-workspace" data-workspace="discovery"><header class="workspace-heading"><div><p class="eyebrow">리서치 후보 선별</p><h1 tabindex="-1">종목 탐색</h1><p>진단 상태를 좁혀 기업 분석으로 이동합니다.</p></div><span class="diagnostic-date">진단 기준 ${esc(context.universe.diagnostic_as_of)}</span></header><div class="bucket-grid" aria-label="진단 상태 바로가기"></div><section class="filter-panel" aria-label="종목 필터"><div class="market-control" role="group" aria-label="시장"><button type="button" data-market="all">전체</button><button type="button" data-market="kospi">KOSPI</button><button type="button" data-market="kosdaq">KOSDAQ</button></div><label>검색<input id="discovery-search" type="search" placeholder="종목명 · 코드"></label><label>업종<select id="sector-filter"><option value="">전체</option>${sectors.map((sector) => `<option>${esc(sector)}</option>`).join("")}</select></label><label>상태<select id="state-filter"><option value="">전체</option>${Object.entries(STATE_LABEL).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label><label>신뢰도<select id="confidence-filter"><option value="">전체</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label><label>기대 자료<select id="coverage-filter"><option value="">전체</option><option value="expectations-covered">포함</option><option value="baseline-only">없음</option></select></label><label>정렬<select id="sort-select"><option value="market-cap">시가총액</option><option value="attention-desc">관심</option><option value="expectations-desc">기대</option><option value="delivery-desc">실적</option><option value="gap-desc">기대−실적 차이</option></select></label></section><p id="discovery-count" class="result-count" aria-live="polite"></p><div class="table-wrap"><table><thead><tr><th>기업</th><th>상태</th><th>시가총액</th><th>관심</th><th>기대</th><th>실적</th><th>기대−실적</th></tr></thead><tbody></tbody></table></div><p class="nonclaim">선별용 진단입니다. 순위나 투자 추천이 아닙니다.</p></section>`;

    const tbody = container.querySelector("tbody");
    const bucketRoot = container.querySelector(".bucket-grid");
    const marketMatches = (item) => state.market === "all" || String(item.market || "").toLowerCase() === state.market;
    const sectorMatches = (item) => !state.sector || item.sector_name === state.sector;
    function bucketBase() { return companies.filter((item) => marketMatches(item) && sectorMatches(item)); }
    function renderBuckets() {
      const base = bucketBase();
      bucketRoot.innerHTML = BUCKETS.map((bucket) => `<button type="button" class="bucket-button" data-bucket="${bucket.key}" aria-pressed="${state.bucket === bucket.key}"><span>${bucket.label}</span><strong>${base.filter((item) => bucket.states.includes(item.state)).length}</strong></button>`).join("");
      bucketRoot.querySelectorAll("[data-bucket]").forEach((button) => button.addEventListener("click", () => { const focusBucket = button.dataset.bucket; state.bucket = state.bucket === focusBucket ? "" : focusBucket; state.stateFilter = ""; container.querySelector("#state-filter").value = ""; render(focusBucket); }));
    }
    function ordered(rows) {
      const direction = -1;
      return rows.sort((a, b) => {
        let compared = 0;
        if (state.sort === "market-cap") compared = nullLastNumber(a.market_cap_krw, b.market_cap_krw, direction);
        if (state.sort === "attention-desc") compared = nullLastNumber(a.attention_score, b.attention_score, direction);
        if (state.sort === "expectations-desc") compared = nullLastNumber(a.expectations_score, b.expectations_score, direction);
        if (state.sort === "delivery-desc") compared = nullLastNumber(a.delivery_score, b.delivery_score, direction);
        if (state.sort === "gap-desc") compared = nullLastNumber(Number.isFinite(a.expectations_score) && Number.isFinite(a.delivery_score) ? a.expectations_score - a.delivery_score : null, Number.isFinite(b.expectations_score) && Number.isFinite(b.delivery_score) ? b.expectations_score - b.delivery_score : null, direction);
        return compared || a.code.localeCompare(b.code);
      });
    }
    function rows() {
      const bucket = BUCKETS.find((item) => item.key === state.bucket);
      const query = state.search.trim().toLowerCase();
      return ordered(companies.filter((item) => marketMatches(item) && sectorMatches(item) && (!bucket || bucket.states.includes(item.state)) && (!state.stateFilter || item.state === state.stateFilter) && (!state.confidence || item.confidence === state.confidence) && (!state.coverage || item.coverage_mode === state.coverage) && (!query || `${item.name} ${item.code}`.toLowerCase().includes(query))));
    }
    function activate(code) { if (typeof context.onOpenCompany === "function") context.onOpenCompany(code); }
    function render(focusBucket) {
      renderBuckets();
      container.querySelectorAll("[data-market]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.market === state.market)));
      const visible = rows();
      container.querySelector("#discovery-count").textContent = `${visible.length}개 종목`;
      tbody.innerHTML = visible.length ? visible.map((item) => { const gap = Number.isFinite(item.expectations_score) && Number.isFinite(item.delivery_score) ? item.expectations_score - item.delivery_score : null; return `<tr tabindex="0" data-code="${esc(item.code)}" aria-label="${esc(`${item.name} ${item.code} 기업 분석 열기`)}"><td><strong>${esc(item.name)}</strong><small>${esc(item.code)} · ${esc(item.market)} · ${esc(item.sector_name || "업종 없음")}</small><small>기준 ${esc(item.market_cap_as_of || context.universe.diagnostic_as_of)}</small></td><td>${esc(STATE_LABEL[item.state] || "자료 부족")}<small>신뢰도 ${esc(item.confidence)} · ${esc(item.coverage_mode)}</small></td><td>${esc(cap(item.market_cap_krw))}</td><td>${auditScore(item, "attention")}</td><td>${auditScore(item, "expectations")}</td><td>${auditScore(item, "delivery")}</td><td>${score(gap)}</td></tr>`; }).join("") : '<tr><td colspan="7" class="empty">조건에 맞는 종목이 없습니다.</td></tr>';
      tbody.querySelectorAll("[data-code]").forEach((row) => { row.addEventListener("click", () => activate(row.dataset.code)); row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(row.dataset.code); } }); });
      if (typeof context.onStateChange === "function") context.onStateChange({market: state.market});
      if (focusBucket) bucketRoot.querySelector(`[data-bucket="${focusBucket}"]`)?.focus();
    }
    container.querySelectorAll("[data-market]").forEach((button) => button.addEventListener("click", () => { state.market = button.dataset.market; render(); }));
    [["#sector-filter", "sector"], ["#confidence-filter", "confidence"], ["#coverage-filter", "coverage"], ["#sort-select", "sort"]].forEach(([selector, key]) => container.querySelector(selector).addEventListener("change", (event) => { state[key] = event.target.value; render(); }));
    container.querySelector("#state-filter").addEventListener("change", (event) => { state.bucket = ""; state.stateFilter = event.target.value; render(); });
    container.querySelector("#discovery-search").addEventListener("input", (event) => { state.search = event.target.value; render(); });
    render();
    return Object.freeze({destroy() { container.replaceChildren(); }});
  }

  root.EDMDiscovery = Object.freeze({mount});
}(typeof window === "undefined" ? globalThis : window));
