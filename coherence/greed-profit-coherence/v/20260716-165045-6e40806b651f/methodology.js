(function (root) {
  "use strict";

  const FORMULA_LABEL = {attention: "시장 추격", expectations: "증권사 기대", delivery: "실적 이행", direction: "진단 상태", "sector-market": "주가 · 업종 맥락", "sector-fundamental": "실적 · 업종 맥락"};
  const SOURCE_LABEL = {attention: "시장 추격", price: "수정주가", consensus: "증권사 전망", delivery_actuals: "분기 실적", koscom_membership: "업종 분류", sector_market_returns: "업종 수익률", "evidence:DART awake_filings": "DART 공시"};
  const STEP_DETAIL = {
    "토론·뉴스·시장자료": "토론 집계, 뉴스 메타, 거래·신용·수급을 읽습니다.",
    "시점 정렬": "그날 공개된 값만 남깁니다.",
    "탐욕 신호": "개인 관심, 서사 증폭, 시장 추격을 따로 계산합니다.",
    "사업 근거": "구체적 정보, 증권사 기대, 실제 실적을 구분해 봅니다.",
    "기대·실적 비교": "증권사 기대와 실제 영업이익을 맞춥니다.",
    "EDM 진단": "탐욕 신호가 근거와 함께 움직이는지 보여줍니다.",
  };
  const STATUS = {ok: "정상", stale: "오래됨", missing: "자료 없음", failed: "수집 실패"};
  const STATE = {aligned: "동행", "attention-led": "관심 선행", "expectations-led": "기대 선행", "delivery-led": "실적 선행", mixed: "혼재", insufficient: "자료 부족"};
  const CONFIDENCE = {high: "높음", medium: "보통", low: "낮음"};
  const COVERAGE = {"expectations-covered": "증권사 기대 있음", "baseline-only": "증권사 기대 없음"};
  const DIRECTION = {"-1": "하락", "0": "중립", "1": "상승"};
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]); }
  function score(value) { return Number.isFinite(value) ? `${new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value)}점` : "자료 없음"; }
  function coverage(value) {
    const text = String(value || "");
    const subpillars = text.match(/^(\d+)\/3-market-chase-subpillars$/);
    const brokers = text.match(/^(\d+)-brokers$/);
    if (subpillars) return `${subpillars[1]}/3 항목`;
    if (brokers) return `증권사 ${brokers[1]}곳`;
    return {ok: "충분", "baseline-only": "기대 자료 없음", complete: "충분", partial: "일부"}[text] || "자료 확인";
  }

  function sourceLabel(value) {
    const source = String(value || "");
    if (SOURCE_LABEL[source]) return SOURCE_LABEL[source];
    const evidence = source.startsWith("evidence:") ? source.slice(9) : "";
    const exact = {awake_filings: "DART 공시", "DART awake_filings": "DART 공시", dart_forward_plans: "DART 사업계획", dart_report_chunks: "DART 사업계획", "DART dart_report_chunks": "DART 사업계획", "DART forward plans": "DART 사업계획", analyst_research: "증권사 리서치", innovation_capacity: "혁신 역량", "Innovation capacity composite": "혁신 역량"};
    if (exact[evidence]) return exact[evidence];
    const firm = evidence.match(/^Analyst research sec_report_summary \(firm_id=([A-Za-z0-9._-]+)\)$/);
    if (firm) return `증권사 리서치 · 기관 ${firm[1]}`;
    if (evidence) {
      const safe = evidence.replace(/[^A-Za-z0-9._ -]/g, "").trim().slice(0, 40);
      return safe ? `기타 근거 · ${safe}` : "기타 근거";
    }
    return /[가-힣]/.test(source) ? source : "기타 자료";
  }

  function derivedState(example) {
    const byKey = Object.fromEntries((example.component_rows || []).map((row) => [row.key, row.direction]));
    const keys = example.coverage_mode === "baseline-only" ? ["attention", "delivery"] : ["attention", "expectations", "delivery"];
    const directions = keys.map((key) => byKey[key]);
    if (directions.some((value) => ![-1, 0, 1].includes(value))) return "insufficient";
    const nonNeutral = directions.filter((value) => value !== 0);
    if (nonNeutral.includes(-1) && nonNeutral.includes(1)) return "mixed";
    if (nonNeutral.length === 1) return {attention: "attention-led", expectations: "expectations-led", delivery: "delivery-led"}[keys[directions.findIndex((value) => value !== 0)]];
    return "aligned";
  }

  function walkthrough(example) {
    const rows = example.component_rows || [];
    const axisLabel = {attention: "추격", expectations: "기대", delivery: "이행"};
    const values = rows.map((row) => `${axisLabel[row.key] || row.label} ${score(row.score)}`).join(" · ");
    const directions = rows.map((row) => `${axisLabel[row.key] || row.label} ${DIRECTION[String(row.direction)] || "방향 없음"}`).join(" · ");
    const quality = rows.map((row) => `${row.label} ${CONFIDENCE[row.confidence] || "자료 없음"}`).join(" · ");
    const computed = derivedState(example);
    const reconciliation = computed === example.state ? "게시 진단과 일치" : "게시 진단 확인 필요";
    return `<div id="methodology-walkthrough" class="walkthrough"><p><strong>게시 구성값</strong>${esc(values || "구성값 없음")}</p><p><strong>방향 판정</strong>${esc(directions || "판정 자료 없음")}</p><p><strong>진단 재현</strong>${esc(STATE[computed] || "자료 부족")} · ${reconciliation}</p><p><strong>게시 품질</strong>${esc(COVERAGE[example.coverage_mode] || "자료 없음")} · ${esc(quality || "축별 자료 없음")}</p></div>`;
  }

  function list(items) {
    return `<ul>${(items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
  }

  function weights(values) {
    const rows = Object.entries(values || {});
    if (!rows.length) return "별도 가중치 없음";
    return rows.map(([key, value]) => `${key} ${Number(value * 100).toFixed(value * 100 % 1 ? 1 : 0)}%`).join(" · ");
  }

  function formulaDetails(formulas) {
    return (formulas || []).map((row, index) => `<details ${index === 0 ? "open" : ""} data-formula="${esc(row.key)}"><summary>${esc(FORMULA_LABEL[row.key] || row.label)}</summary><dl><div><dt>원천·입력</dt><dd>${esc((row.input_fields || []).join(" · "))}</dd></div><div><dt>계산</dt><dd>${esc(row.formula)}</dd></div><div><dt>가중치</dt><dd>${esc(row.weight_rule || weights(row.weights))}${Object.keys(row.weights || {}).length ? ` · ${esc(weights(row.weights))}` : ""}</dd></div><div><dt>비교·표본</dt><dd>${esc(row.comparison_universe)} · ${esc(row.minimum_sample)}</dd></div><div><dt>공개일·시점</dt><dd>${esc(row.pit_rule)}</dd></div><div><dt>결측 처리</dt><dd>${esc(row.missing_rule)}</dd></div></dl></details>`).join("");
  }

  function mount(container, context) {
    if (!container || !context) throw new Error("invalid-methodology-context");
    if (!context.methodology) {
      container.innerHTML = `<section class="methodology-workspace" data-workspace="methodology"><header class="workspace-heading"><div><p class="eyebrow">산출 기준</p><h1 tabindex="-1">데이터 방법론</h1></div></header><div class="load-error" role="alert"><strong>방법론 자료를 불러오지 못했습니다</strong><button type="button" data-method-retry>다시 시도</button></div></section>`;
      const retry = container.querySelector("[data-method-retry]");
      retry.addEventListener("click", () => context.onRetry && context.onRetry());
      retry.focus();
      return Object.freeze({destroy() { container.replaceChildren(); }});
    }
    const method = context.methodology;
    const example = method.example || {component_rows: []};
    container.innerHTML = `<section class="methodology-workspace" data-workspace="methodology"><header class="workspace-heading"><div><p class="eyebrow">${esc(method.methodology_version)} · ${esc(method.contract_version)}</p><h1 tabindex="-1">데이터 방법론</h1><p>탐욕 신호에서 사업 근거까지.</p></div></header><section class="method-section method-flow"><h2>EDM 생성 과정</h2><ol class="pipeline">${(method.pipeline_steps || []).map((title, index) => `<li class="pipeline-step"><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(title)}</strong><small>${esc(STEP_DETAIL[title] || "")}</small></li>`).join("")}</ol></section><details class="method-section method-disclosure"><summary>시점·표본 규칙</summary><div class="rules-section">${list(method.pit_publication_rules)}<p><strong>최소 표본</strong> ${esc(method.minimum_samples?.weekly_sector)}주 이상 · ${esc(method.minimum_samples?.quarterly_sector)}분기 이상</p></div></details><section class="method-section"><h2>지표별 산출 기준</h2><div class="reference-list">${formulaDetails(method.formulas)}</div></section><details class="method-section method-disclosure"><summary>비교집단</summary>${list(method.comparison_universe)}</details><section class="method-section"><h2>원천·어댑터</h2><div class="reference-list">${(method.source_adapters || []).map((source) => `<details><summary>${esc(source.public_name)}</summary><p><strong>실제 원천 테이블</strong> ${esc((source.source_tables || []).join(" · ") || "해당 없음")}</p><p><strong>어댑터 별칭</strong> ${esc((source.adapter_aliases || []).join(" · ") || "해당 없음")}</p><small>${esc(source.availability_field)}</small></details>`).join("")}</div></section><section class="method-section example-section"><div><p class="eyebrow">게시값 자동 예시</p><h2>${esc(example.name)} · ${esc(example.code)}</h2><p>게시값으로 진단을 재현합니다.</p>${walkthrough(example)}</div><div class="example-grid">${(example.component_rows || []).map((row) => `<article><span>${esc(row.label)}</span><strong>${esc(score(row.score))}</strong><small>${esc(coverage(row.coverage))} · ${esc(row.source_as_of || "기준일 없음")}</small></article>`).join("")}</div></section><details class="method-section method-disclosure"><summary>출처 현황</summary><div class="source-table">${(method.source_freshness || []).map((source) => `<div><strong>${esc(sourceLabel(source.source))}</strong><span>${esc(source.source_as_of || "기준일 없음")}</span><span class="status ${esc(source.status)}">${esc(STATUS[source.status] || source.status)}</span><small>${esc(source.rows)}행</small></div>`).join("")}</div></details><section class="method-columns"><article class="method-section"><h2>결측·신뢰도</h2>${list(method.missing_stale_rules)}${list(method.coverage_confidence_rules)}</article><article class="method-section"><h2>데이터 사전</h2><dl class="dictionary"><div><dt>개인 관심 열기</dt><dd>토론 활동의 자기 이력·시장 대비 위치</dd></div><div><dt>서사 증폭</dt><dd>뉴스 반복·집중·감정 극단성</dd></div><div><dt>시장 추격</dt><dd>거래·개인/신용·추격 행동</dd></div><div><dt>정보 자극</dt><dd>새롭고 구체적인 뉴스 근거</dd></div><div><dt>증권사 기대</dt><dd>영업이익 전망 변화</dd></div><div><dt>실적 이행</dt><dd>공개 실적의 전달 수준</dd></div><div><dt>업종 맥락</dt><dd>기업과 업종의 동행 정도</dd></div><div><dt>신뢰도</dt><dd>신선도·표본·완전성 표시</dd></div></dl></article></section><details class="method-section method-disclosure"><summary>알려진 한계</summary>${list(method.known_limitations)}</details><section class="method-section nonclaims"><h2>EDM이 말하지 않는 것</h2>${list(method.nonclaims)}</section></section>`;
    return Object.freeze({destroy() { container.replaceChildren(); }});
  }

  root.EDMMethodology = Object.freeze({mount});
}(typeof window === "undefined" ? globalThis : window));
