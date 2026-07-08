/* SVG chart components — line chart with crosshair tooltip, allocation donut,
   sparklines. No dependencies. Palette (validated for surface #141824):
   categorical gold/blue/teal/violet, status gain/loss. Text always wears text
   tokens; series color lives only in marks and legend swatches. */

import { CHART_COLORS, BUCKET_META, BUCKETS } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
}

function textNode(tag, attrs, content) {
  const n = el(tag, attrs);
  n.textContent = content;
  return n;
}

const fmtAxis = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(a < 10 ? 2 : 0);
};

/* ---------- line chart ----------
   points: [{t: label, value: number}] — single series (no legend needed).
   Renders into `container`, replacing its content. `formatValue` renders the
   tooltip/last-value label. */
export function lineChart(container, points, { color = CHART_COLORS.line, height = 220, formatValue = fmtAxis } = {}) {
  container.replaceChildren();
  const data = (points || []).filter((p) => p && Number.isFinite(p.value));
  if (data.length < 2) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.textContent = 'Not enough history yet — snapshots are recorded daily.';
    container.appendChild(empty);
    return;
  }

  const W = Math.max(280, container.clientWidth || 600);
  const H = height;
  const pad = { l: 46, r: 14, t: 14, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  let min = Math.min(...data.map((p) => p.value));
  let max = Math.max(...data.map((p) => p.value));
  if (min === max) { min -= Math.abs(min) * 0.05 + 1; max += Math.abs(max) * 0.05 + 1; }
  const span = max - min;
  min -= span * 0.06; max += span * 0.06;

  const x = (i) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': 'Portfolio value over time' });

  // recessive horizontal grid + y labels (4 lines)
  for (let g = 0; g <= 3; g++) {
    const v = min + ((max - min) * g) / 3;
    svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'chart-grid' }));
    svg.appendChild(textNode('text', { x: pad.l - 8, y: y(v) + 4, class: 'chart-tick', 'text-anchor': 'end' }, fmtAxis(v)));
  }
  // x labels: first / middle / last
  for (const i of [0, Math.floor((data.length - 1) / 2), data.length - 1]) {
    svg.appendChild(textNode('text', {
      x: x(i), y: H - 6, class: 'chart-tick',
      'text-anchor': i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle',
    }, data[i].t));
  }

  const lineD = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  svg.appendChild(el('path', { d: `${lineD}L${x(data.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z`, fill: color, opacity: 0.08 }));
  svg.appendChild(el('path', { d: lineD, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // direct label on the last point (selective labeling, text token colour)
  const last = data[data.length - 1];
  svg.appendChild(el('circle', { cx: x(data.length - 1), cy: y(last.value), r: 3.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }));

  // crosshair + tooltip layer
  const cross = el('line', { y1: pad.t, y2: pad.t + ih, class: 'chart-cross', visibility: 'hidden' });
  const dot = el('circle', { r: 4.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' });
  svg.appendChild(cross);
  svg.appendChild(dot);

  const tip = document.createElement('div');
  tip.className = 'chart-tip hidden';
  container.style.position = 'relative';
  container.appendChild(svg);
  container.appendChild(tip);

  const lastLabel = document.createElement('div');
  lastLabel.className = 'chart-last';
  lastLabel.textContent = formatValue(last.value);
  container.appendChild(lastLabel);

  function onMove(evt) {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / iw) * (data.length - 1))));
    const p = data[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.value));
    dot.setAttribute('visibility', 'visible');
    tip.classList.remove('hidden');
    tip.innerHTML = `<b>${p.t}</b><span>${formatValue(p.value)}</span>`;
    const tipX = Math.min(Math.max(0, (x(i) / W) * rect.width - 50), rect.width - 110);
    tip.style.left = `${tipX}px`;
    tip.style.top = `0px`;
  }
  function onLeave() {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.classList.add('hidden');
  }
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);
}

/* ---------- allocation donut ----------
   values: {HIGH, MEDIUM, LOW, TAX} in base currency. 2px surface gaps between
   segments; identity via legend + direct % labels (never color alone). */
