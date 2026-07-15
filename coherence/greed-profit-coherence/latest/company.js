(function (root) {
  "use strict";

  const STATE = {
    aligned: "동행",
    "attention-led": "관심 선행",
    "expectations-led": "기대 선행",
    "delivery-led": "실적 선행",
    mixed: "혼재",
    insufficient: "자료 부족",
  };
  const CONFIDENCE = {high: "높음", medium: "보통", low: "낮음"};
  const COVERAGE = {"expectations-covered": "기대 포함", "baseline-only": "기대 자료 없음"};
  const PILLAR = {attention: "시장 관심", expectations: "증권사 기대", delivery: "실적 이행"};
  const OPTIONAL_SOURCE = {analyst_research: "애널리스트 자료", innovation_capacity: "혁신 역량", awake_filings: "DART 공시", dart_forward_plans: "DART 사업계획", dart_report_chunks: "DART 사업계획", evidence: "선택 근거", dart: "DART 공시"};
  const OPTIONAL_ERROR = {source_not_found: "자료 없음", source_timeout: "응답 시간 초과", invalid_source_data: "형식 검증 실패", source_unavailable: "자료 연결 실패"};
  const SECTOR_STATUS = {ok: "산출 가능", "insufficient-history": "이력 부족", "insufficient-peers": "비교기업 부족", "missing-data": "자료 결측"};
  const SECTOR_REASON = {"insufficient-paired-weeks": "대응 주 수 부족", "insufficient-paired-quarters": "대응 분기 수 부족", "insufficient-sector-peers": "비교기업 수 부족", "degenerate-regression": "회귀 산출 불가"};

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]);
  }

  function formatScore(value) {
    return Number.isFinite(value) ? `${new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value)}점` : "자료 없음";
  }

  function formatCap(value) {
    if (!Number.isFinite(value)) return "시총 자료 없음";
    const trillion = value >= 1e12;
    const shown = new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value / (trillion ? 1e12 : 1e8));
    return `시총 ${shown}${trillion ? "조" : "억"}원`;
  }

  function formatMetric(value, kind) {
    if (!Number.isFinite(value)) return "자료 없음";
    if (kind === "percent") return `${new Intl.NumberFormat("ko-KR", {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value * 100)}%`;
    return new Intl.NumberFormat("ko-KR", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);
  }

  function pillar(company, key) {
    return (company && company.pillars || []).find((item) => item.key === key) || null;
  }

  function metric(item, key) {
    return item && (item.metrics || []).find((candidate) => candidate.key === key);
  }

  function evidenceSourceLabel(value) {
    const source = String(value || "").trim();
    const exact = {
      "DART awake_filings": "DART 공시",
      "DART dart_report_chunks": "DART 사업계획",
      "DART forward plans": "DART 사업계획",
      "Innovation capacity composite": "혁신 역량",
      innovation_capacity: "혁신 역량",
      analyst_research: "증권사 리서치",
      awake_filings: "DART 공시",
      dart_forward_plans: "DART 사업계획",
      dart_report_chunks: "DART 사업계획",
      "optional evidence adapters": "선택 근거",
    };
    if (exact[source]) return exact[source];
    const firm = source.match(/^Analyst research sec_report_summary \(firm_id=([A-Za-z0-9._-]+)\)$/);
    if (firm) return `증권사 리서치 · 기관 ${firm[1]}`;
    if (/[가-힣]/.test(source)) return source;
    const safe = source.replace(/[^A-Za-z0-9._ -]/g, "").trim().slice(0, 40);
    return safe ? `기타 근거 · ${safe}` : "기타 근거";
  }

  function warningDetail(warning, company, diagnosticDate) {
    const sector = pillar(company, "sector");
    const membership = metric(sector, "membership_peer_code") || metric(sector, "membership_peer_name");
    const dates = {
      price: pillar(company, "price")?.source_as_of,
      membership: membership?.public_date,
      expectations: pillar(company, "expectations")?.source_as_of,
      delivery: pillar(company, "delivery")?.source_as_of,
    };
    const known = {
      "price-return-excludes-dividends": {source: "수정주가", date: dates.price, label: "배당 제외 수익률"},
      "company-name-missing:koscom-code-fallback": {source: "Koscom 종목 기준", date: dates.membership, label: "회사명 없음"},
      "company-name-mismatch:consensus-ignored": {source: "증권사 전망", date: dates.expectations, label: "회사명 불일치"},
      "koscom-membership-stale": {source: "Koscom 업종 분류", date: dates.membership, label: "기준일 오래됨"},
      "delivery-surprise-filing-date-unverified": {source: "분기 실적", date: dates.delivery, label: "공시일 미검증"},
      "optional-capital-change-source-unavailable": {source: "자본 변경 선택 근거", date: diagnosticDate, dateKind: "확인일", label: "검증 자료 없음"},
    };
    if (known[warning]) return known[warning];
    if (String(warning).startsWith("optional-source-failed:")) {
      const parts = String(warning).split(":");
      const sourceCode = parts[1] || "unknown";
      const maybeDate = parts.at(-1);
      const hasAttemptDate = /^\d{4}-\d{2}-\d{2}$/.test(maybeDate || "");
      if (hasAttemptDate) parts.pop();
      const errorCode = parts.slice(2).join(":") || "unknown";
      return {
        source: OPTIONAL_SOURCE[sourceCode] || `선택 근거 (${sourceCode})`,
        date: hasAttemptDate ? maybeDate : diagnosticDate,
        dateKind: hasAttemptDate ? "시도일" : "확인일",
        label: OPTIONAL_ERROR[errorCode] || `수집 실패 (${errorCode})`,
      };
    }
    return {source: "기타 경고", date: diagnosticDate, label: String(warning)};
  }

  function currentValues(company, compact) {
    return ["attention", "expectations", "delivery"].map((key) => {
      const item = pillar(company, key);
      const audit = (compact.pillar_audit || []).find((row) => row.key === key);
      const score = item ? item.score : compact[`${key}_score`];
      const date = item && item.source_as_of ? item.source_as_of : audit && audit.source_as_of || "자료 없음";
      const quality = audit ? `${audit.stale ? "오래됨" : audit.missing ? "결측" : "정상"} · ${audit.coverage || "범위 없음"}${audit.missing_reason ? ` · ${audit.missing_reason}` : ""}` : "상세 품질 없음";
      return `<article class="current-value" data-current-value="${key}"><span>${PILLAR[key]}</span><strong>${escapeHtml(formatScore(score))}</strong><small>기준 ${escapeHtml(date)} · ${escapeHtml(quality)}</small></article>`;
    }).join("");
  }

  function sourceWarnings(company, diagnosticDate) {
    const warnings = company && Array.isArray(company.warnings) ? company.warnings : [];
    if (!warnings.length) return "";
    return `<ul class="source-warnings">${warnings.map((warning) => { const detail = warningDetail(warning, company, diagnosticDate); const shownDate = detail.dateKind ? `${detail.dateKind} ${detail.date || "없음"}` : detail.date || "기준일 없음"; return `<li>${escapeHtml(detail.source)} · ${escapeHtml(shownDate)} · ${escapeHtml(detail.label)}</li>`; }).join("")}</ul>`;
  }

  function evidenceItems(company) {
    const item = pillar(company, "evidence");
    return item && Array.isArray(item.metrics)
      ? item.metrics.filter((candidate) => candidate.value != null)
      : [];
  }

  function evidenceCard(title, items, empty, kind) {
    const visible = items;
    const body = items.length
      ? `<ul>${visible.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(String(item.value))}</span><small>${escapeHtml(evidenceSourceLabel(item.source || "공개 자료"))} · ${escapeHtml(item.public_date || "기준일 없음")}</small></li>`).join("")}</ul>`
      : `<p>${escapeHtml(empty)}</p>`;
    return `<article class="research-card" data-evidence-kind="${kind}"><h2>${title}</h2>${body}</article>`;
  }

  function sectorFacts(company, history) {
    const sector = pillar(company, "sector");
    const item = (key) => metric(sector, key);
    const value = (key) => item(key)?.value;
    const prices = Array.isArray(history && history.sector_prices) ? history.sector_prices : [];
    const fundamentals = Array.isArray(history && history.sector_fundamentals) ? history.sector_fundamentals : [];
    const interval = (dates) => {
      const ordered = dates.filter(Boolean).sort();
      return ordered.length ? `${ordered[0]}~${ordered.at(-1)}` : "자료 없음";
    };
    const marketInterval = interval(prices.filter((row) => Number.isFinite(row.company_index) && Number.isFinite(row.sector_index)).map((row) => row.date));
    const fundamentalInterval = interval(fundamentals.filter((row) => Number.isFinite(row.company_operating_profit_growth) && Number.isFinite(row.sector_median_operating_profit_growth)).map((row) => row.period_date));
    const pairedWeeks = value("paired_weeks");
    const pairedQuarters = value("paired_quarters");
    const latestPrice = prices.at(-1);
    const latestFundamental = fundamentals.at(-1);
    const audit = (row, count, unit) => {
      if (!row) return "이력 감사자료 없음";
      if (row.metric_status === "audit-unavailable") return "이전 스냅샷: 감사정보 없음";
      return `${row.metric_status || "상태 없음"} · ${Number.isFinite(count) ? `${count}${unit}` : "표본 없음"} · ${row.interval_start || "시작 없음"}~${row.interval_end || "종료 없음"} · 분류 ${row.membership_source_as_of || "효력일 없음"}/${row.membership_available_as_of || "수집일 없음"}${row.metric_missing_reason ? ` · ${row.metric_missing_reason}` : ""}`;
    };
    const statusCard = (label, statusKey, count, unit, minimum) => {
      const status = item(statusKey);
      const code = String(status && status.value || "missing-data");
      const reason = status && status.missing_reason;
      const countText = Number.isFinite(count) ? `${count}${unit} / 최소 ${minimum}${unit}` : `산출 표본 미확인 / 최소 ${minimum}${unit}`;
      const reasonText = reason ? `<small>이유 ${escapeHtml(SECTOR_REASON[reason] || "기타 산출 제한")} (${escapeHtml(reason)})</small>` : "";
      return `<article><strong>${escapeHtml(label)} · ${escapeHtml(SECTOR_STATUS[code] || `기타 상태 (${code})`)}</strong><span>${escapeHtml(countText)}</span>${reasonText}</article>`;
    };
    return `<dl class="sector-facts">
      <div><dt>실적 상관</dt><dd>${escapeHtml(formatMetric(value("fundamental_correlation")))}</dd></div>
      <div><dt>업종 베타</dt><dd>${escapeHtml(formatMetric(value("sector_beta")))}</dd></div>
      <div><dt>추가 설명력</dt><dd>${escapeHtml(formatMetric(value("sector_incremental_r2"), "percent"))}</dd></div>
      <div><dt>대응 표본</dt><dd>${Number.isFinite(pairedWeeks) && Number.isFinite(pairedQuarters) ? `${escapeHtml(pairedWeeks)}주 · ${escapeHtml(pairedQuarters)}분기` : "자료 없음"}</dd></div>
      <div><dt>시장 구간</dt><dd>${escapeHtml(marketInterval)}</dd></div>
      <div><dt>실적 구간</dt><dd>${escapeHtml(fundamentalInterval)}</dd></div>
    </dl><div class="sector-statuses" aria-label="업종 비교 산출 상태">${statusCard("시장 모델", "market_status", pairedWeeks, "주", 78)}${statusCard("실적 모델", "fundamental_status", pairedQuarters, "분기", 12)}</div><details class="sector-audit"><summary>시점 감사</summary><p>시장 · ${escapeHtml(audit(latestPrice, latestPrice && latestPrice.paired_weeks, "주"))}</p><p>실적 · ${escapeHtml(audit(latestFundamental, latestFundamental && latestFundamental.paired_quarters, "분기"))}</p></details>`;
  }

  function mount(container, context) {
    if (!container || !context || !context.universeEntry) throw new Error("invalid-company-context");
    const compact = context.universeEntry;
    const payload = context.company;
    const company = payload && payload.company ? payload.company : null;
    const history = payload && payload.history ? payload.history : null;
    const offlineHistoryUnavailable = payload && payload.history_unavailable === "offline-export";
    const selectedRange = context.state && context.state.range || "24m";
    const evidence = evidenceItems(company);
    const diagnosticDate = payload && payload.diagnostic_as_of || context.diagnosticAsOf;
    const risks = (company && company.warnings || []).map((warning) => { const detail = warningDetail(warning, company, diagnosticDate); return {label: detail.source, value: detail.label, source: detail.source, public_date: detail.dateKind ? `${detail.dateKind} ${detail.date || diagnosticDate}` : detail.date || diagnosticDate}; });

    container.innerHTML = `<section class="company-workspace" data-workspace="company">
      <header class="workspace-heading company-heading">
        <div><p class="eyebrow">기업 분석 · ${escapeHtml(compact.market)} · ${escapeHtml(compact.sector_name || "업종 자료 없음")} · ${escapeHtml(compact.code)}</p><h1 tabindex="-1">${escapeHtml(compact.name)}</h1><p class="heading-meta">${escapeHtml(formatCap(compact.market_cap_krw))} · 진단 기준 ${escapeHtml(payload && payload.diagnostic_as_of || context.diagnosticAsOf || "자료 없음")}</p></div>
        <div class="diagnostic-badges"><span class="state-badge">${escapeHtml(STATE[compact.state] || "자료 부족")}</span><span>신뢰도 ${escapeHtml(CONFIDENCE[compact.confidence] || "자료 없음")}</span><span>${escapeHtml(COVERAGE[compact.coverage_mode] || "자료 없음")}</span></div>
      </header>
      ${sourceWarnings(company, diagnosticDate)}
      ${context.error ? `<div class="load-error" role="alert"><strong>상세 자료를 불러오지 못했습니다</strong><span>요약 정보만 표시합니다.</span><button type="button" data-company-retry>다시 시도</button></div>` : ""}
      <div class="current-values" aria-label="현재 진단값">${currentValues(company, compact)}</div>
      ${offlineHistoryUnavailable ? '<p class="offline-history-note">오프라인 내보내기에는 이력이 없습니다. 현재 진단값은 확인할 수 있습니다.</p>' : ""}
      <section class="primary-chart-card" data-company-chart="edm">
        <div class="chart-card-heading"><div><p class="eyebrow">기대와 이행의 시간 흐름</p><h2>EDM 추이</h2><p>상단은 0–100 진단축, 하단은 발표 전 기대와 실제 영업이익입니다.</p></div><div class="range-control" role="group" aria-label="조회 기간">${[["12m", "12개월"], ["24m", "24개월"], ["all", "전체"]].map(([value, label]) => `<button type="button" data-range="${value}" aria-pressed="${selectedRange === value}">${label}</button>`).join("")}</div></div>
        <div id="edm-history-chart" class="coordinated-chart" data-chart-region="edm-history"></div>
      </section>
      <section class="sector-chart-card" data-company-chart="sector"><div class="chart-card-heading"><div><p class="eyebrow">Leave-one-out 업종 비교</p><h2>기업 vs 업종</h2><p>회사 고유 흐름과 업종 공통 흐름을 분리해 봅니다.</p></div></div><div id="sector-history-chart" class="sector-comparison-chart" data-chart-region="sector-history"></div><div class="sector-context">${sectorFacts(company, history)}</div></section>
      <section class="research-grid" aria-label="리서치 확인 항목">${evidenceCard("근거", evidence, "공개된 선택 근거 없음", "evidence")}${evidenceCard("위험", risks, "확인된 자료 위험 없음", "risk")}${evidenceCard("확인할 것", evidence.length ? evidence.slice(0, 2) : [], "추가 확인 항목 없음", "watch")}</section>
      <p class="nonclaim">진단 자료입니다. 투자 추천·목표주가·예상수익률이 아닙니다.</p>
    </section>`;

    container.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
      if (typeof context.onRangeChange === "function") context.onRangeChange(button.dataset.range);
    }));
    if (root.EDMCharts) {
      root.EDMCharts.renderCoordinatedHistory({
        container: container.querySelector("#edm-history-chart"),
        company: payload,
        range: selectedRange,
      });
      root.EDMCharts.renderSectorComparison({
        container: container.querySelector("#sector-history-chart"),
        payload,
      });
    }
    const retry = container.querySelector("[data-company-retry]");
    if (retry) {
      retry.addEventListener("click", () => context.onRetry && context.onRetry());
      retry.focus();
    }
    return Object.freeze({destroy() { container.replaceChildren(); }});
  }

  root.EDMCompany = Object.freeze({mount});
}(typeof window === "undefined" ? globalThis : window));
