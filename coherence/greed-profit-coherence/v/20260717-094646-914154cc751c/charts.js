(function (root) {
  "use strict";

  const NS = "http:" + "//www.w3.org/2000/svg";
  const SERIES = {
    "edm-gap": {label: "EDM 괴리", className: "edm-gap", dash: ""},
    greed: {label: "탐욕", className: "greed", dash: ""},
    support: {label: "사업 근거", className: "support", dash: ""},
    retail_heat: {label: "개인 관심 열기", className: "retail-heat", dash: ""},
    narrative: {label: "서사 증폭", className: "narrative", dash: ""},
    attention: {label: "시장 추격", className: "attention", dash: ""},
    information: {label: "정보 자극", className: "information", dash: ""},
    expectations: {label: "증권사 기대", className: "expectations", dash: ""},
    delivery: {label: "실적 이행", className: "delivery", dash: ""},
    "expected-ebit": {label: "기대 영업이익", className: "expected-ebit", dash: "7 5"},
    "actual-ebit": {label: "실제 영업이익", className: "actual-ebit", dash: ""},
  };
  const PILLARS = ["retail_heat", "narrative", "attention", "information", "expectations", "delivery"];
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

  function sampleHistory(rows, frequency) {
    if (frequency === "daily") return rows;
    const selected = new Map();
    rows.forEach((row) => {
      const date = new Date(row.diagnostic_date);
      let key;
      if (frequency === "monthly") key = row.diagnostic_date.slice(0, 7);
      else {
        const day = (date.getUTCDay() + 6) % 7;
        date.setUTCDate(date.getUTCDate() - day);
        key = date.toISOString().slice(0, 10);
      }
      selected.set(key, row);
    });
    return Array.from(selected.values());
  }

  function selectedHistory(history, frequency) {
    const allEdm = Array.isArray(history && history.edm) ? history.edm : [];
    const allEarnings = Array.isArray(history && history.earnings) ? history.earnings : [];
    const validEdm = allEdm.filter((row) => isoTime(row.diagnostic_date) != null);
    const selectedEdm = sampleHistory(
      validEdm, frequency,
    );
    const selectedEarnings = allEarnings.filter((row) => isoTime(row.period_date) != null);
    return {
      frequency,
      rawEdm: validEdm,
      rawEarnings: selectedEarnings,
      edm: selectedEdm,
      earnings: selectedEarnings,
    };
  }

  function commonHistory(domain) {
    const edmTimes = domain.rawEdm.map((row) => isoTime(row.diagnostic_date)).filter((value) => value != null);
    if (!edmTimes.length) return {...domain, rawEdm: [], edm: [], rawEarnings: [], earnings: [], commonStart: null, commonEnd: null};
    const edmLow = Math.min(...edmTimes), edmHigh = Math.max(...edmTimes);
    const earnings = domain.rawEarnings.filter((row) => {
      const time = isoTime(row.period_date);
      const hasValue = finite(row.expected_operating_profit_krw) || finite(row.actual_operating_profit_krw);
      return hasValue && time != null && time >= edmLow && time <= edmHigh;
    });
    if (!earnings.length) return {...domain, rawEdm: [], edm: [], rawEarnings: [], earnings: [], commonStart: null, commonEnd: null};
    const commonStart = earnings[0].period_date;
    const commonEnd = earnings.at(-1).period_date;
    const low = isoTime(commonStart), high = isoTime(commonEnd);
    const rawEdm = domain.rawEdm.filter((row) => {
      const time = isoTime(row.diagnostic_date);
      return time != null && time >= low && time <= high;
    });
    return {
      ...domain,
      rawEdm,
      edm: sampleHistory(rawEdm, domain.frequency),
      rawEarnings: earnings,
      earnings,
      commonStart,
      commonEnd,
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
      "data-frequency": range,
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

  function drawTimeAxis(svg, start, end, left, right, y) {
    const low = isoTime(start), high = isoTime(end);
    if (low == null || high == null) return;
    const count = 5;
    for (let index = 0; index < count; index += 1) {
      const fraction = index / (count - 1);
      const x = left + fraction * (right - left);
      const date = new Date(low + fraction * (high - low));
      const label = `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      svg.append(svgEl("line", {x1: x, x2: x, y1: y - 7, y2: y - 2, class: "chart-axis-mark"}));
      text(svg, label, {x, y: y + 12, class: "chart-tick chart-time-axis", "text-anchor": index === 0 ? "start" : index === count - 1 ? "end" : "middle"});
    }
  }

  function drawDirectLabel(svg, rows, key, seriesName, x, y, dy = 0, dx = -7) {
    const row = rows.filter((candidate) => finite(candidate[key])).at(-1);
    if (!row) return;
    const definition = SERIES[seriesName] || {};
    const cx = x(row.date || row.diagnostic_date || row.period_date);
    const cy = y(row[key]);
    svg.append(svgEl("circle", {cx, cy, r: 3.4, class: `chart-endpoint ${definition.className || seriesName}`}));
    const label = svgEl("text", {x: cx + dx, y: cy + dy, class: `chart-direct-label ${definition.className || seriesName}`, "text-anchor": "end", "data-direct-label": seriesName});
    label.textContent = definition.label || seriesName;
    svg.append(label);
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

  function scorePanel(rows, frequency, allDates, view, selectedPillars) {
    const keys = view === "pillars" ? selectedPillars : ["greed", "support"];
    const svg = baseSvg("scores", "EDM 탐욕과 사업 근거 0에서 100점", frequency, 292);
    svg.dataset.historyView = view;
    svg.dataset.domain = "0,100";
    const x = timeScale(allDates, 54, 872);
    const y = numberScale([0, 100], 24, 252);
    drawGrid(svg, [0, 25, 50, 75, 100], y, String);
    keys.forEach((key) => drawLine(svg, rows, `${key}_score`, key, x, y));
    text(svg, view === "pillars" ? "세부 지표" : "탐욕 · 사업 근거", {x: 54, y: 16, class: "chart-panel-title"});
    const cursor = svgEl("line", {y1: 24, y2: 252, class: "shared-cursor", "data-cursor-line": "scores", hidden: ""});
    svg.append(cursor);
    return {svg, x};
  }

  function earningsPanel(rows, frequency, allDates) {
    const svg = baseSvg("earnings", "발표 전 기대 영업이익과 실제 영업이익 원화", frequency, 220);
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
    drawGrid(svg, [...new Set([domain[0], 0, domain[1]])], y, fmtWon);
    const plotted = rows.map((row) => ({...row, date: row.period_date}));
    drawLine(svg, plotted, "expected_operating_profit_krw", "expected-ebit", x, y);
    drawLine(svg, plotted, "actual_operating_profit_krw", "actual-ebit", x, y);
    text(svg, "영업이익 (원)", {x: 54, y: 16, class: "chart-panel-title"});
    const cursor = svgEl("line", {y1: 24, y2: 180, class: "shared-cursor", "data-cursor-line": "earnings", hidden: ""});
    svg.append(cursor);
    return {svg, x};
  }

  function earningsDomain(rows) {
    const values = rows.flatMap((row) => [row.expected_operating_profit_krw, row.actual_operating_profit_krw]).filter(finite);
    if (!values.length || values.every((value) => value === 0)) return [-1, 1];
    let low = Math.min(0, ...values), high = Math.max(0, ...values);
    const span = high - low;
    if (low < 0) low -= span * 0.08;
    if (high > 0) high += span * 0.08;
    return [low, high];
  }

  function combinedPanel(domain, view, selectedPillars) {
    const keys = view === "pillars" ? selectedPillars : ["greed", "support"];
    const svg = baseSvg("combined", "탐욕과 사업 근거, 기대·실제 영업이익의 공통 기간", domain.frequency, 350);
    svg.dataset.historyView = view;
    svg.dataset.domain = "0,100";
    svg.dataset.commonStart = domain.commonStart;
    svg.dataset.commonEnd = domain.commonEnd;
    svg.dataset.xLeft = "64";
    svg.dataset.xRight = "836";
    const x = timeScale([domain.commonStart, domain.commonEnd], 64, 836);
    const scoreY = numberScale([0, 100], 34, 294);
    const ebitDomain = earningsDomain(domain.earnings);
    const ebitY = numberScale(ebitDomain, 34, 294);
    drawGrid(svg, [0, 25, 50, 75, 100], scoreY, String, 836);
    keys.forEach((key) => drawLine(svg, domain.edm, `${key}_score`, key, x, scoreY));
    const earnings = domain.earnings.map((row) => ({...row, date: row.period_date}));
    drawLine(svg, earnings, "expected_operating_profit_krw", "expected-ebit", x, ebitY);
    drawLine(svg, earnings, "actual_operating_profit_krw", "actual-ebit", x, ebitY);
    [...new Set([ebitDomain[0], 0, ebitDomain[1]])].forEach((tick) => {
      text(svg, fmtWon(tick), {x: 844, y: ebitY(tick) + 4, class: "chart-tick earnings-axis", "text-anchor": "start"});
    });
    text(svg, view === "pillars" ? "EDM 세부 지표 · 0–100" : "EDM · 0–100", {x: 64, y: 20, class: "chart-panel-title score-axis"});
    text(svg, "영업이익 · 원", {x: 836, y: 20, class: "chart-panel-title earnings-axis", "text-anchor": "end"});
    drawTimeAxis(svg, domain.commonStart, domain.commonEnd, 64, 836, 314);
    if (view === "overview") {
      drawDirectLabel(svg, domain.edm, "greed_score", "greed", x, scoreY, 20);
      drawDirectLabel(svg, domain.edm, "support_score", "support", x, scoreY, -15);
      drawDirectLabel(svg, earnings, "expected_operating_profit_krw", "expected-ebit", x, ebitY, -10, -96);
      drawDirectLabel(svg, earnings, "actual_operating_profit_krw", "actual-ebit", x, ebitY, -10);
    }
    svg.append(svgEl("line", {y1: 34, y2: 294, class: "shared-cursor", "data-cursor-line": "combined", hidden: ""}));
    return svg;
  }

  function gapRows(rows) {
    return rows.map((row) => ({
      ...row,
      edm_gap_score: finite(row.greed_score) && finite(row.support_score) ? row.greed_score - row.support_score : null,
    }));
  }

  function gapPanel(domain) {
    const rows = gapRows(domain.edm);
    const valid = rows.filter((row) => finite(row.edm_gap_score));
    const dates = valid.map((row) => row.diagnostic_date);
    const maxAbs = Math.max(10, ...valid.map((row) => Math.abs(row.edm_gap_score)));
    const bound = Math.min(100, Math.ceil(maxAbs / 10) * 10);
    const svg = baseSvg("edm-gap", "EDM 괴리: 탐욕에서 사업 근거를 뺀 값", domain.frequency, 350);
    svg.dataset.domain = `${-bound},${bound}`;
    svg.dataset.xLeft = "64";
    svg.dataset.xRight = "836";
    const x = timeScale(dates, 64, 836);
    const y = numberScale([-bound, bound], 36, 286);
    drawGrid(svg, [-bound, -bound / 2, 0, bound / 2, bound], y, (value) => value > 0 ? `+${value}` : String(value), 836);
    const zero = svgEl("line", {x1: 64, x2: 836, y1: y(0), y2: y(0), class: "gap-zero", "data-gap-zero": ""});
    svg.append(zero);
    drawLine(svg, rows, "edm_gap_score", "edm-gap", x, y);
    drawDirectLabel(svg, rows, "edm_gap_score", "edm-gap", x, y, -10);
    text(svg, "시장 탐욕 선행", {x: 64, y: 19, class: "chart-panel-title gap-positive"});
    text(svg, "사업 근거 선행", {x: 64, y: 303, class: "chart-panel-title gap-negative"});
    const start = dates[0], end = dates.at(-1);
    drawTimeAxis(svg, start, end, 64, 836, 320);
    domain.earnings.filter((row) => {
      const time = isoTime(row.period_date);
      return time != null && time >= isoTime(start) && time <= isoTime(end);
    }).forEach((row) => {
      const marker = svgEl("circle", {cx: x(row.period_date), cy: 286, r: 3.5, class: "earnings-event", "data-earnings-event": "", tabindex: "0"});
      const label = `${row.fiscal_year}Q${row.fiscal_quarter} 실적 · 기대 ${fmtWon(row.expected_operating_profit_krw)} · 실제 ${fmtWon(row.actual_operating_profit_krw)}`;
      marker.setAttribute("aria-label", label);
      const title = svgEl("title"); title.textContent = label; marker.append(title); svg.append(marker);
    });
    text(svg, "○ 실적 발표", {x: 836, y: 303, class: "earnings-event-label", "text-anchor": "end", "data-earnings-event-label": ""});
    svg.append(svgEl("line", {y1: 36, y2: 286, class: "shared-cursor", "data-cursor-line": "edm-gap", hidden: ""}));
    return {svg, rows};
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
    container.querySelectorAll("[data-cursor-line]").forEach((line) => {
      if (visible) {
        const svg = line.ownerSVGElement;
        const left = Number(svg && svg.dataset.xLeft) || 54;
        const right = Number(svg && svg.dataset.xRight) || 872;
        const position = left + ((isoTime(date) - low) / Math.max(1, high - low)) * (right - left);
        line.removeAttribute("hidden"); line.setAttribute("x1", position); line.setAttribute("x2", position);
      } else line.setAttribute("hidden", "");
    });
  }

  function edmTooltip(row) {
    return [
      `진단일 ${row.diagnostic_date}`,
      `탐욕 ${fmtNumber(row.greed_score)} · 사업 근거 ${fmtNumber(row.support_score)}`,
      ...PILLARS.map((key) => `${SERIES[key].label} ${fmtNumber(row[`${key}_score`])} · 공개일 ${row[`${key}_public_date`] || "없음"}`),
    ].join("\n");
  }

  function edmGapTooltip(row) {
    const gap = finite(row.edm_gap_score) ? row.edm_gap_score : finite(row.greed_score) && finite(row.support_score) ? row.greed_score - row.support_score : null;
    const shown = finite(gap) ? `${gap > 0 ? "+" : ""}${fmtNumber(gap)}` : "자료 없음";
    return `진단일 ${row.diagnostic_date}\nEDM 괴리 ${shown} · 탐욕 ${fmtNumber(row.greed_score)} · 사업 근거 ${fmtNumber(row.support_score)}`;
  }

  function earningsTooltip(row) {
    return `회계기간 ${row.period_date} · 컨센서스 기준 ${row.consensus_as_of || "없음"} · 실적 공개일 ${row.actual_public_date || "없음"} · 증권사 ${row.broker_count || 0}곳 · 기대 ${fmtWon(row.expected_operating_profit_krw)} · 실제 ${fmtWon(row.actual_operating_profit_krw)} · 절대 차이 ${fmtWon(finite(row.difference_krw) ? Math.abs(row.difference_krw) : null)} · 서프라이즈 ${fmtPercent(row.surprise_ratio)}${row.missing_reason ? ` · ${row.missing_reason}` : ""}`;
  }

  function combinedTooltip(edmRow, earningsRow) {
    return `${edmTooltip(edmRow)}\n${earningsTooltip(earningsRow)}`;
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
      const left = Number(svg.dataset.xLeft) || 54;
      const right = Number(svg.dataset.xRight) || 872;
      const fraction = Math.max(0, Math.min(1, (viewX - left) / (right - left)));
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

  function bindCombinedPointer(svg, container, edmRows, earningsRows, tip) {
    if (!edmRows.length || !earningsRows.length) return;
    const nearest = (rows, key, target) => rows.reduce((best, row) => (
      Math.abs(isoTime(row[key]) - target) < Math.abs(isoTime(best[key]) - target) ? row : best
    ));
    const show = (event) => {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const viewX = ((event.clientX - bounds.left) / bounds.width) * 900;
      const fraction = Math.max(0, Math.min(1, (viewX - 64) / (836 - 64)));
      const low = Number(container.dataset.timeLow), high = Number(container.dataset.timeHigh);
      const target = low + fraction * (high - low);
      const edmRow = nearest(edmRows, "diagnostic_date", target);
      const earningsRow = nearest(earningsRows, "period_date", target);
      container.dataset.activeDate = edmRow.diagnostic_date;
      setCursor(container, edmRow.diagnostic_date, true);
      revealTooltip(tip, combinedTooltip(edmRow, earningsRow));
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
    table.innerHTML = "<thead><tr><th>구분</th><th>기간</th><th>탐욕</th><th>사업 근거</th><th>개인 관심</th><th>서사</th><th>시장 추격</th><th>정보</th><th>증권사 기대</th><th>실적 이행</th><th>기대 영업이익</th><th>실제 영업이익</th></tr></thead>";
    const body = el("tbody");
    domain.edm.forEach((row) => {
      const tr = el("tr"); tr.dataset.kind = "edm";
      ["EDM", row.diagnostic_date, fmtNumber(row.greed_score), fmtNumber(row.support_score), fmtNumber(row.retail_heat_score), fmtNumber(row.narrative_score), fmtNumber(row.attention_score), fmtNumber(row.information_score), fmtNumber(row.expectations_score), fmtNumber(row.delivery_score), "—", "—"].forEach((value) => tr.append(el("td", null, value)));
      body.append(tr);
    });
    domain.earnings.forEach((row) => {
      const tr = el("tr"); tr.dataset.kind = "earnings";
      ["영업이익", `${row.fiscal_year}Q${row.fiscal_quarter}`, "—", "—", "—", "—", "—", "—", "—", "—", fmtWon(row.expected_operating_profit_krw), fmtWon(row.actual_operating_profit_krw)].forEach((value) => tr.append(el("td", null, value)));
      body.append(tr);
    });
    table.append(body); wrap.append(table); details.append(wrap); container.append(details);
  }

  function legend(view, selectedPillars, includeEarnings) {
    const item = el("ul", "chart-legend");
    const keys = view === "pillars" ? selectedPillars : ["greed", "support"];
    if (includeEarnings) keys.push("expected-ebit", "actual-ebit");
    keys.forEach((key) => {
      const label = SERIES[key].label;
      const row = el("li", `legend-${key}`); row.append(el("span", "legend-mark"), el("span", null, label)); item.append(row);
    });
    return item;
  }

  function freshnessStatus(domain, company) {
    const wrapper = el("div", "chart-history-status");
    const status = el("p");
    status.dataset.freshness = "common";
    const first = domain.edm[0] && domain.edm[0].diagnostic_date;
    const last = domain.edm.at(-1) && domain.edm.at(-1).diagnostic_date;
    status.textContent = first && last ? `EDM 전체 이력 · ${first}–${last} · 주간 표시` : "EDM 이력 없음";
    wrapper.append(status);
    return wrapper;
  }

  function chartStory(domain, view) {
    const item = el("p", "chart-story");
    if (view === "pillars") {
      item.textContent = "선택한 세부 지표가 탐욕과 사업 근거의 변화를 어떻게 만들었는지 확인하세요.";
      return item;
    }
    const latest = domain.edm.filter((row) => finite(row.greed_score) && finite(row.support_score)).at(-1);
    if (!latest) {
      item.textContent = "0 위는 시장 탐욕 선행, 0 아래는 사업 근거 선행입니다.";
      return item;
    }
    const gap = latest.greed_score - latest.support_score;
    const date = latest.diagnostic_date;
    if (Math.abs(gap) < 5) item.textContent = `${date} 기준, 시장 탐욕과 사업 근거가 비슷한 수준입니다.`;
    else if (gap > 0) item.textContent = `${date} 기준, 시장 탐욕이 사업 근거보다 ${Math.abs(gap).toFixed(1)}점 앞섭니다.`;
    else item.textContent = `${date} 기준, 사업 근거가 시장 탐욕보다 ${Math.abs(gap).toFixed(1)}점 앞섭니다.`;
    return item;
  }

  function exactFallback(kind, row) {
    const card = el("section", "chart-exact-fallback");
    card.dataset.chartFallback = kind;
    if (kind === "edm") {
      card.append(
        el("strong", null, "일별 이력 자료 부족"),
        el("span", null, "선을 그릴 수 있는 관측이 2개 미만입니다."),
        el("p", null, row ? `${row.diagnostic_date} · 탐욕 ${fmtNumber(row.greed_score)} · 사업 근거 ${fmtNumber(row.support_score)}` : "이력 없음"),
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

  function renderCoordinatedHistory({container, company, frequency = "weekly"}) {
    clear(container);
    const history = company && company.history;
    const sourceDomain = selectedHistory(history, frequency);
    if (!sourceDomain.rawEdm.length) {
      const empty = el("div", "chart-empty-state"); empty.dataset.chartEmpty = "company-history";
      empty.append(el("strong", null, "이력 자료 없음"), el("span", null, "현재 진단값만 제공합니다."));
      container.append(empty); return {empty: true};
    }
    container.dataset.coordinatedHistory = "";
    container.dataset.historyView = "gap";
    container.dataset.frequency = frequency;
    const sampledValid = gapRows(sourceDomain.edm).filter((row) => finite(row.edm_gap_score));
    const domain = sampledValid.length >= 2 ? sourceDomain : {...sourceDomain, edm: sourceDomain.rawEdm};
    const validRows = gapRows(domain.edm).filter((row) => finite(row.edm_gap_score));
    container.append(chartStory(domain, "gap"), freshnessStatus(domain, company));
    if (validRows.length < 2) {
      const fallback = el("section", "chart-exact-fallback");
      fallback.dataset.chartFallback = "edm-gap";
      fallback.append(el("strong", null, "EDM 이력 부족"), el("span", null, "괴리 추이를 그릴 수 있는 관측이 부족합니다."));
      container.append(fallback);
      return {empty: false, edm: 0, earnings: 0};
    }
    container.dataset.timeLow = String(isoTime(validRows[0].diagnostic_date));
    container.dataset.timeHigh = String(isoTime(validRows.at(-1).diagnostic_date));
    const {svg, rows} = gapPanel(domain);
    container.append(svg);
    const tip = tooltip(container);
    bindPanelPointer(svg, container, rows.filter((row) => finite(row.edm_gap_score)), tip, edmGapTooltip);
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
