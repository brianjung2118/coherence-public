(function (root) {
  "use strict";

  const BUCKETS = [
    {key: "greed-led", label: "시장 탐욕 선행"},
    {key: "balanced", label: "균형"},
    {key: "evidence-led", label: "사업 근거 선행"},
    {key: "insufficient", label: "자료 부족"},
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
  function compositeScore(item, key) {
    return `${score(item[`${key}_score`])}<small>${esc(item[`${key}_coverage`] || "0/3")}</small>`;
  }
  function nullLastNumber(a, b, direction) {
    const av = Number.isFinite(a) ? a : null, bv = Number.isFinite(b) ? b : null;
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av == null && bv == null) return 0;
    return direction * (av - bv);
  }
  function gap(item) { return Number.isFinite(item.greed_score) && Number.isFinite(item.support_score) ? item.greed_score - item.support_score : null; }
  function gapBucket(item) {
    const value = gap(item);
    if (!Number.isFinite(value)) return "insufficient";
    if (value >= 10) return "greed-led";
    if (value <= -10) return "evidence-led";
    return "balanced";
  }
  function gapLabel(value) {
    if (!Number.isFinite(value)) return "자료 부족";
    if (value >= 10) return "시장 탐욕 선행";
    if (value <= -10) return "사업 근거 선행";
    return "균형";
  }

  function mount(container, context) {
    if (!container || !context || !context.universe) throw new Error("invalid-discovery-context");
    const companies = (context.universe.companies || []).slice();
    const sectors = [...new Set(companies.map((item) => item.sector_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    const state = {market: context.state && context.state.market || "all", sector: "", bucket: "", coverage: "", search: "", sort: "market-cap"};

    container.innerHTML = `<section class="discovery-workspace" data-workspace="discovery"><header class="workspace-heading"><div><p class="eyebrow">EDM 리서치 선별</p><h1 tabindex="-1">종목 탐색</h1></div><span class="diagnostic-date">진단 기준 ${esc(context.universe.diagnostic_as_of)}</span></header><section class="discovery-intro"><h2>어디에서 시장과 사업이 가장 멀어졌는가?</h2><p>EDM 괴리가 큰 기업부터 확인하고, 이유는 기업 분석에서 살펴봅니다.</p><div><span><strong>+</strong> 시장 탐욕 선행</span><span><strong>0</strong> 균형</span><span><strong>−</strong> 사업 근거 선행</span></div></section><div class="bucket-grid" aria-label="EDM 괴리 바로가기"></div><section class="discovery-toolbar" aria-label="종목 필터"><div class="market-control" role="group" aria-label="시장"><button type="button" data-market="all">전체</button><button type="button" data-market="kospi">KOSPI</button><button type="button" data-market="kosdaq">KOSDAQ</button></div><label class="discovery-search">검색<input id="discovery-search" type="search" placeholder="종목명 · 코드"></label><label>정렬<select id="sort-select"><option value="market-cap">시가총액</option><option value="greed-led">시장 탐욕 선행</option><option value="evidence-led">사업 근거 선행</option></select></label><details data-discovery-filters><summary>필터 더보기</summary><div><label>업종<select id="sector-filter"><option value="">전체</option>${sectors.map((sector) => `<option>${esc(sector)}</option>`).join("")}</select></label><label>증권사 기대<select id="coverage-filter"><option value="">전체</option><option value="expectations-covered">있음</option><option value="baseline-only">없음</option></select></label></div></details></section><p id="discovery-count" class="result-count" aria-live="polite"></p><div class="table-wrap"><table><thead><tr><th>기업</th><th>시가총액</th><th>EDM 괴리</th><th>탐욕</th><th>사업 근거</th></tr></thead><tbody></tbody></table></div><p class="nonclaim">EDM 괴리는 탐욕−사업 근거입니다. 투자 추천이나 적정가 판단이 아닙니다.</p></section>`;

    const tbody = container.querySelector("tbody");
    const bucketRoot = container.querySelector(".bucket-grid");
    const marketMatches = (item) => state.market === "all" || String(item.market || "").toLowerCase() === state.market;
    const sectorMatches = (item) => !state.sector || item.sector_name === state.sector;
    function bucketBase() { return companies.filter((item) => marketMatches(item) && sectorMatches(item)); }
    function renderBuckets() {
      const base = bucketBase();
      bucketRoot.innerHTML = BUCKETS.map((bucket) => `<button type="button" class="bucket-button" data-bucket="${bucket.key}" aria-pressed="${state.bucket === bucket.key}"><span>${bucket.label}</span><strong>${base.filter((item) => gapBucket(item) === bucket.key).length}</strong></button>`).join("");
      bucketRoot.querySelectorAll("[data-bucket]").forEach((button) => button.addEventListener("click", () => { const focusBucket = button.dataset.bucket; state.bucket = state.bucket === focusBucket ? "" : focusBucket; render(focusBucket); }));
    }
    function ordered(rows) {
      const direction = -1;
      return rows.sort((a, b) => {
        let compared = 0;
        if (state.sort === "market-cap") compared = nullLastNumber(a.market_cap_krw, b.market_cap_krw, direction);
        if (state.sort === "greed-led") compared = nullLastNumber(gap(a), gap(b), -1);
        if (state.sort === "evidence-led") compared = nullLastNumber(gap(a), gap(b), 1);
        return compared || a.code.localeCompare(b.code);
      });
    }
    function rows() {
      const bucket = BUCKETS.find((item) => item.key === state.bucket);
      const query = state.search.trim().toLowerCase();
      return ordered(companies.filter((item) => marketMatches(item) && sectorMatches(item) && (!bucket || gapBucket(item) === bucket.key) && (!state.coverage || item.coverage_mode === state.coverage) && (!query || `${item.name} ${item.code}`.toLowerCase().includes(query))));
    }
    function activate(code) { if (typeof context.onOpenCompany === "function") context.onOpenCompany(code); }
    function render(focusBucket) {
      renderBuckets();
      container.querySelectorAll("[data-market]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.market === state.market)));
      const visible = rows();
      container.querySelector("#discovery-count").textContent = `${visible.length}개 종목`;
      tbody.innerHTML = visible.length ? visible.map((item) => { const value = gap(item); return `<tr tabindex="0" data-code="${esc(item.code)}" data-gap="${Number.isFinite(value) ? value : ""}" aria-label="${esc(`${item.name} ${item.code} 기업 분석 열기`)}"><td><strong>${esc(item.name)}</strong><small>${esc(item.code)} · ${esc(item.market)} · ${esc(item.sector_name || "업종 없음")}</small></td><td>${esc(cap(item.market_cap_krw))}<small>기준 ${esc(item.market_cap_as_of || context.universe.diagnostic_as_of)}</small></td><td class="discovery-gap"><strong>${esc(score(value))}</strong><small>${esc(gapLabel(value))}</small></td><td>${compositeScore(item, "greed")}</td><td>${compositeScore(item, "support")}</td></tr>`; }).join("") : '<tr><td colspan="5" class="empty">조건에 맞는 종목이 없습니다.</td></tr>';
      tbody.querySelectorAll("[data-code]").forEach((row) => { row.addEventListener("click", () => activate(row.dataset.code)); row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(row.dataset.code); } }); });
      if (typeof context.onStateChange === "function") context.onStateChange({market: state.market});
      if (focusBucket) bucketRoot.querySelector(`[data-bucket="${focusBucket}"]`)?.focus();
    }
    container.querySelectorAll("[data-market]").forEach((button) => button.addEventListener("click", () => { state.market = button.dataset.market; render(); }));
    [["#sector-filter", "sector"], ["#coverage-filter", "coverage"], ["#sort-select", "sort"]].forEach(([selector, key]) => container.querySelector(selector).addEventListener("change", (event) => { state[key] = event.target.value; render(); }));
    container.querySelector("#discovery-search").addEventListener("input", (event) => { state.search = event.target.value; render(); });
    render();
    return Object.freeze({destroy() { container.replaceChildren(); }});
  }

  root.EDMDiscovery = Object.freeze({mount});
}(typeof window === "undefined" ? globalThis : window));
