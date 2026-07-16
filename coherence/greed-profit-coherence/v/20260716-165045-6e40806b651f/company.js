(function (root) {
  "use strict";

  const PILLAR = {attention: "시장 추격", expectations: "증권사 기대", delivery: "실적 이행"};
  const OPTIONAL_SOURCE = {analyst_research: "애널리스트 자료", innovation_capacity: "혁신 역량", awake_filings: "DART 공시", dart_forward_plans: "DART 사업계획", dart_report_chunks: "DART 사업계획", evidence: "선택 근거", dart: "DART 공시"};
  const OPTIONAL_ERROR = {source_not_found: "자료 없음", source_timeout: "응답 시간 초과", invalid_source_data: "형식 검증 실패", source_unavailable: "자료 연결 실패"};
  const PILLAR_DETAILS = {
    "retail-heat": {
      label: "개인 관심 열기",
      definition: "네이버 종목 토론 활동이 평소와 시장 대비 얼마나 뜨거운지 봅니다.",
      formula: "자체 이력 순위와 시장 상대 순위를 동일 가중으로 평균합니다.",
      companion: "서사 증폭과 함께 보세요.",
      interpretation: "높을수록 개인 투자자의 토론 활동이 평소와 다른 수준으로 강합니다.",
      nonclaim: "투자자 성향, 낙관 여부, 미래 수익률을 뜻하지 않습니다.",
      components: [["retail_post_count", "토론 글 수", "count"], ["retail_views_per_post", "글당 조회", "number"], ["retail_engagement_per_post", "글당 반응", "number"], ["retail_post_acceleration", "토론 증가율", "percent"], ["retail_heat_own_pct", "자체 이력 순위", "score"], ["retail_heat_market_pct", "시장 상대 순위", "score"]],
    },
    narrative: {
      label: "서사 증폭",
      definition: "특정 기업 이야기가 뉴스에서 얼마나 빠르고 반복적으로 확산되는지 봅니다.",
      formula: "기사 증가, 반복, 매체 집중, 표현 극단성의 상대 순위를 평균합니다. 최소 2개가 필요합니다.",
      companion: "정보 자극과 함께 보세요.",
      interpretation: "높을수록 같은 이야기가 강하게 확대되고 있을 가능성이 큽니다.",
      nonclaim: "높은 서사 증폭이 그 이야기가 거짓이라는 뜻은 아닙니다.",
      components: [["news_volume_acceleration", "기사 증가율", "percent"], ["narrative_volume_pct", "기사 증가 순위", "score"], ["news_duplication_ratio", "반복 기사 비중", "percent"], ["narrative_duplication_pct", "반복 기사 순위", "score"], ["news_source_concentration", "매체 집중도", "percent"], ["narrative_source_concentration_pct", "매체 집중 순위", "score"], ["news_sentiment_extremity", "표현 극단성", "percent"], ["narrative_sentiment_pct", "표현 극단성 순위", "score"]],
    },
    "market-chase": {
      label: "시장 추격",
      definition: "거래와 개인·신용, 가격 추격 행동이 함께 강해지는지 봅니다.",
      formula: "거래 열기, 개인·신용, 추격 행동을 동일 가중으로 평균하며 세 축이 모두 필요합니다.",
      companion: "개인 관심 열기와 함께 보세요.",
      interpretation: "높을수록 실제 시장 행동에서 추격 강도가 상대적으로 큽니다.",
      nonclaim: "높은 시장 추격만으로 버블을 입증할 수 없습니다.",
      components: [["attention_trading", "거래 열기", "score"], ["attention_retail_credit", "개인·신용", "score"], ["attention_behavior", "추격 행동", "score"]],
    },
    information: {
      label: "정보 자극",
      definition: "뉴스가 반복을 넘어 서로 다른 이야기와 구체적 사업 근거를 담는지 봅니다.",
      formula: "고유 기사 비중 순위와 구체적 사업 근거 비중 순위를 동일 가중으로 평균하며 두 축이 모두 필요합니다.",
      companion: "서사 증폭과 함께 보세요.",
      interpretation: "낮을수록 구체적이고 서로 다른 정보의 뒷받침이 비교집단보다 약합니다.",
      nonclaim: "낮다고 부정적인 뉴스라는 뜻은 아닙니다. 높다고 긍정적인 뉴스라는 뜻도 아닙니다.",
      components: [["news_article_count", "기사 수", "count"], ["news_unique_story_share", "고유 기사 비중", "percent"], ["information_unique_story_pct", "고유 기사 비중 순위", "score"], ["news_evidence_share", "구체적 사업 근거 비중", "percent"], ["information_evidence_pct", "사업 근거 비중 순위", "score"]],
    },
    expectations: {
      label: "증권사 기대",
      definition: "최근 영업이익 전망이 다른 기업보다 얼마나 강하게 상향 또는 하향됐는지 봅니다.",
      formula: "신선한 FY1 영업이익 전망 수정률의 시장 내 상대 순위입니다.",
      companion: "실적 이행과 함께 보세요.",
      interpretation: "높을수록 증권사 영업이익 전망의 상향 강도가 상대적으로 큽니다.",
      nonclaim: "높은 기대는 실제 실적이 아니며, 달성해야 할 기준이 높다는 뜻일 수도 있습니다.",
      components: [["op_revision", "영업이익 기대 변화", "percent"], ["op_growth", "영업이익 기대 성장", "percent"], ["revision_breadth", "상향 비율", "percent"], ["op_dispersion", "의견 차이", "percent"], ["brokers", "증권사 수", "count"], ["matched_brokers", "동일 증권사 비교", "count"], ["fiscal_horizon", "기준 기간", "text"]],
    },
    delivery: {
      label: "실적 이행",
      definition: "실제 영업 성과가 같은 업종의 다른 기업보다 얼마나 강했는지 봅니다.",
      formula: "영업이익 성장, 영업이익률 변화 등 사용 가능한 업종 상대 순위를 평균하며 최소 2개가 필요합니다.",
      companion: "증권사 기대와 함께 보세요.",
      interpretation: "높을수록 최근 실제 영업 성과가 업종 내에서 상대적으로 강합니다.",
      nonclaim: "높은 실적 이행이 저평가나 향후 지속성을 뜻하지 않습니다.",
      components: [["operating_profit_growth", "TTM 영업이익 성장", "percent"], ["operating_margin_change", "영업이익률 변화", "percent"], ["op_surprise", "영업이익 서프라이즈", "percent"], ["delivery_metric_count", "사용 지표 수", "count"]],
    },
  };

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

  function scoreBand(value) {
    if (!Number.isFinite(value)) return "자료 없음";
    if (value < 20) return "매우 낮음";
    if (value < 40) return "낮음";
    if (value < 60) return "보통";
    if (value < 80) return "높음";
    return "매우 높음";
  }

  function composite(values) {
    const observed = values.filter(Number.isFinite);
    return {value: observed.length >= 2 ? observed.reduce((sum, value) => sum + value, 0) / observed.length : null, coverage: `${observed.length}/3`};
  }

  function signalCard(label, value, date, coverage, reason, group, key) {
    const quality = reason || coverage || "범위 확인";
    return `<button type="button" class="signal-card" data-${group}-signal="${escapeHtml(key)}" data-pillar-key="${escapeHtml(key)}" aria-expanded="false"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatScore(value))}</strong><small>${escapeHtml(date ? `기준 ${date}` : "현재 자료 없음")} · ${escapeHtml(quality)}</small></button>`;
  }

  function pillarSelection(company, key) {
    const attention = pillar(company, "attention");
    const expectations = pillar(company, "expectations");
    const delivery = pillar(company, "delivery");
    const selections = {
      "retail-heat": {item: attention, score: metric(attention, "retail_heat_score")?.value, scoreMetric: metric(attention, "retail_heat_score")},
      narrative: {item: attention, score: metric(attention, "narrative_amplification_score")?.value, scoreMetric: metric(attention, "narrative_amplification_score")},
      "market-chase": {item: attention, score: attention && attention.score, scoreMetric: metric(attention, "attention_score")},
      information: {item: attention, score: metric(attention, "information_impulse_score")?.value, scoreMetric: metric(attention, "information_impulse_score")},
      expectations: {item: expectations, score: expectations && expectations.score, scoreMetric: metric(expectations, "expectations_component")},
      delivery: {item: delivery, score: delivery && delivery.score, scoreMetric: metric(delivery, "delivery_component")},
    };
    return selections[key];
  }

  function formatDetailValue(value, kind) {
    if (value == null || value === "") return "자료 없음";
    if (kind === "text") return String(value);
    if (!Number.isFinite(value)) return "자료 없음";
    if (kind === "percent") return `${new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value * 100)}%`;
    if (kind === "score") return `${new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value)}점`;
    if (kind === "count") return new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 0}).format(value);
    return new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 2}).format(value);
  }

  function pillarDetail(company, key) {
    const detail = PILLAR_DETAILS[key];
    const selected = pillarSelection(company, key);
    if (!detail || !selected) return "";
    const rows = detail.components.map(([metricKey, label, kind]) => {
      const item = metric(selected.item, metricKey);
      return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatDetailValue(item && item.value, kind))}</dd></div>`;
    }).join("");
    const date = selected.scoreMetric && selected.scoreMetric.public_date || selected.item && selected.item.source_as_of || "자료 없음";
    const coverage = selected.item && selected.item.coverage || "범위 없음";
    const reason = selected.scoreMetric && selected.scoreMetric.missing_reason || selected.item && selected.item.missing_reason;
    return `<article class="pillar-detail" data-pillar-detail="${escapeHtml(key)}"><header><div><p class="eyebrow">${escapeHtml(detail.label)}</p><h4>${escapeHtml(formatScore(selected.score))} · ${escapeHtml(scoreBand(selected.score))}</h4></div><span>기준 ${escapeHtml(date)}</span></header><p class="pillar-definition">${escapeHtml(detail.definition)}</p><p><strong>산출</strong>${escapeHtml(detail.formula)}</p><dl>${rows}</dl><div class="pillar-reading"><p><strong>해석</strong>${escapeHtml(detail.interpretation)}</p><p><strong>함께 보기</strong>${escapeHtml(detail.companion)}</p><p><strong>의미하지 않음</strong>${escapeHtml(detail.nonclaim)}</p></div><small>커버리지 ${escapeHtml(coverage)}${reason ? ` · ${escapeHtml(reason)}` : ""}</small></article>`;
  }

  function signalOverview(company) {
    const attention = pillar(company, "attention");
    const expectations = pillar(company, "expectations");
    const delivery = pillar(company, "delivery");
    const retail = metric(attention, "retail_heat_score");
    const narrative = metric(attention, "narrative_amplification_score");
    const information = metric(attention, "information_impulse_score");
    const marketChase = attention && attention.score;
    const greedValues = [retail && retail.value, narrative && narrative.value, marketChase].filter(Number.isFinite);
    const supportValues = [information && information.value, expectations && expectations.score, delivery && delivery.score].filter(Number.isFinite);
    const greed = composite(greedValues);
    const support = composite(supportValues);
    let statement = "현재 자료로 탐욕과 사업 근거의 관계를 충분히 판단하기 어렵습니다.";
    if (Number.isFinite(greed.value) && Number.isFinite(support.value)) {
      if (greed.value >= 70 && support.value >= 60) statement = "높은 탐욕과 확인 가능한 사업 근거가 함께 있습니다.";
      else if (greed.value >= 70 && support.value < 50) statement = "탐욕이 사업 근거보다 앞섭니다. 추가 확인이 필요합니다.";
      else statement = "탐욕과 사업 근거가 혼재합니다. 각 축을 따로 확인하세요.";
    }
    const greedCards = [
      signalCard("개인 관심 열기", retail && retail.value, retail && retail.public_date, retail && retail.value == null ? "현재 원천 범위 밖" : "토론 활동", retail && retail.missing_reason, "greed", "retail-heat"),
      signalCard("서사 증폭", narrative && narrative.value, narrative && narrative.public_date, "뉴스 반복·극단성", narrative && narrative.missing_reason, "greed", "narrative"),
      signalCard("시장 추격", marketChase, attention && attention.source_as_of, attention && attention.coverage, attention && attention.missing_reason, "greed", "market-chase"),
    ].join("");
    const supportCards = [
      signalCard("정보 자극", information && information.value, information && information.public_date, "구체성·다양성", information && information.missing_reason, "support", "information"),
      signalCard("증권사 기대", expectations && expectations.score, expectations && expectations.source_as_of, expectations && expectations.coverage, expectations && expectations.missing_reason, "support", "expectations"),
      signalCard("실적 이행", delivery && delivery.score, delivery && delivery.source_as_of, delivery && delivery.coverage, delivery && delivery.missing_reason, "support", "delivery"),
    ].join("");
    return `<section class="evidence-overview"><div class="overview-heading"><p class="eyebrow">EDM 핵심 질문</p><h2>시장 탐욕 신호 ↔ 사업 근거</h2><p>${escapeHtml(statement)}</p><small>동일 지표의 비교집단 내 상대 수준입니다. 높음은 좋음이나 매수를 뜻하지 않습니다.</small></div><div class="signal-group"><h3><span>탐욕</span><strong>${escapeHtml(formatScore(greed.value))} · ${escapeHtml(greed.coverage)}</strong></h3><div class="signal-grid">${greedCards}</div></div><div class="signal-group support"><h3><span>사업 근거</span><strong>${escapeHtml(formatScore(support.value))} · ${escapeHtml(support.coverage)}</strong></h3><div class="signal-grid">${supportCards}</div></div><div class="pillar-detail-host" aria-live="polite"></div></section>`;
  }

  function diagnosticBadges(compact) {
    const expectationLabel = compact.coverage_mode === "expectations-covered" ? "증권사 기대 있음" : "증권사 기대 없음";
    return [
      `탐욕 ${compact.greed_coverage || "0/3"}`,
      `사업 근거 ${compact.support_coverage || "0/3"}`,
      expectationLabel,
    ].map((label) => `<span>${escapeHtml(label)}</span>`).join("");
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

  function median(values) {
    const ordered = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
    if (!ordered.length) return null;
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function comparisonNumber(value, signed) {
    if (!Number.isFinite(value)) return "—";
    const formatted = new Intl.NumberFormat("ko-KR", {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value);
    return signed && value > 0 ? `+${formatted}` : formatted;
  }

  function peerBar(value, series, signed) {
    if (!Number.isFinite(value)) return '<span class="peer-bar-missing">자료 없음</span>';
    const magnitude = signed ? Math.min(Math.abs(value), 100) / 2 : Math.min(Math.max(value, 0), 100);
    const direction = signed ? (value < 0 ? " negative" : " positive") : "";
    return `<span class="peer-bar-line"><span>${escapeHtml(series)}</span><span class="peer-bar-track${signed ? " signed" : ""}"><i class="peer-bar-fill${direction}" data-peer-bar="${escapeHtml(series)}" style="--bar-size:${magnitude}%"></i></span><strong>${escapeHtml(comparisonNumber(value, signed))}</strong></span>`;
  }

  function sectorReading(rows) {
    if (rows.some((row) => !Number.isFinite(row.company) || !Number.isFinite(row.sector))) return "비교 가능한 업종 자료가 부족합니다.";
    const greedDifference = rows[0].company - rows[0].sector;
    const supportDifference = rows[1].company - rows[1].sector;
    const gapDifference = rows[2].company - rows[2].sector;
    let levels = "탐욕과 사업 근거가 업종 중간값과 비슷합니다.";
    if (greedDifference >= 10 && supportDifference >= 10) levels = "업종보다 탐욕과 사업 근거가 모두 높습니다.";
    else if (greedDifference <= -10 && supportDifference <= -10) levels = "업종보다 탐욕과 사업 근거가 모두 낮습니다.";
    else if (greedDifference >= 10) levels = "업종보다 탐욕이 두드러집니다.";
    else if (supportDifference >= 10) levels = "업종보다 사업 근거가 두드러집니다.";
    const gap = gapDifference >= 10 ? "탐욕−근거 괴리는 업종보다 큽니다." : gapDifference <= -10 ? "탐욕−근거 괴리는 업종보다 작습니다." : "탐욕−근거 괴리는 업종과 비슷합니다.";
    return `${levels} ${gap}`;
  }

  function sectorComparison(compact, universe, diagnosticDate) {
    const companies = Array.isArray(universe && universe.companies) ? universe.companies : [];
    const sameSector = (candidate) => compact.sector_code ? candidate.sector_code === compact.sector_code : candidate.sector_name === compact.sector_name;
    const peers = companies.filter((candidate) => candidate.code !== compact.code && sameSector(candidate) && Number.isFinite(candidate.greed_score) && Number.isFinite(candidate.support_score));
    const sufficient = peers.length >= 5;
    const companyGap = Number.isFinite(compact.greed_score) && Number.isFinite(compact.support_score) ? compact.greed_score - compact.support_score : null;
    const sectorGreed = sufficient ? median(peers.map((candidate) => candidate.greed_score)) : null;
    const sectorSupport = sufficient ? median(peers.map((candidate) => candidate.support_score)) : null;
    const sectorGap = sufficient ? median(peers.map((candidate) => candidate.greed_score - candidate.support_score)) : null;
    const rows = [
      {label: "탐욕", company: compact.greed_score, sector: sectorGreed, signed: false},
      {label: "사업 근거", company: compact.support_score, sector: sectorSupport, signed: false},
      {label: "탐욕−근거", company: companyGap, sector: sectorGap, signed: true},
    ];
    const tableRows = rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(comparisonNumber(row.company, row.signed))}</td><td>${escapeHtml(comparisonNumber(row.sector, row.signed))}</td><td>${escapeHtml(comparisonNumber(Number.isFinite(row.company) && Number.isFinite(row.sector) ? row.company - row.sector : null, true))}</td></tr>`).join("");
    const bars = sufficient ? rows.map((row) => `<div class="peer-chart-row"><strong>${escapeHtml(row.label)}</strong><div>${peerBar(row.company, "기업", row.signed)}${peerBar(row.sector, "업종", row.signed)}</div></div>`).join("") : `<p class="peer-comparison-empty">비교기업 부족 · ${peers.length}개 / 최소 5개</p>`;
    return `<div class="peer-comparison-meta">${escapeHtml(compact.sector_name || "업종 자료 없음")} · 비교기업 ${peers.length}개 · 자기회사 제외 · 기준 ${escapeHtml(diagnosticDate || "자료 없음")}</div><div class="sector-peer-layout"><div><table class="sector-peer-table"><thead><tr><th>지표</th><th>기업</th><th>업종 중간값</th><th>차이</th></tr></thead><tbody>${tableRows}</tbody></table><p class="sector-reading">${escapeHtml(sectorReading(rows))}</p></div><div class="sector-peer-chart" role="img" aria-label="기업과 업종 중간값 막대 비교">${bars}</div></div>`;
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
      <section class="edm-introduction" aria-labelledby="edm-introduction-title">
        <p class="eyebrow">Expectation–Delivery Monitor</p>
        <h2 id="edm-introduction-title">시장의 탐욕은 사업의 현실과 함께 움직이고 있는가?</h2>
        <p>EDM은 한 기업을 향한 시장의 탐욕과 이를 뒷받침하는 사업 근거를 비교합니다. 관심이 구체적인 정보와 기대, 실제 성과를 동반하는지 한눈에 확인할 수 있습니다.</p>
        <p class="intro-reason">시장은 실적이 발표되기 전에 움직입니다. 그래서 관심이 얼마나 큰지만큼, 그 관심을 설명할 사업 근거가 함께 형성되고 있는지가 중요합니다.</p>
        <div class="intro-strip"><span><strong>탐욕</strong>개인 관심 · 서사 확산 · 시장 추격</span><span><strong>사업 근거</strong>구체적 정보 · 증권사 기대 · 실제 실적</span><span><strong>EDM의 질문</strong>탐욕과 사업 근거가 함께 움직이는가?</span></div>
      </section>
      <header class="workspace-heading company-heading">
        <div><p class="eyebrow">기업 분석 · ${escapeHtml(compact.market)} · ${escapeHtml(compact.sector_name || "업종 자료 없음")} · ${escapeHtml(compact.code)}</p><h1 tabindex="-1">${escapeHtml(compact.name)}</h1><p class="heading-meta">${escapeHtml(formatCap(compact.market_cap_krw))} · 진단 기준 ${escapeHtml(payload && payload.diagnostic_as_of || context.diagnosticAsOf || "자료 없음")}</p></div>
        <div class="diagnostic-badges">${diagnosticBadges(compact)}</div>
      </header>
      ${sourceWarnings(company, diagnosticDate)}
      ${context.error ? `<div class="load-error" role="alert"><strong>상세 자료를 불러오지 못했습니다</strong><span>요약 정보만 표시합니다.</span><button type="button" data-company-retry>다시 시도</button></div>` : ""}
      ${signalOverview(company)}
      ${offlineHistoryUnavailable ? '<p class="offline-history-note">오프라인 내보내기에는 이력이 없습니다. 현재 진단값은 확인할 수 있습니다.</p>' : ""}
      <section class="primary-chart-card" data-company-chart="edm">
        <div class="chart-card-heading"><div><p class="eyebrow">공통 자료가 있는 기간만</p><h2>기대·실적 흐름</h2><p>시장 추격·증권사 기대·실적 이행과 발표 전후 영업이익을 분리해 봅니다.</p></div><div class="range-control" role="group" aria-label="조회 기간">${[["12m", "12개월"], ["24m", "24개월"], ["all", "전체"]].map(([value, label]) => `<button type="button" data-range="${value}" aria-pressed="${selectedRange === value}">${label}</button>`).join("")}</div></div>
        <div id="edm-history-chart" class="coordinated-chart" data-chart-region="edm-history"></div>
      </section>
      <section class="sector-chart-card compact-sector" data-company-chart="sector"><div class="chart-card-heading"><div><p class="eyebrow">현재 비교</p><h2>업종 비교</h2><p>같은 업종의 비교 가능한 기업 중간값과 비교합니다.</p></div></div><div class="sector-context">${sectorComparison(compact, context.universe, diagnosticDate)}</div></section>
      <section class="research-grid" aria-label="리서치 확인 항목">${evidenceCard("사업 근거 자료", evidence, "공개된 선택 근거 없음", "evidence")}${evidenceCard("위험", risks, "확인된 자료 위험 없음", "risk")}${evidenceCard("확인할 것", evidence.length ? evidence.slice(0, 2) : [], "추가 확인 항목 없음", "watch")}</section>
      <p class="nonclaim">진단 자료입니다. 투자 추천·목표주가·예상수익률이 아닙니다.</p>
    </section>`;

    container.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
      if (typeof context.onRangeChange === "function") context.onRangeChange(button.dataset.range);
    }));
    const detailHost = container.querySelector(".pillar-detail-host");
    container.querySelectorAll("[data-pillar-key]").forEach((button) => button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      container.querySelectorAll("[data-pillar-key]").forEach((candidate) => candidate.setAttribute("aria-expanded", "false"));
      detailHost.replaceChildren();
      if (isOpen) return;
      button.setAttribute("aria-expanded", "true");
      detailHost.innerHTML = pillarDetail(company, button.dataset.pillarKey);
    }));
    if (root.EDMCharts) {
      root.EDMCharts.renderCoordinatedHistory({
        container: container.querySelector("#edm-history-chart"),
        company: payload,
        range: selectedRange,
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
