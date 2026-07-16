(function (root) {
  "use strict";

  const NS = "http:" + "//www.w3.org/2000/svg";
  const SERIES = {
    attention: {label: "시장 추격", className: "attention", dash: ""},
    expectations: {label: "증권사 기대", className: "expectations", dash: "8 4"},
    delivery: {label: "실적 이행", className: "delivery", dash: "2 4"},
  };
  const finite = (value) => Number.isFinite(value);
  const el = (name, className, text) => {
    const item = document.createElement(name);
    if (className) item.className = className;
    if (text != null) item.textContent = text;
    return item;
  };
  const svgEl = (name, attributes = {}) => {
    const item = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => item.setAttribute(key, value));
    return item;
  };
  const isoTime = (value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  };
  const fmtNumber = (value, digits = 1) => finite(value)
    ? new Intl.NumberFormat("ko-KR", {maximumFractionDigits: digits}).format(value)
    : "자료 없음";
  const fmtWon = (value) => finite(value)
    ? `${new Intl.NumberFormat("ko-KR", {maximumFractionDigits: 1}).format(value / 1e12)}조원`
    : "자료 없음";
  const fmtPercent = (value) => finite(value) ? `${fmtNumber(value * 100, 1)}%` : "자료 없음";
  const confidence = {high: "높음", medium: "보통", low: "낮음"};

  function clear(container) {
    container.replaceChildren();
  }

  function subtractCalendarMonths(timestamp, months) {
    const source = new Date(timestamp);
    const day = source.getUTCDate();
    source.setUTCDate(1);
    source.setUTCMonth(source.getUTCMonth() - months);
    const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
    source.setUTCDate(Math.min(day, lastDay));
    return source.getTime();
  }

  function selectedHistory(history, range) {
    const allEdm = Array.isArray(history && history.edm) ? history.edm : [];
    const allEarnings = Array.isArray(history && history.earnings) ? history.earnings : [];
    const latest = Math.max(
      ...allEdm.map((row) => isoTime(row.diagnostic_date)).filter((value) => value != null),
      ...allEarnings.flatMap((row) => [isoTime(row.period_date), isoTime(row.actual_public_date)]).filter((value) => value != null),
    );
    const months = range === "12m" ? 12 : range === "24m" ? 24 : null;
    const cutoff = months == null || !Number.isFinite(latest) ? null : subtractCalendarMonths(latest, months);
    const within = (value) => isoTime(value) != null && (cutoff == null || isoTime(value) > cutoff);
    const selectedEdm = allEdm.filter((row) => within(row.diagnostic_date));
    const selectedEarnings = allEarnings.filter((row) => within(row.period_date));
    return {
      rawEdm: selectedEdm,
      rawEarnings: selectedEarnings,
      edm: selectedEdm.filter((row) => [row.attention_score, row.expectations_score, row.delivery_score].every(finite)),
      earnings: selectedEarnings.filter((row) => finite(row.expected_operating_profit_krw) && finite(row.actual_operating_profit_krw)),
    };
  }

  function extent(rows, key, fallback) {
    const values = rows.map((row) => row[key]).filter(finite);
    if (!values.length) return fallback;
    let low = Math.min(...values), high = Math.max(...values);
    if (low === high) {
      const pad = Math.abs(low) * 0.1 || 1;
      low -= pad; high += pad;
    }
    const pad = (high - low) * 0.1;
    return [low - pad, high + pad];
  }

  function timeScale(values, left, right) {
    const times = values.map(isoTime).filter((value) => value != null);
    const low = times.length ? Math.min(...times) : 0;
    const high = times.length ? Math.max(...times) : low + 1;
    return (value) => left + ((isoTime(value) - low) / Math.max(1, high - low)) * (right - left);
  }

  function numberScale(domain, top, bottom) {
    return (value) => bottom - ((value - domain[0]) / (domain[1] - domain[0])) * (bottom - top);
  }

  function baseSvg(panel, label, range, height) {
    return svgEl("svg", {
      viewBox: `0 0 900 ${height}`,
      role: "img",
      "aria-label": label,
      "data-panel": panel,
      "data-range": range,
    });
  }

  function text(svg, value, attributes) {
    const item = svgEl("text", attributes);
    item.textContent = value;
    svg.append(item);
  }

  function drawGrid(svg, ticks, y, formatter, right = 872) {
    ticks.forEach((tick) => {
      const position = y(tick);
      svg.append(svgEl("line", {x1: 54, x2: right, y1: position, y2: position, class: "chart-grid"}));
      text(svg, formatter(tick), {x: 46, y: position + 4, class: "chart-tick", "text-anchor": "end"});
    });
  }

  function segments(rows, key) {
    const output = [];
    let active = [];
    rows.forEach((row) => {
      if (finite(row[key])) active.push(row);
      else if (active.length) { output.push(active); active = []; }
    });
    if (active.length) output.push(active);
    return output;
  }

  function drawLine(svg, rows, key, seriesName, x, y, extraClass = "") {
    segments(rows, key).forEach((part) => {
      const definition = SERIES[seriesName] || {};
      const path = svgEl("path", {
        d: part.map((row, index) => `${index ? "L" : "M"}${x(row.date || row.diagnostic_date || row.period_date).toFixed(1)},${y(row[key]).toFixed(1)}`).join(" "),
        class: `chart-line ${definition.className || seriesName} ${extraClass}`.trim(),
        "data-series": seriesName,
        fill: "none",
      });
      if (definition.dash) path.setAttribute("stroke-dasharray", definition.dash);
      svg.append(path);
    });
    rows.filter((row) => finite(row[key])).forEach((row) => {
      svg.append(svgEl("circle", {
        cx: x(row.date || row.diagnostic_date || row.period_date), cy: y(row[key]), r: 3,
        class: `chart-marker ${seriesName}`, "data-series-marker": seriesName,
      }));
    });
  }

  function deliveryEvents(rows) {
    return rows
      .filter((row) => isoTime(row.diagnostic_date) != null)
      .map((row) => ({...row, date: row.diagnostic_date}))
      .sort((left, right) => isoTime(left.date) - isoTime(right.date));
  }

  function drawDeliveryStep(svg, rows, x, y) {
    const events = deliveryEvents(rows);
    segments(events, "delivery_score").forEach((part) => {
      let d = `M${x(part[0].date).toFixed(1)},${y(part[0].delivery_score).toFixed(1)}`;
      part.slice(1).forEach((row) => {
        d += `H${x(row.date).toFixed(1)}V${y(row.delivery_score).toFixed(1)}`;
      });
      const path = svgEl("path", {
        d,
        class: "chart-line delivery delivery-step",
        "data-series": "delivery",
        "data-path-type": "step-after",
        "data-anchor": "diagnostic-date",
        "data-gap-policy": "break-on-null",
        fill: "none",
      });
      path.setAttribute("stroke-dasharray", SERIES.delivery.dash);
      svg.append(path);
    });
    events.filter((row) => finite(row.delivery_score)).forEach((row) => {
      const attributes = {
        cx: x(row.date), cy: y(row.delivery_score), r: 3,
        class: "chart-marker delivery", "data-series-marker": "delivery",
        "data-diagnostic-date": row.diagnostic_date,
        "data-score": row.delivery_score,
      };
      if (row.delivery_public_date) attributes["data-public-date"] = row.delivery_public_date;
      svg.append(svgEl("circle", attributes));
    });
  }

  function scorePanel(rows, range, allDates) {
    const svg = baseSvg("scores", "EDM, 시장 관심, 증권사 기대, 실적 이행 0에서 100점", range, 292);
    svg.dataset.domain = "0,100";
    const x = timeScale(allDates, 54, 872);
    const y = numberScale([0, 100], 24, 252);
    drawGrid(svg, [0, 25, 50, 75, 100], y, String);
    ["attention", "expectations"].forEach((key) => drawLine(svg, rows, `${key}_score`, key, x, y));
    drawDeliveryStep(svg, rows, x, y);
    text(svg, "진단 점수", {x: 54, y: 16, class: "chart-panel-title"});
    const cursor = svgEl("line", {y1: 24, y2: 252, class: "shared-cursor", "data-cursor-line": "scores", hidden: ""});
    svg.append(cursor);
    return {svg, x};
  }

  function earningsPanel(rows, range, allDates) {
    const svg = baseSvg("earnings", "발표 전 기대 영업이익과 실제 영업이익 원화", range, 220);
    const x = timeScale(allDates, 54, 872);
    const values = rows.flatMap((row) => [row.expected_operating_profit_krw, row.actual_operating_profit_krw]).filter(finite);
    let domain;
    if (!values.length || values.every((value) => value === 0)) domain = [-1, 1];
    else {
      let low = Math.min(0, ...values), high = Math.max(0, ...values);
      const span = high - low;
      if (low < 0) low -= span * 0.08;
      if (high > 0) high += span * 0.08;
      domain = [low, high];
    }
    const y = numberScale(domain, 24, 180);
    const zeroY = y(0);
    svg.dataset.zeroY = String(zeroY);
    drawGrid(svg, [...new Set([domain[0], 0, domain[1]])], y, fmtWon);
    rows.forEach((row) => {
      const center = x(row.period_date);
      if (finite(row.expected_operating_profit_krw)) {
        const valueY = y(row.expected_operating_profit_krw);
        svg.append(svgEl("rect", {
          x: center - 8, y: Math.min(valueY, zeroY), width: 7,
          height: Math.abs(zeroY - valueY),
          class: "earnings-bar expected", "data-series": "expected-ebit",
          "data-value": row.expected_operating_profit_krw,
          "data-baseline-y": zeroY,
        }));
      }
      if (finite(row.actual_operating_profit_krw)) {
        const valueY = y(row.actual_operating_profit_krw);
        svg.append(svgEl("rect", {
          x: center + 1, y: Math.min(valueY, zeroY), width: 7,
          height: Math.abs(zeroY - valueY),
          class: "earnings-bar actual", "data-series": "actual-ebit",
          "data-value": row.actual_operating_profit_krw,
          "data-baseline-y": zeroY,
        }));
        svg.append(svgEl("circle", {
          cx: x(row.actual_public_date || row.period_date), cy: valueY, r: 4,
          class: "actual-publication", "data-marker": "actual-publication",
        }));
      }
    });
    text(svg, "영업이익 (원)", {x: 54, y: 16, class: "chart-panel-title"});
    const cursor = svgEl("line", {y1: 24, y2: 180, class: "shared-cursor", "data-cursor-line": "earnings", hidden: ""});
    svg.append(cursor);
    return {svg, x};
  }

  function tooltip(container) {
    const item = el("div", "chart-tooltip");
    item.id = `chart-tooltip-${Math.random().toString(36).slice(2)}`;
    item.setAttribute("role", "tooltip");
    item.hidden = true;
    container.append(item);
    return item;
  }

  function revealTooltip(item, value) {
    item.textContent = value;
    item.hidden = false;
  }

  function hideTooltip(item) {
    item.hidden = true;
  }

  function setCursor(container, date, visible) {
    const allDates = Array.from(container.querySelectorAll("[data-chart-date]")).map((node) => node.dataset.chartDate);
    const low = Number(container.dataset.timeLow) || Math.min(...allDates.map(isoTime));
    const high = Number(container.dataset.timeHigh) || Math.max(...allDates.map(isoTime));
    const position = 54 + ((isoTime(date) - low) / Math.max(1, high - low)) * (872 - 54);
    container.querySelectorAll("[data-cursor-line]").forEach((line) => {
      if (visible) {
        line.removeAttribute("hidden"); line.setAttribute("x1", position); line.setAttribute("x2", position);
      } else line.setAttribute("hidden", "");
    });
  }

  function edmTooltip(row) {
    return [
      `진단일 ${row.diagnostic_date}`,
      ...["attention", "expectations", "delivery"].map((key) => `${SERIES[key].label} ${fmtNumber(row[`${key}_score`])} · 공개일 ${row[`${key}_public_date`] || "없음"} · 커버리지 ${row[`${key}_coverage`] || "없음"} · 신뢰도 ${confidence[row[`${key}_confidence`]] || "없음"}${row[`${key}_missing_reason`] ? ` · ${row[`${key}_missing_reason`]}` : ""}`),
    ].join("\n");
  }

  function earningsTooltip(row) {
    return `회계기간 ${row.period_date} · 컨센서스 기준 ${row.consensus_as_of || "없음"} · 실적 공개일 ${row.actual_public_date || "없음"} · 증권사 ${row.broker_count || 0}곳 · 기대 ${fmtWon(row.expected_operating_profit_krw)} · 실제 ${fmtWon(row.actual_operating_profit_krw)} · 절대 차이 ${fmtWon(finite(row.difference_krw) ? Math.abs(row.difference_krw) : null)} · 서프라이즈 ${fmtPercent(row.surprise_ratio)}${row.missing_reason ? ` · ${row.missing_reason}` : ""}`;
  }

  function interactions(container, domain, tip) {
    const layer = el("div", "chart-date-controls");
    layer.setAttribute("aria-label", "차트 날짜별 상세");
    domain.edm.forEach((row) => {
      const button = el("button", "chart-date-control", row.diagnostic_date.slice(0, 7));
      button.type = "button";
      button.dataset.sharedDate = row.diagnostic_date;
      button.dataset.chartDate = row.diagnostic_date;
      button.setAttribute("aria-describedby", tip.id);
      button.setAttribute("aria-label", edmTooltip(row));
      const show = () => { setCursor(container, row.diagnostic_date, true); revealTooltip(tip, edmTooltip(row)); };
      button.addEventListener("focus", show); button.addEventListener("pointerenter", show); button.addEventListener("click", show);
      button.addEventListener("blur", () => { setCursor(container, row.diagnostic_date, false); hideTooltip(tip); });
      button.addEventListener("pointerleave", () => { setCursor(container, row.diagnostic_date, false); hideTooltip(tip); });
      layer.append(button);
    });
    domain.earnings.forEach((row) => {
      const button = el("button", "chart-date-control earnings-date", `${row.fiscal_year}Q${row.fiscal_quarter}`);
      button.type = "button";
      button.dataset.earningsDate = row.period_date;
      button.dataset.chartDate = row.period_date;
      button.setAttribute("aria-describedby", tip.id);
      button.setAttribute("aria-label", earningsTooltip(row));
      const show = () => { setCursor(container, row.period_date, true); revealTooltip(tip, earningsTooltip(row)); };
      button.addEventListener("focus", show); button.addEventListener("pointerenter", show); button.addEventListener("click", show);
      button.addEventListener("blur", () => { setCursor(container, row.period_date, false); hideTooltip(tip); });
      button.addEventListener("pointerleave", () => { setCursor(container, row.period_date, false); hideTooltip(tip); });
      layer.append(button);
    });
    container.append(layer);
  }

  function bindPanelPointer(svg, container, rows, tip, describe) {
    if (!rows.length) return;
    const entries = rows.map((row) => ({row, date: row.diagnostic_date || row.period_date}));
    const show = (event) => {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const viewX = ((event.clientX - bounds.left) / bounds.width) * 900;
      const fraction = Math.max(0, Math.min(1, (viewX - 54) / (872 - 54)));
      const low = Number(container.dataset.timeLow);
      const high = Number(container.dataset.timeHigh);
      const target = low + fraction * (high - low);
      const nearest = entries.reduce((best, entry) => (
        Math.abs(isoTime(entry.date) - target) < Math.abs(isoTime(best.date) - target) ? entry : best
      ));
      container.dataset.activeDate = nearest.date;
      setCursor(container, nearest.date, true);
      revealTooltip(tip, describe(nearest.row));
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") {
        setCursor(container, container.dataset.activeDate, false);
        hideTooltip(tip);
      }
    });
  }

  function historyTable(container, domain) {
    const details = el("details", "chart-data-details");
    details.append(el("summary", null, "차트 값 표로 보기"));
    const wrap = el("div", "chart-table-wrap");
    const table = el("table", "chart-data-table");
    table.dataset.historyTable = "";
    table.innerHTML = "<thead><tr><th>구분</th><th>기간</th><th>시장 추격</th><th>증권사 기대</th><th>실적 이행</th><th>기대 영업이익</th><th>실제 영업이익</th><th>출처 기준</th></tr></thead>";
    const body = el("tbody");
    domain.edm.forEach((row) => {
      const tr = el("tr"); tr.dataset.kind = "edm";
      ["EDM", row.diagnostic_date, fmtNumber(row.attention_score), fmtNumber(row.expectations_score), fmtNumber(row.delivery_score), "—", "—", `추격 ${row.attention_public_date || "없음"} · 기대 ${row.expectations_public_date || "없음"} · 이행 ${row.delivery_public_date || "없음"}`].forEach((value) => tr.append(el("td", null, value)));
      body.append(tr);
    });
    domain.earnings.forEach((row) => {
      const tr = el("tr"); tr.dataset.kind = "earnings";
      ["영업이익", `${row.fiscal_year}Q${row.fiscal_quarter}`, "—", "—", "—", fmtWon(row.expected_operating_profit_krw), fmtWon(row.actual_operating_profit_krw), `기대 ${row.consensus_as_of || "없음"} · 실제 ${row.actual_public_date || "없음"} · ${row.broker_count || 0}곳`].forEach((value) => tr.append(el("td", null, value)));
      body.append(tr);
    });
    table.append(body); wrap.append(table); details.append(wrap); container.append(details);
  }

  function legend() {
    const item = el("ul", "chart-legend");
    [
      ["attention", "시장 추격"], ["expectations", "증권사 기대"], ["delivery", "실적 이행"],
      ["expected-ebit", "기대 영업이익"], ["actual-ebit", "실제 영업이익"],
    ].forEach(([key, label]) => {
      const row = el("li", `legend-${key}`); row.append(el("span", "legend-mark"), el("span", null, label)); item.append(row);
    });
    return item;
  }

  function freshnessStatus(domain, company) {
    const wrapper = el("div", "chart-history-status");
    const asOf = isoTime(company && company.diagnostic_as_of);
    const edm = el("p");
    edm.dataset.freshness = "edm";
    const latestEdm = domain.edm.at(-1);
    if (!latestEdm) edm.textContent = "EDM 이력 · 이용 불가";
    else {
      const latest = isoTime(latestEdm.diagnostic_date);
      const stale = asOf != null && latest != null && asOf - latest > 45 * 86400000;
      edm.className = stale ? "stale" : "";
      edm.textContent = `EDM 공통 구간 · ${domain.edm.length}개월 · 최신 ${latestEdm.diagnostic_date} · ${stale ? "최신 이력 지연" : "정상"}`;
    }
    const earnings = el("p");
    earnings.dataset.freshness = "earnings";
    const latestEarnings = domain.earnings.at(-1);
    if (!latestEarnings) earnings.textContent = "영업이익 이력 · 이용 불가";
    else {
      const publicDate = latestEarnings.actual_public_date;
      const freshnessDate = isoTime(publicDate || latestEarnings.period_date);
      const stale = asOf != null && freshnessDate != null && asOf - freshnessDate > 150 * 86400000;
      earnings.className = stale ? "stale" : "";
      earnings.textContent = `영업이익 공통 구간 · ${domain.earnings.length}분기 · 최근 ${latestEarnings.fiscal_year}Q${latestEarnings.fiscal_quarter} · ${stale ? "최신 이력 지연" : "정상"}`;
    }
    wrapper.append(edm, earnings);
    return wrapper;
  }

  function exactFallback(kind, row) {
    const card = el("section", "chart-exact-fallback");
    card.dataset.chartFallback = kind;
    if (kind === "edm") {
      card.append(
        el("strong", null, "추이 대신 최근 값"),
        el("span", null, "월별 공통 관측 2개 미만"),
        el("p", null, row ? `${row.diagnostic_date} · 시장 추격 ${fmtNumber(row.attention_score)} · 기대 ${fmtNumber(row.expectations_score)} · 실적 ${fmtNumber(row.delivery_score)}` : "완전한 공통 관측 없음"),
      );
    } else {
      card.append(
        el("strong", null, "추이 대신 최근 분기"),
        el("span", null, "기대·실제 공통 분기 없음"),
        el("p", null, row ? `${row.fiscal_year}Q${row.fiscal_quarter} · 기대 ${fmtWon(row.expected_operating_profit_krw)} · 실제 ${fmtWon(row.actual_operating_profit_krw)}` : "완전한 기대·실제 관측 없음"),
      );
    }
    return card;
  }

  function renderCoordinatedHistory({container, company, range = "24m"}) {
    clear(container);
    const history = company && company.history;
    const domain = selectedHistory(history, range);
    if (!domain.rawEdm.length && !domain.rawEarnings.length) {
      const empty = el("div", "chart-empty-state"); empty.dataset.chartEmpty = "company-history";
      empty.append(el("strong", null, "이력 자료 없음"), el("span", null, "현재 진단값만 제공합니다."));
      container.append(empty); return {empty: true};
    }
    container.dataset.coordinatedHistory = "";
    container.append(freshnessStatus(domain, company));
    const plotEdm = domain.edm.length >= 2;
    const plotEarnings = domain.earnings.length >= 1;
    if (plotEdm || plotEarnings) container.append(legend());
    const allDates = [
      ...(plotEdm ? domain.edm : domain.rawEdm).map((row) => row.diagnostic_date),
      ...(plotEarnings ? domain.earnings : domain.rawEarnings).flatMap((row) => [row.period_date, row.actual_public_date]).filter(Boolean),
    ];
    const allTimes = allDates.map(isoTime).filter((value) => value != null);
    container.dataset.timeLow = String(Math.min(...allTimes));
    container.dataset.timeHigh = String(Math.max(...allTimes));
    const scores = plotEdm ? scorePanel(domain.edm, range, allDates) : null;
    const earnings = plotEarnings ? earningsPanel(domain.earnings, range, allDates) : null;
    container.append(scores ? scores.svg : exactFallback("edm", domain.edm.at(-1) || domain.rawEdm.at(-1)));
    container.append(earnings ? earnings.svg : exactFallback("earnings", domain.earnings.at(-1) || domain.rawEarnings.at(-1)));
    const tip = tooltip(container);
    if (scores) bindPanelPointer(scores.svg, container, domain.edm, tip, edmTooltip);
    if (earnings) bindPanelPointer(earnings.svg, container, domain.earnings, tip, earningsTooltip);
    interactions(container, domain, tip);
    historyTable(container, domain);
    return {empty: false, edm: domain.edm.length, earnings: domain.earnings.length};
  }

  function metric(company, key) {
    const sector = company && (company.pillars || []).find((item) => item.key === "sector");
    return sector && (sector.metrics || []).find((item) => item.key === key);
  }

  function sectorPanel(rows, config) {
    const svg = baseSvg(config.panel, config.ariaLabel, "all", 220);
    const dates = rows.map((row) => row[config.dateKey]);
    const x = timeScale(dates, 54, 872);
    const values = rows.flatMap((row) => config.series.map((item) => ({value: row[item.key]})));
    const domain = extent(values, "value", [0, 1]);
    const y = numberScale(domain, 24, 180);
    drawGrid(svg, [domain[0], (domain[0] + domain[1]) / 2, domain[1]], y, config.formatter);
    config.series.forEach((item) => {
      drawLine(svg, rows.map((row) => ({...row, date: row[config.dateKey]})), item.key, item.name, x, y, item.className);
      const last = rows.filter((row) => finite(row[item.key])).at(-1);
      if (last) text(svg, item.label, {x: 868, y: y(last[item.key]) - 6, class: `direct-label ${item.className}`, "text-anchor": "end"});
    });
    text(svg, config.title, {x: 54, y: 16, class: "chart-panel-title"});
    return svg;
  }

  function sectorTable(container, prices, fundamentals) {
    const details = el("details", "chart-data-details sector-data-details");
    details.append(el("summary", null, "업종 비교값 표로 보기"));
    const wrap = el("div", "chart-table-wrap");
    const table = el("table", "chart-data-table");
    table.innerHTML = "<thead><tr><th>구분</th><th>기간</th><th>기업</th><th>업종</th><th>비교기업</th><th>상태</th><th>시점 감사</th></tr></thead>";
    const body = el("tbody");
    const auditText = (row, count, unit) => {
      if (row.metric_status === "audit-unavailable") return "이전 스냅샷: 감사정보 없음";
      const sample = finite(count) ? `${count}${unit}` : "표본 없음";
      return `분류 효력 ${row.membership_source_as_of || "없음"} · 수집 ${row.membership_available_as_of || "없음"} · ${row.metric_status || "상태 없음"} · ${sample} · ${row.interval_start || "없음"}~${row.interval_end || "없음"}${row.metric_missing_reason ? ` · ${row.metric_missing_reason}` : ""}`;
    };
    prices.forEach((row) => {
      const audit = auditText(row, row.paired_weeks, "주");
      const tr = el("tr"); ["주가 지수", row.date, fmtNumber(row.company_index), fmtNumber(row.sector_index), `${row.peer_count}개`, row.status || row.missing_reason || "자료 없음", audit].forEach((value) => tr.append(el("td", null, value))); body.append(tr);
    });
    fundamentals.forEach((row) => {
      const audit = auditText(row, row.paired_quarters, "분기");
      const tr = el("tr"); ["영업이익 성장", row.period_date, fmtPercent(row.company_operating_profit_growth), fmtPercent(row.sector_median_operating_profit_growth), `${row.peer_count}개`, row.status || row.missing_reason || "자료 없음", audit].forEach((value) => tr.append(el("td", null, value))); body.append(tr);
    });
    table.append(body); wrap.append(table); details.append(wrap); container.append(details);
  }

  function renderSectorComparison({container, payload}) {
    clear(container);
    const history = payload && payload.history;
    const company = payload && payload.company;
    const prices = Array.isArray(history && history.sector_prices) ? history.sector_prices : [];
    const fundamentals = Array.isArray(history && history.sector_fundamentals) ? history.sector_fundamentals : [];
    if (!prices.length && !fundamentals.length) {
      const empty = el("div", "chart-empty-state"); empty.dataset.chartEmpty = "sector-history";
      empty.append(el("strong", null, "업종 비교 이력 자료 없음"), el("span", null, "비교값을 만들 수 있는 기간이 부족합니다."));
      container.append(empty); return {empty: true};
    }
    container.dataset.sectorComparison = "";
    const validPrices = prices.filter((row) => row.status === "ok" && finite(row.company_index) && finite(row.sector_index));
    const validFundamentals = fundamentals.filter((row) => row.status === "ok" && finite(row.company_operating_profit_growth) && finite(row.sector_median_operating_profit_growth));
    const plottedPrices = prices.map((row) => row.status === "ok" ? row : {...row, company_index: null, sector_index: null});
    const plottedFundamentals = fundamentals.map((row) => row.status === "ok" ? row : {...row, company_operating_profit_growth: null, sector_median_operating_profit_growth: null});
    if (validPrices.length) container.append(sectorPanel(plottedPrices, {
      panel: "sector-price", ariaLabel: "기업과 leave-one-out 업종 주가 지수", dateKey: "date", title: "주가 지수 (100 기준)", formatter: (value) => fmtNumber(value),
      series: [
        {key: "company_index", name: "company-price", label: "기업", className: "company-series"},
        {key: "sector_index", name: "sector-price", label: "업종 (기업 제외)", className: "sector-series"},
      ],
    }));
    else container.append(el("p", "chart-missing-state", prices.some((row) => String(row.status).includes("insufficient") || String(row.missing_reason).includes("peer")) ? "주가 비교 자료 없음 · 비교기업 부족" : "주가 비교 자료 없음"));
    if (validFundamentals.length) container.append(sectorPanel(plottedFundamentals, {
      panel: "sector-fundamentals", ariaLabel: "기업과 leave-one-out 업종 영업이익 성장률", dateKey: "period_date", title: "영업이익 성장률", formatter: fmtPercent,
      series: [
        {key: "company_operating_profit_growth", name: "company-op-growth", label: "기업", className: "company-series"},
        {key: "sector_median_operating_profit_growth", name: "sector-op-growth", label: "업종 중앙값", className: "sector-series"},
      ],
    }));
    else container.append(el("p", "chart-missing-state", fundamentals.some((row) => String(row.status).includes("insufficient") || String(row.missing_reason).includes("peer")) ? "영업이익 비교 자료 없음 · 비교기업 부족" : "영업이익 비교 자료 없음"));
    const missingReasons = [...new Set([...prices, ...fundamentals].map((row) => row.missing_reason).filter(Boolean))];
    if (missingReasons.length) {
      container.append(el("p", "chart-missing-note", `일부 기간 자료 공백 · 선을 연결하지 않음 · ${missingReasons.join(" · ")}`));
    }
    sectorTable(container, prices, fundamentals);
    return {empty: false};
  }

  root.EDMCharts = Object.freeze({clear, renderCoordinatedHistory, renderSectorComparison});
  if (typeof window !== "undefined") window.EDMCharts = root.EDMCharts;
}(typeof window === "undefined" ? globalThis : window));