export function allocationDonut(container, values, { size = 190, formatValue = fmtAxis } = {}) {
  container.replaceChildren();
  const total = BUCKETS.reduce((s, b) => s + Math.max(0, values[b] || 0), 0);

  const wrapper = document.createElement('div');
  wrapper.className = 'donut-wrap';

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Allocation split' });
  const cx = size / 2, cy = size / 2, r = size / 2 - 10, thickness = 26;

  if (total <= 0) {
    svg.appendChild(el('circle', { cx, cy, r: r - thickness / 2, fill: 'none', stroke: 'var(--surface2)', 'stroke-width': thickness }));
  } else {
    let a0 = -Math.PI / 2;
    for (const b of BUCKETS) {
      const frac = Math.max(0, values[b] || 0) / total;
      if (frac <= 0) continue;
      const a1 = a0 + frac * Math.PI * 2;
      svg.appendChild(el('path', {
        d: arcPath(cx, cy, r - thickness / 2, a0, a1),
        fill: 'none', stroke: CHART_COLORS.categorical[b], 'stroke-width': thickness,
        // 2px gap between segments via surface-coloured stroke on the seam
        'stroke-linecap': 'butt',
      }));
      // seam: draw a 2px surface line at each segment start
      svg.appendChild(el('line', {
        x1: cx + Math.cos(a0) * (r - thickness), y1: cy + Math.sin(a0) * (r - thickness),
        x2: cx + Math.cos(a0) * r, y2: cy + Math.sin(a0) * r,
        stroke: 'var(--surface)', 'stroke-width': 2,
      }));
      a0 = a1;
    }
  }
  svg.appendChild(textNode('text', { x: cx, y: cy - 4, class: 'donut-total', 'text-anchor': 'middle' }, formatValue(total)));
  svg.appendChild(textNode('text', { x: cx, y: cy + 16, class: 'donut-sub', 'text-anchor': 'middle' }, 'total'));

  const legend = document.createElement('div');
  legend.className = 'donut-legend';
  for (const b of BUCKETS) {
    const v = Math.max(0, values[b] || 0);
    const pct = total > 0 ? (v / total) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `<span class="swatch" style="background:${CHART_COLORS.categorical[b]}"></span>`
      + `<span class="legend-label">${BUCKET_META[b].label}</span>`
      + `<span class="legend-val">${pct.toFixed(1)}% · ${formatValue(v)}</span>`;
    legend.appendChild(row);
  }

  wrapper.appendChild(svg);
  wrapper.appendChild(legend);
  container.appendChild(wrapper);
}

function arcPath(cx, cy, r, a0, a1) {
  // clamp a full circle slightly so the arc renders
  if (a1 - a0 >= Math.PI * 2) a1 = a0 + Math.PI * 2 - 0.0001;
  const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/* ---------- sparkline (movers rows) ----------
   series: [{t, price}]; colored by day direction, 1.5px, no axes. */
export function sparkline(series, changePct, { width = 84, height = 28 } = {}) {
  const data = (series || []).filter((p) => p && Number.isFinite(p.price));
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'spark', 'aria-hidden': 'true' });
  if (data.length < 2) return svg;
  const min = Math.min(...data.map((p) => p.price));
  const max = Math.max(...data.map((p) => p.price));
  const span = max - min || 1;
  const x = (i) => (i / (data.length - 1)) * (width - 4) + 2;
  const y = (v) => 2 + (1 - (v - min) / span) * (height - 4);
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join('');
  const color = (changePct ?? 0) >= 0 ? CHART_COLORS.gain : CHART_COLORS.loss;
  svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  return svg;
}

/* ---------- target-vs-actual bars (allocation screen) ---------- */
export function driftBars(container, rows, { formatValue = fmtAxis } = {}) {
  container.replaceChildren();
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'drift-row';
    const pctA = Math.min(100, r.actual * 100);
    const pctT = Math.min(100, r.target * 100);
    row.innerHTML =
      `<div class="drift-head"><span class="swatch" style="background:${CHART_COLORS.categorical[r.bucket]}"></span>`
      + `<span class="legend-label">${BUCKET_META[r.bucket].label}</span>`
      + `<span class="legend-val">${(r.actual * 100).toFixed(1)}% of ${(r.target * 100).toFixed(0)}%</span></div>`
      + `<div class="drift-track"><div class="drift-fill" style="width:${pctA.toFixed(1)}%;background:${CHART_COLORS.categorical[r.bucket]}"></div>`
      + `<div class="drift-target" style="left:${pctT.toFixed(1)}%"></div></div>`
      + `<div class="drift-note ${r.needsAction ? 'warn' : ''}">${r.needsAction
          ? `${r.move > 0 ? 'Add' : 'Trim'} ${formatValue(Math.abs(r.move))}`
          : 'On target'}</div>`;
    container.appendChild(row);
  }
}
