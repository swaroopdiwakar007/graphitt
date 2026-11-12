/* Graphitt — paste a table, pick a chart, export PNG / PDF. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  // Categorical slots, assigned in fixed order (validated light palette).
  const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  const EXTRA = '#898781'; // 9th+ series and "Other" slice
  const INK = {
    primary: '#0b0b0b', secondary: '#52514e', muted: '#898781',
    grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff',
  };
  const ARC_TYPES = ['pie', 'doughnut', 'polar'];
  const STORE_KEY = 'graphitt:v2';
  const OLD_KEY = 'graph-board:v2'; // before the rename

  const svg = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const TYPES = [
    { id: 'bar', name: 'Bar', icon: '<path d="M3 20h18"/><path d="M6.5 20v-6M12 20V6.5M17.5 20v-9.5" stroke-width="3.5" stroke-linecap="butt"/>' },
    { id: 'hbar', name: 'Horizontal', icon: '<path d="M4 3v18"/><path d="M4 7h10M4 12h15M4 17h7" stroke-width="3.5" stroke-linecap="butt"/>' },
    { id: 'stacked', name: 'Stacked', icon: '<path d="M3 20h18"/><path d="M7 20v-6M17 20v-8" stroke-width="4" stroke-linecap="butt"/><path d="M7 13v-4M17 11V5" stroke-width="4" stroke-linecap="butt" opacity=".45"/>' },
    { id: 'line', name: 'Line', icon: '<path d="M3 17l5-6 4 3 4-7 5 4"/>' },
    { id: 'area', name: 'Area', icon: '<path d="M3 20v-4l5-5 4 3 5-6 4 3v9z" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M3 16l5-5 4 3 5-6 4 3"/>' },
    { id: 'stackedArea', name: 'Stacked area', icon: '<path d="M3 20v-4l6-3 5 2 7-4v9z" fill="currentColor" fill-opacity=".45" stroke="none"/><path d="M3 16l6-3 5 2 7-4V6l-7 3-5-3-6 4z" fill="currentColor" fill-opacity=".18" stroke="none"/><path d="M3 10l6-4 5 3 7-3"/>' },
    { id: 'step', name: 'Step', icon: '<path d="M3 18h4v-5h5v3h4V7h5"/>' },
    { id: 'scatter', name: 'Scatter', icon: '<path d="M3 3v18h18"/><circle cx="8" cy="15" r="1.4" fill="currentColor"/><circle cx="11" cy="10" r="1.4" fill="currentColor"/><circle cx="14" cy="13" r="1.4" fill="currentColor"/><circle cx="17" cy="7" r="1.4" fill="currentColor"/><circle cx="19" cy="11" r="1.4" fill="currentColor"/>' },
    { id: 'bubble', name: 'Bubble', icon: '<circle cx="8" cy="15" r="4"/><circle cx="16" cy="8" r="3"/><circle cx="17.5" cy="17" r="2"/>' },
    { id: 'combo', name: 'Bar + line', icon: '<path d="M3 20h18"/><path d="M6.5 20v-5M12 20v-8M17.5 20v-6" stroke-width="3.5" stroke-linecap="butt" opacity=".45"/><path d="M4 11l5-4 5 2 6-5"/>' },
    { id: 'pie', name: 'Pie', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6.5 5.5"/>' },
    { id: 'doughnut', name: 'Doughnut', icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 3.5V8M15 15l3.8 3"/>' },
    { id: 'polar', name: 'Polar', icon: '<path d="M12 12V3a9 9 0 0 1 8.6 6.3z" fill="currentColor" fill-opacity=".25"/><path d="M12 12l5.5 4.2A7 7 0 0 1 8 17.7z"/><path d="M12 12l-6.4-2.3A6.8 6.8 0 0 1 9 6.6z"/>' },
    { id: 'radar', name: 'Radar', icon: '<path d="M12 3l8.5 6.2-3.2 10.3H6.7L3.5 9.2z"/><path d="M12 8l4.2 3.3-1.8 5H9.4l-1.3-5z" fill="currentColor" fill-opacity=".25"/>' },
    { id: 'histogram', name: 'Histogram', icon: '<path d="M3 20h18"/><path d="M4 20v-5h4V9h4V5h4v7h4v8" />' },
  ];

  const SAMPLE = [
    ['Month', 'Online', 'Retail', 'Wholesale'],
    ['Jan', 4200, 3100, 2600], ['Feb', 4550, 2980, 2700], ['Mar', 5100, 3320, 2950],
    ['Apr', 5480, 3410, 2880], ['May', 6020, 3600, 3120], ['Jun', 6390, 3540, 3300],
    ['Jul', 6850, 3720, 3260], ['Aug', 7100, 3810, 3480], ['Sep', 6920, 3690, 3550],
    ['Oct', 7480, 3950, 3700], ['Nov', 8260, 4410, 3820], ['Dec', 9150, 5120, 3940],
  ].map(r => r.join('\t')).join('\n');

  // -------------------------------------------------------------------- state
  // One entry per chart. `fresh` means "new table — pick default columns".
  const DEFAULTS = {
    raw: '', headerAuto: true, header: true, transpose: false, fresh: true,
    type: 'bar', labelCol: 0, series: [], known: [], colors: {},
    title: '', subtitle: '', xTitle: '', yTitle: '',
    legend: 'auto', showValues: false, smooth: false, beginZero: true, grid: true, bins: 10,
    width: 960, height: 540, scale: 2, bg: 'white',
    x: 0, y: 0, z: 1, // position and stacking order on the board
  };
  const uid = () => 'c' + Math.random().toString(36).slice(2, 10);
  const newChart = (over = {}) => Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), over, { id: uid() });
  const doc = load();
  let state = null;     // the graph being edited (style drawer / table); null when none is selected
  let columns = [];     // [{name, raw[], values[], numeric}]
  let matrix = [];      // the table as displayed (after "series in rows"), header row included

  const $ = s => document.querySelector(s);
  // The table panel lives in a <template>; it is attached under a graph when expanded.
  const panelNode = document.getElementById('table-panel-tpl').content.firstElementChild.cloneNode(true);
  panelNode.hidden = true;
  document.body.appendChild(panelNode);
  const el = {
    data: $('#data'), header: $('#opt-header'), transpose: $('#opt-transpose'),
    status: $('#data-status'), preview: $('#preview'),
    types: $('#types'), xField: $('#x-field'), xLabelText: $('#x-label-text'), xCol: $('#x-col'),
    series: $('#series'), seriesNote: $('#series-note'), binsField: $('#bins-field'),
    preset: $('#preset'), w: $('#w'), h: $('#h'),
    area: $('#area'), world: $('#world'), zoomPct: $('#zoom-pct'),
    png: $('#dl-png'), pdf: $('#dl-pdf'), toast: $('#toast'), panel: panelNode,
    drawer: $('#style-panel'), styleTitle: $('#style-title'), menu: $('#card-menu'),
    modal: $('#add-modal'), addText: $('#add-text'), addStatus: $('#add-status'), addCreate: $('#add-create'),
    props: $('#props'), welcome: $('#welcome'), undo: $('#undo'), redo: $('#redo'),
  };

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_KEY)); } catch { /* storage unavailable */ }
    const pen = { stroke: '#1e1e1e', sw: 3, fill: 'none', fs: 24 };
    if (saved && Array.isArray(saved.charts)) {
      let nextX = 0;
      const charts = saved.charts
        .filter(c => (c.raw || '').trim() || (c.title || '').trim()) // drop leftover empty graphs
        .map((c, i) => {
          const placed = typeof c.x === 'number';
          const n = newChart(c);
          if (!placed) { n.x = nextX; n.y = 0; n.z = i + 1; } // older saves had no positions: lay out in a row
          nextX = Math.max(nextX, n.x + n.width + 80);
          return n;
        });
      const v = saved.view;
      const view = v && [v.x, v.y, v.z].every(Number.isFinite) ? v : null;
      const items = Array.isArray(saved.items) ? saved.items.filter(it => it && it.id && it.kind) : [];
      return { charts, items, view, pen: Object.assign(pen, saved.pen || {}) };
    }
    return { charts: [], items: [], view: null, pen };
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(doc)); } catch { /* storage unavailable */ }
      commitHistory();
    }, 300);
  }

  // ------------------------------------------------------------- undo / redo
  // Snapshots of the graphs and drawings, taken whenever the board is saved.
  const undoStack = [];
  let undoAt = -1;
  const snapshot = () => JSON.stringify({ charts: doc.charts, items: doc.items });
  function commitHistory() {
    const s = snapshot();
    if (undoStack[undoAt] === s) return;
    undoStack.splice(undoAt + 1);
    undoStack.push(s);
    if (undoStack.length > 150) undoStack.shift();
    undoAt = undoStack.length - 1;
    updateUndoButtons();
  }
  function updateUndoButtons() {
    el.undo.disabled = undoAt <= 0;
    el.redo.disabled = undoAt >= undoStack.length - 1;
  }

  // ------------------------------------------------------------------ parsing
  function num(s) {
    if (s == null) return null;
    if (typeof s === 'number') return Number.isFinite(s) ? s : null;
    let t = String(s).trim();
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/[\s  '$€£¥₹%]/g, '').replace(/^(USD|EUR|GBP|INR|Rs\.?)/i, '');
    if (t.includes(',') && t.includes('.')) {
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (t.includes(',')) {
      if (/^[-+]?\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
      else if (/^[-+]?\d*,\d+$/.test(t)) t = t.replace(',', '.');
    }
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
    const v = parseFloat(t);
    return neg ? -v : v;
  }

  function splitDelimited(text, d) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell); rows.push(row);
    return rows;
  }

  function parseTable(text) {
    text = String(text || '').replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
    if (!text.trim()) return [];
    const lines = text.split('\n');
    let rows;
    // Markdown / pipe table
    if (lines.filter(l => l.trim().startsWith('|')).length >= Math.max(2, lines.length * 0.6)) {
      rows = lines
        .filter(l => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
        .map(l => l.trim().replace(/^\||\|$/g, '').split('|'));
    } else {
      const first = lines[0];
      const count = ch => (first.match(new RegExp('\\' + ch, 'g')) || []).length;
      let d;
      if (first.includes('\t')) d = '\t';
      else {
        const c = count(','), s = count(';');
        d = s > c ? ';' : c ? ',' : null;
      }
      rows = d ? splitDelimited(text, d) : lines.map(l => l.trim().split(/\s{2,}|\s+(?=[-+(]?[$€£¥₹]?\d)/));
    }
    rows = rows.map(r => r.map(c => c.trim()));
    rows = rows.filter(r => r.some(c => c !== ''));
    const width = Math.max(0, ...rows.map(r => r.length));
    rows = rows.map(r => { while (r.length < width) r.push(''); return r; });
    // drop columns that are entirely empty
    const keep = [];
    for (let c = 0; c < width; c++) if (rows.some(r => r[c] !== '')) keep.push(c);
    return rows.map(r => keep.map(c => r[c]));
  }

  function fromHtmlTable(html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table');
      if (!table) return null;
      const rows = [...table.rows].map(tr => [...tr.cells].map(td => td.textContent.replace(/\s+/g, ' ').trim()));
      if (!rows.length) return null;
      return rows.map(r => r.join('\t')).join('\n');
    } catch { return null; }
  }

  const transpose = rows => rows.length ? rows[0].map((_, c) => rows.map(r => r[c] ?? '')) : rows;
  const isYear = s => /^(1[89]|2[01])\d\d$/.test(String(s).trim());

  function detectHeader(rows) {
    if (rows.length < 2) return false;
    const first = rows[0], rest = rows.slice(1);
    if (first[0] === '' && first.slice(1).some(c => c !== '')) return true;
    const colNum = c => rest.filter(r => num(r[c]) != null).length >= rest.filter(r => r[c] !== '').length * 0.8;
    for (let c = 0; c < first.length; c++) {
      if (first[c] !== '' && num(first[c]) == null && colNum(c) && rest.some(r => r[c] !== '')) return true;
    }
    // "Region | 2022 | 2023" style headers
    const tail = first.slice(1).filter(c => c !== '');
    if (tail.length && tail.every(isYear) && num(first[0]) == null && rest.some(r => r.slice(1).some(c => num(c) != null && !isYear(c)))) return true;
    // text-only first row over a table that has numbers
    if (first.every(c => num(c) == null) && rest.some(r => r.some(c => num(c) != null))) return true;
    return false;
  }

  const colLetter = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // useMatrix: build from the table being edited instead of re-parsing the text
  function buildColumns(useMatrix = false) {
    let rows;
    if (useMatrix) rows = matrix;
    else {
      rows = parseTable(state.raw);
      if (state.transpose) rows = transpose(rows);
      matrix = rows;
    }
    if (state.headerAuto) state.header = detectHeader(rows);
    const head = state.header && rows.length ? rows[0] : null;
    const body = state.header ? rows.slice(1) : rows;
    const width = rows.length ? rows[0].length : 0;
    const seen = {};
    columns = [];
    for (let c = 0; c < width; c++) {
      let name = (head && head[c]) || (c === 0 && head ? 'Label' : `Column ${colLetter(c)}`);
      if (seen[name]) name = `${name} (${++seen[name]})`; else seen[name] = 1;
      const raw = body.map(r => r[c] ?? '');
      const values = raw.map(num);
      const filled = raw.filter(v => v !== '').length;
      const numeric = filled > 0 && values.filter(v => v != null).length >= filled * 0.8;
      columns.push({ name, raw, values, numeric });
    }
    const numericIdx = columns.map((c, i) => i).filter(i => columns[i].numeric);
    if (state.fresh) {
      // a brand-new table: choose sensible defaults
      state.fresh = false;
      state.colors = {};
      const firstText = columns.findIndex(c => !c.numeric);
      state.labelCol = firstText >= 0 ? firstText : 0;
      state.series = numericIdx.filter(i => i !== state.labelCol).slice(0, 8);
      if (!state.series.length && columns[state.labelCol]?.numeric) state.series = [state.labelCol];
    } else {
      // an edit: keep the user's choices, auto-add columns that just became numeric
      const known = new Set(state.known);
      numericIdx.forEach(i => {
        if (!known.has(i) && i !== state.labelCol && !state.series.includes(i) && state.series.length < 8) state.series.push(i);
      });
      state.series.sort((a, b) => a - b);
    }
    state.known = numericIdx;
    state.labelCol = Math.min(state.labelCol, Math.max(0, columns.length - 1));
    state.series = state.series.filter(i => i < columns.length && columns[i].numeric);
  }

  // Write the (edited) matrix back into the chart's raw text.
  function serialize() {
    const rows = state.transpose ? transpose(matrix) : matrix;
    return rows.map(r => r.map(c => {
      c = String(c ?? '').replace(/[\t\r\n]+/g, ' ');
      return c.startsWith('"') ? '"' + c.replace(/"/g, '""') + '"' : c;
    }).join('\t')).join('\n');
  }

  // ------------------------------------------------------------------- colors
  function colorFor(i) {
    const col = columns[i];
    if (col && state.colors[i]) return state.colors[i];
    const order = columns.map((c, k) => k).filter(k => columns[k].numeric && k !== state.labelCol);
    const pos = order.indexOf(i);
    return pos >= 0 && pos < PALETTE.length ? PALETTE[pos] : EXTRA;
  }
  function alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // --------------------------------------------------------------- formatting
  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const nfCompact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = v => (v == null || Number.isNaN(v) ? '' : nf.format(v));
  const fmtShort = v => (v == null ? '' : Math.abs(v) >= 10000 ? nfCompact.format(v) : nf.format(v));

  // ------------------------------------------------------------------ plugins
  const bgPlugin = {
    id: 'bg',
    beforeDraw(c, _a, o) {
      if (!o || !o.color) return;
      const ctx = c.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = o.color;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    },
  };

  const valuesPlugin = {
    id: 'values',
    afterDatasetsDraw(c, _a, o) {
      if (!o || !o.show) return;
      const ctx = c.ctx;
      const kind = o.kind;
      ctx.save();
      ctx.font = `500 11px ${FONT}`;
      c.data.datasets.forEach((ds, i) => {
        const meta = c.getDatasetMeta(i);
        if (meta.hidden || !c.isDatasetVisible(i)) return;
        if (meta.data.length > 60 && kind !== 'arc') return; // too dense to label
        const total = kind === 'arc' ? ds.data.reduce((s, v) => s + (c.getDataVisibility(ds.data.indexOf(v)) ? Math.abs(v || 0) : 0), 0) : 0;
        meta.data.forEach((elm, j) => {
          let v = ds.data[j];
          if (v && typeof v === 'object') v = v.y;
          if (v == null || Number.isNaN(v)) return;
          if (kind === 'arc') {
            if (!c.getDataVisibility(j)) return;
            const pct = total ? (Math.abs(v) / total) * 100 : 0;
            if (pct < 3) return;
            const p = elm.tooltipPosition();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `600 12px ${FONT}`;
            ctx.fillText(`${pct.toFixed(pct < 10 ? 1 : 0)}%`, p.x, p.y);
            return;
          }
          const text = fmtShort(v);
          ctx.fillStyle = INK.secondary;
          if (kind === 'stacked') {
            const horiz = c.options.indexAxis === 'y';
            const len = horiz ? Math.abs(elm.x - elm.base) : Math.abs(elm.y - elm.base);
            if (len < 16) return;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, horiz ? (elm.x + elm.base) / 2 : elm.x, horiz ? elm.y : (elm.y + elm.base) / 2);
          } else if (kind === 'hbar') {
            ctx.textAlign = v < 0 ? 'right' : 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(text, elm.x + (v < 0 ? -6 : 6), elm.y);
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = v < 0 && kind === 'bar' ? 'top' : 'bottom';
            ctx.fillText(text, elm.x, elm.y + (v < 0 && kind === 'bar' ? 6 : -6));
          }
        });
      });
      ctx.restore();
    },
  };

  // ---------------------------------------------------------- chart building
  function axis(title, { grid = true, stacked = false, type, beginZero } = {}) {
    const a = {
      grid: { display: grid && state.grid, color: INK.grid, drawTicks: false },
      border: { color: INK.axis },
      ticks: { color: INK.muted, padding: 8, font: { size: 12 } },
      title: { display: !!title, text: title, color: INK.secondary, font: { size: 12, weight: '500' }, padding: { top: 10, bottom: 4 } },
      stacked,
    };
    if (type) a.type = type;
    if (beginZero !== undefined) {
      a.beginAtZero = beginZero;
      a.ticks.callback = v => fmtShort(v);
    }
    return a;
  }

  function seriesNote() {
    const t = state.type;
    if (ARC_TYPES.includes(t)) return 'Uses the first selected series. The labels column names each slice.';
    if (t === 'scatter') return 'Each series is plotted against the X column, which should contain numbers.';
    if (t === 'bubble') return columns[state.labelCol]?.numeric
      ? 'X = X column, Y = first series, bubble size = second series.'
      : 'X = first series, Y = second series, bubble size = third series. Labels name each bubble.';
    if (t === 'histogram') return 'Counts how many values of each series fall into each bin.';
    if (t === 'combo') return 'The first series is drawn as bars, the rest as lines.';
    if (t === 'radar') return 'Labels become the spokes; each series is one shape.';
    return '';
  }

  function buildConfig() {
    const t = state.type;
    const lab = columns[state.labelCol];
    const labels = lab ? lab.raw.map((v, i) => (v === '' ? String(i + 1) : v)) : [];
    const series = state.series.filter(i => columns[i]).map(i => ({ i, name: columns[i].name, values: columns[i].values, color: colorFor(i) }));
    if (!series.length) return { error: 'Pick at least one series to plot.' };

    const xT = state.xTitle, yT = state.yTitle;
    let type, datasets = [], dataLabels = labels, scales = {}, indexAxis = 'x', kind = 'bar', interactionMode = 'index';
    let legendCount = series.length;
    const many = labels.length > 40;

    const barBase = c => ({ backgroundColor: c, hoverBackgroundColor: c, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 56, categoryPercentage: 0.72, barPercentage: 0.88 });
    const lineBase = (c, fill) => ({
      borderColor: c, backgroundColor: fill ? alpha(c, 0.16) : c, borderWidth: 2,
      pointRadius: many ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: c, pointBorderColor: '#ffffff', pointBorderWidth: 1.5,
      tension: state.smooth ? 0.35 : 0, spanGaps: true,
    });

    switch (t) {
      case 'bar': case 'hbar': case 'stacked': {
        type = 'bar';
        const stacked = t === 'stacked';
        const horiz = t === 'hbar';
        indexAxis = horiz ? 'y' : 'x';
        kind = stacked ? 'stacked' : horiz ? 'hbar' : 'bar';
        datasets = series.map(s => Object.assign(barBase(s.color), { label: s.name, data: s.values },
          stacked ? { borderRadius: 0, borderSkipped: false, borderColor: '#ffffff', borderWidth: { top: 1, bottom: 1 } } : {}));
        const cat = axis(horiz ? yT : xT, { grid: false, stacked });
        const val = axis(horiz ? xT : yT, { stacked, beginZero: state.beginZero || stacked });
        scales = horiz ? { y: cat, x: val } : { x: cat, y: val };
        if (horiz) { scales.y.title.text = yT; scales.x.title.text = xT; }
        break;
      }
      case 'combo': {
        type = 'bar';
        datasets = series.map((s, k) => k === 0
          ? Object.assign(barBase(s.color), { label: s.name, data: s.values, order: 2 })
          : Object.assign(lineBase(s.color, false), { type: 'line', label: s.name, data: s.values, order: 1 }));
        scales = { x: axis(xT, { grid: false }), y: axis(yT, { beginZero: state.beginZero }) };
        break;
      }
      case 'line': case 'area': case 'stackedArea': case 'step': {
        type = 'line'; kind = 'line';
        const fill = t === 'area' || t === 'stackedArea';
        const stacked = t === 'stackedArea';
        datasets = series.map((s, k) => Object.assign(lineBase(s.color, fill), {
          label: s.name, data: s.values,
          fill: fill ? (stacked ? (k === 0 ? 'origin' : '-1') : 'origin') : false,
          stepped: t === 'step' ? 'middle' : false,
          backgroundColor: fill ? alpha(s.color, stacked ? 0.55 : 0.16) : s.color,
        }));
        if (t === 'step') datasets.forEach(d => { d.tension = 0; });
        scales = { x: axis(xT, { grid: false }), y: axis(yT, { stacked, beginZero: state.beginZero || stacked }) };
        break;
      }
      case 'scatter': {
        type = 'scatter'; kind = 'line'; interactionMode = 'nearest';
        const xs = lab && lab.numeric ? lab.values : labels.map((_, k) => k + 1);
        datasets = series.filter(s => s.i !== state.labelCol).map(s => ({
          label: s.name, backgroundColor: s.color, borderColor: '#ffffff', borderWidth: 1, pointRadius: 5, pointHoverRadius: 7,
          data: s.values.map((y, k) => (y != null && xs[k] != null ? { x: xs[k], y, label: labels[k] } : null)).filter(Boolean),
        }));
        if (!datasets.length) return { error: 'Pick a series other than the X column.' };
        legendCount = datasets.length;
        scales = { x: axis(xT || (lab ? lab.name : ''), { type: 'linear', beginZero: false }), y: axis(yT, { beginZero: state.beginZero }) };
        if (state.smooth) datasets.forEach(d => { d.showLine = true; d.borderColor = d.backgroundColor; d.borderWidth = 2; d.tension = 0.35; });
        break;
      }
      case 'bubble': {
        type = 'bubble'; kind = 'none'; interactionMode = 'nearest';
        const useLabelX = lab && lab.numeric && !state.series.includes(state.labelCol);
        const need = useLabelX ? 1 : 2;
        if (series.length < need) return { error: useLabelX ? 'Pick a series for Y.' : 'A bubble chart needs at least two numeric series (X and Y). A third sets bubble size.' };
        const xs = useLabelX ? lab.values : series[0].values;
        const ys = useLabelX ? series[0].values : series[1].values;
        const rs = useLabelX ? series[1]?.values : series[2]?.values;
        const rMax = rs ? Math.max(...rs.filter(v => v != null).map(Math.abs)) || 1 : 1;
        const ySeries = useLabelX ? series[0] : series[1];
        datasets = [{
          label: ySeries.name,
          backgroundColor: alpha(ySeries.color, 0.72), borderColor: '#ffffff', borderWidth: 1.5, hoverBackgroundColor: ySeries.color,
          data: xs.map((x, k) => (x != null && ys[k] != null ? { x, y: ys[k], r: rs ? 4 + 26 * Math.sqrt(Math.abs(rs[k] || 0) / rMax) : 8, size: rs ? rs[k] : null, label: labels[k] } : null)).filter(Boolean),
        }];
        legendCount = 1;
        const xName = useLabelX ? lab.name : series[0].name;
        scales = { x: axis(xT || xName, { type: 'linear', beginZero: false }), y: axis(yT || ySeries.name, { beginZero: state.beginZero }) };
        break;
      }
      case 'pie': case 'doughnut': case 'polar': {
        type = t === 'polar' ? 'polarArea' : t; kind = 'arc'; interactionMode = 'nearest';
        const s = series[0];
        let items = labels.map((l, k) => ({ l, v: s.values[k], k })).filter(d => d.v != null && (t === 'polar' ? true : d.v > 0));
        if (!items.length) return { error: 'This series has no positive values to show as slices.' };
        if (items.length > 8) {
          const top = [...items].sort((a, b) => b.v - a.v).slice(0, 7);
          const keep = new Set(top.map(d => d.k));
          const other = items.filter(d => !keep.has(d.k)).reduce((sum, d) => sum + d.v, 0);
          items = items.filter(d => keep.has(d.k));
          items.push({ l: 'Other', v: other, k: -1 });
        }
        dataLabels = items.map(d => d.l);
        const colors = items.map((d, k) => (d.k === -1 ? EXTRA : PALETTE[k]));
        datasets = [{
          label: s.name, data: items.map(d => d.v),
          backgroundColor: t === 'polar' ? colors.map(c => alpha(c, 0.85)) : colors,
          hoverBackgroundColor: colors,
          borderColor: '#ffffff', borderWidth: 2, hoverOffset: t === 'polar' ? 0 : 6,
        }];
        legendCount = items.length;
        if (t === 'polar') {
          scales = { r: { grid: { color: INK.grid }, angleLines: { color: INK.grid }, ticks: { color: INK.muted, backdropColor: 'transparent', callback: v => fmtShort(v) }, beginAtZero: true } };
        }
        break;
      }
      case 'radar': {
        type = 'radar'; kind = 'none';
        datasets = series.map(s => ({
          label: s.name, data: s.values, borderColor: s.color, backgroundColor: alpha(s.color, 0.14), borderWidth: 2,
          pointRadius: 3, pointBackgroundColor: s.color, pointBorderColor: '#ffffff', pointHoverRadius: 5,
        }));
        scales = {
          r: {
            grid: { color: INK.grid, display: state.grid }, angleLines: { color: INK.grid },
            pointLabels: { color: INK.secondary, font: { size: 12 } },
            ticks: { color: INK.muted, backdropColor: 'transparent', callback: v => fmtShort(v) },
            beginAtZero: state.beginZero,
          },
        };
        break;
      }
      case 'histogram': {
        type = 'bar'; kind = 'bar';
        const all = series.flatMap(s => s.values.filter(v => v != null));
        if (!all.length) return { error: 'No numbers to count.' };
        const n = Math.max(2, Math.min(100, Math.round(state.bins) || 10));
        let min = Math.min(...all), max = Math.max(...all);
        if (min === max) { min -= 0.5; max += 0.5; }
        const w = (max - min) / n;
        dataLabels = Array.from({ length: n }, (_, k) => `${fmtShort(min + k * w)}–${fmtShort(min + (k + 1) * w)}`);
        datasets = series.map(s => {
          const counts = new Array(n).fill(0);
          s.values.forEach(v => { if (v == null) return; counts[Math.min(n - 1, Math.floor((v - min) / w))]++; });
          return Object.assign(barBase(s.color), {
            label: s.name, data: counts, categoryPercentage: 1, barPercentage: 1, maxBarThickness: undefined,
            borderColor: '#ffffff', borderWidth: { left: 1, right: 1 }, borderSkipped: 'start',
          });
        });
        scales = { x: axis(xT || (series.length === 1 ? series[0].name : ''), { grid: false }), y: axis(yT || 'Count', { beginZero: true }) };
        break;
      }
    }

    // legend
    const isArc = kind === 'arc';
    let legendPos = state.legend;
    let legendShow = legendPos !== 'none' && (legendPos !== 'auto' || isArc || legendCount >= 2);
    if (legendPos === 'auto') legendPos = isArc && state.width > state.height * 1.15 ? 'right' : isArc ? 'bottom' : 'top';

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      indexAxis,
      layout: { padding: 24 },
      interaction: { mode: interactionMode, intersect: interactionMode === 'nearest' && kind !== 'line' ? true : false, axis: indexAxis === 'y' ? 'y' : 'x' },
      scales,
      plugins: {
        bg: { color: INK.surface },
        values: { show: state.showValues, kind: t === 'combo' ? 'bar' : kind },
        title: {
          display: !!state.title, text: state.title, align: 'start', color: INK.primary,
          font: { size: 18, weight: '600' }, padding: { top: 0, bottom: state.subtitle ? 4 : 18 },
        },
        subtitle: {
          display: !!state.subtitle, text: state.subtitle, align: 'start', color: INK.secondary,
          font: { size: 13 }, padding: { bottom: 18 },
        },
        legend: {
          display: legendShow, position: legendPos, align: legendPos === 'top' || legendPos === 'bottom' ? 'start' : 'center',
          labels: { color: INK.secondary, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: 'rgba(26, 26, 25, 0.94)', titleColor: '#f0efec', bodyColor: '#e4e3dc',
          padding: 10, cornerRadius: 6, boxPadding: 4, usePointStyle: true,
          titleFont: { weight: '600' },
          callbacks: {
            label(ctx) {
              const raw = ctx.raw;
              const name = ctx.dataset.label || '';
              if (t === 'bubble') return `${raw.label ? raw.label + ': ' : ''}(${fmt(raw.x)}, ${fmt(raw.y)})${raw.size != null ? ` · size ${fmt(raw.size)}` : ''}`;
              if (t === 'scatter') return `${name}: (${fmt(raw.x)}, ${fmt(raw.y)})${raw.label && !columns[state.labelCol]?.numeric ? ' · ' + raw.label : ''}`;
              if (isArc) {
                const total = ctx.dataset.data.reduce((s, v) => s + Math.abs(v || 0), 0);
                return `${ctx.label}: ${fmt(raw)} (${total ? ((Math.abs(raw) / total) * 100).toFixed(1) : 0}%)`;
              }
              const v = typeof raw === 'object' && raw ? raw.y : raw;
              return `${name}: ${fmt(v)}`;
            },
            title(items) {
              if (t === 'scatter' || t === 'bubble' || isArc) return '';
              return items.length ? items[0].label : '';
            },
          },
        },
      },
    };
    if (type === 'doughnut') options.cutout = '62%';
    if (isArc || type === 'radar') options.interaction = { mode: 'nearest', intersect: true };

    return { config: { type, data: { labels: dataLabels, datasets }, options, plugins: [bgPlugin, valuesPlugin] } };
  }

  // ------------------------------------------------------------------- render
  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; renderNow(); });
  }

  // keepTable: skip rebuilding the table (used while a cell is being edited)
  function renderNow(keepTable = false) {
    if (state && !doc.charts.includes(state)) state = null;
    if (state) {
      buildColumns(keepTable);
      syncControls();
      if (!keepTable) renderPreview();
      renderSeries();
    }
    syncCards();
    if (state) drawCard(state);
    syncChrome();
    save();
  }

  // =================================================================== board
  // An infinite sheet. Graphs ("cards") and drawings ("items") live in world space.
  // view = screen offset (x, y) + zoom (z).  screen = world * z + offset
  const hadView = !!doc.view;
  const view = doc.view || { x: 0, y: 0, z: 1 };
  doc.view = view;
  const cards = new Map();       // chart id -> { el, canvas, empty, chart, sig }
  const itemEls = new Map();     // item id -> element
  let sel = null;                // { kind: 'chart' | 'item', id }
  let tool = 'select';
  let tableFor = null;           // id of the graph whose table is expanded
  let styleOpen = false;         // style drawer open for the selected graph
  let menuFor = null;            // id of the graph whose ⋯ menu is open
  let editingText = null;        // id of the text item being typed into

  const DRAW_TOOLS = ['pen', 'rect', 'ellipse', 'arrow', 'line'];
  const INK_COLORS = ['#1e1e1e', '#e34948', '#2a78d6', '#1baf7a', '#eda100', '#6250d6', '#e87ba4', '#898781'];
  const ICON_MORE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>';
  const chartName = c => (c.title || '').trim() || `Graph ${doc.charts.indexOf(c) + 1}`;
  const byId = id => doc.charts.find(c => c.id === id);
  const itemById = id => doc.items.find(it => it.id === id);
  const topZ = () => Math.max(0, ...doc.charts.map(c => c.z || 0), ...doc.items.map(it => it.z || 0));
  const bottomZ = () => Math.min(1, ...doc.charts.map(c => c.z || 0), ...doc.items.map(it => it.z || 0));
  const selChart = () => (sel && sel.kind === 'chart' ? byId(sel.id) : null);
  const selItem = () => (sel && sel.kind === 'item' ? itemById(sel.id) : null);

  // ---------------------------------------------------------------- graphs
  function cardFor(c) {
    let k = cards.get(c.id);
    if (k) return k;
    const node = document.createElement('div');
    node.className = 'card';
    node.dataset.id = c.id;
    node.innerHTML = `
      <div class="card-label"></div>
      <div class="card-body">
        <canvas role="img"></canvas>
        <div class="empty" hidden>
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M8 4h8M9 4v1.5M15 4v1.5M6 6.5h12a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1zM9 11h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <strong class="e-title"></strong>
          <span class="e-text"></span>
          <div class="row e-actions">
            <button class="btn primary" type="button" data-act="table">Open table</button>
            <button class="btn" type="button" data-act="sample">Try sample data</button>
          </div>
        </div>
      </div>
      <button type="button" class="card-more" data-act="more" title="Graph options" aria-label="Graph options" aria-haspopup="menu">${ICON_MORE}</button>
      ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(d => `<div class="h h-${d}" data-dir="${d}"></div>`).join('')}`;
    el.world.appendChild(node);
    k = { el: node, canvas: node.querySelector('canvas'), empty: node.querySelector('.empty'), chart: null, sig: null };
    cards.set(c.id, k);
    return k;
  }

  function positionCard(c) {
    const k = cardFor(c);
    const s = k.el.style;
    s.left = c.x + 'px'; s.top = c.y + 'px';
    s.width = c.width + 'px'; s.height = c.height + 'px';
    s.zIndex = c.id === tableFor ? 900000 : c.z;
    k.el.classList.toggle('selected', !!sel && sel.kind === 'chart' && sel.id === c.id);
    k.el.classList.toggle('menu-open', menuFor === c.id);
    k.el.classList.toggle('transparent', c.bg === 'transparent');
    k.el.querySelector('.card-label').textContent = chartName(c);
    k.canvas.setAttribute('aria-label', chartName(c));
  }

  function syncCards() {
    const ids = new Set(doc.charts.map(c => c.id));
    for (const [id, k] of cards) {
      if (!ids.has(id)) { if (k.chart) k.chart.destroy(); k.el.remove(); cards.delete(id); }
    }
    doc.charts.forEach(positionCard);
    placeTable();
  }

  // Draw one graph into its card. Other graphs are drawn by temporarily making them current.
  function drawCard(c, force = false) {
    const k = cardFor(c);
    const { x, y, z, ...rest } = c;
    const sig = JSON.stringify(rest);
    if (!force && sig === k.sig && (k.chart || !k.empty.hidden)) return;
    k.sig = sig;
    const saved = [state, columns, matrix];
    let message = null, built = null;
    try {
      if (c !== state) { state = c; buildColumns(); }
      if (!columns.length) message = ['This graph has no data yet', 'Open the table and paste cells from Excel, Google Sheets or Numbers.', true];
      else if (!columns.some(col => col.numeric)) message = ['No numbers found', 'At least one column needs numeric values. Open the table and check “First row is headers” / “Series in rows”.', false];
      if (!message) {
        built = buildConfig();
        if (built.error) message = ['Nothing to plot yet', built.error, false];
      }
    } finally {
      [state, columns, matrix] = saved;
    }
    if (k.chart) { k.chart.destroy(); k.chart = null; }
    k.empty.hidden = !message;
    k.plottable = !message;
    if (message) {
      k.empty.querySelector('.e-title').textContent = message[0];
      k.empty.querySelector('.e-text').innerHTML = message[1];
      k.empty.querySelector('[data-act="sample"]').hidden = !message[2];
      return;
    }
    built.config.options.devicePixelRatio = pixelRatio();
    k.chart = new Chart(k.canvas, built.config);
  }

  // Everything outside the graphs that depends on the selection.
  function syncChrome() {
    el.welcome.hidden = doc.charts.length > 0 || doc.items.length > 0;
    const showStyle = styleOpen && state && selChart() === state;
    el.drawer.hidden = !showStyle;
    if (showStyle) el.styleTitle.textContent = chartName(state);
    const k = state && cards.get(state.id);
    el.png.disabled = el.pdf.disabled = !(k && k.plottable);
    syncProps();
    syncSelBox();
  }

  // ---- the expandable table (one panel, attached under the selected graph)
  function placeTable() {
    const open = tableFor && state && byId(tableFor) === state && selChart() === state;
    if (!open) tableFor = null;
    if (open) {
      const host = cardFor(state).el;
      if (el.panel.parentNode !== host) host.appendChild(el.panel);
      el.panel.hidden = false;
      // keep the panel readable at any zoom: undo the board zoom, anchored to the graph's bottom-left
      el.panel.style.transform = `scale(${1 / view.z})`;
      el.panel.style.transformOrigin = '0 0';
      const room = Math.max(260, el.area.clientWidth - 90);
      el.panel.style.width = Math.min(room, Math.max(440, Math.min(760, state.width * view.z))) + 'px';
      el.panel.style.marginTop = 14 / view.z + 'px';
    } else if (!el.panel.hidden) {
      el.panel.hidden = true;
      document.body.appendChild(el.panel);
    }
  }

  function openTable(c, show = true) {
    selectChart(c);
    tableFor = show ? c.id : null;
    renderNow();
    if (show) {
      showRaw(!columns.length);
      bringIntoView(c, true);
      if (!columns.length) el.data.focus({ preventScroll: true });
    }
  }

  let rawMode = false;
  function showRaw(on) { rawMode = on; syncTableZones(); }
  function syncTableZones() {
    const has = columns.length > 0;
    $('#paste-zone').hidden = has && !rawMode;
    $('#grid-zone').hidden = !has;
    $('#raw-toggle').hidden = !has;
    $('#raw-toggle').textContent = rawMode ? 'Hide text' : 'Edit as text';
  }

  function openStyle(c) {
    selectChart(c);
    styleOpen = true;
    renderNow();
    // keep the graph visible beside the drawer
    const aw = el.area.clientWidth - (window.innerWidth > 640 ? 360 : 0);
    const sx = c.x * view.z + view.x, ex = (c.x + c.width) * view.z + view.x;
    if (ex > aw - 20 || sx < 80) {
      view.x = (aw + 70) / 2 - (c.x + c.width / 2) * view.z;
      if (c.width * view.z > aw - 100) zoomAt((aw - 100) / (c.width * view.z), (aw + 70) / 2, el.area.clientHeight / 2);
      else applyView();
    }
  }

  // ---- selection
  function selectChart(c) {
    if (editingText) finishText();
    const changed = state !== c;
    if (changed && tableFor !== c.id) tableFor = null;
    state = c;
    sel = { kind: 'chart', id: c.id };
    c.z = Math.max(c.z || 0, topZ());
    if (changed) { el.data.value = state.raw; rawMode = false; }
  }
  function selectItem(it) {
    sel = { kind: 'item', id: it.id };
    tableFor = null;
    styleOpen = false;
  }
  function deselect() {
    if (editingText) finishText();
    sel = null;
    tableFor = null;
    styleOpen = false;
    renderNow();
  }

  // ---- adding, duplicating, deleting graphs
  const overlaps = (a, b, gap = 40) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap + 40 && b.y < a.y + a.height + gap + 40;

  function freeSpot(w, h) {
    // start in the middle of what's on screen, then slide right until nothing overlaps
    const cx = (el.area.clientWidth / 2 + 30 - view.x) / view.z;
    const cy = (el.area.clientHeight / 2 - view.y) / view.z;
    const spot = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h };
    let guard = 0;
    while (doc.charts.some(c => overlaps(spot, c)) && guard++ < 300) spot.x += 80;
    return spot;
  }

  function addChart(over = {}) {
    const base = state || DEFAULTS;
    const w = over.width || base.width, h = over.height || base.height;
    const spot = freeSpot(w, h);
    // new graphs inherit the last graph's size so a set of graphs matches
    const c = newChart(Object.assign({ width: w, height: h, scale: base.scale, bg: base.bg, x: spot.x, y: spot.y, z: topZ() + 1 }, over));
    doc.charts.push(c);
    selectChart(c);
    renderNow();
    bringIntoView(c);
    return c;
  }

  function duplicateChart(c) {
    const copy = JSON.parse(JSON.stringify(c));
    copy.title = copy.title ? `${copy.title} (copy)` : '';
    copy.x += 40; copy.y += 40;
    const spotOk = !doc.charts.some(o => o.x === copy.x && o.y === copy.y);
    if (!spotOk) { copy.x += 40; copy.y += 40; }
    copy.z = topZ() + 1;
    const n = newChart(copy);
    doc.charts.push(n);
    selectChart(n);
    renderNow();
    bringIntoView(n);
    toast('Graph duplicated — try another chart type');
  }

  function deleteChart(c) {
    if (c.raw.trim() && !confirm(`Delete “${chartName(c)}”? Its table will be removed too.`)) return;
    doc.charts.splice(doc.charts.indexOf(c), 1);
    if (state === c) state = null;
    sel = null; tableFor = null; styleOpen = false;
    renderNow();
    toast('Graph deleted — Ctrl+Z to undo');
  }

  // ---------------------------------------------------------------- drawings
  const SVGNS = 'http://www.w3.org/2000/svg';
  function itemEl(it) {
    let n = itemEls.get(it.id);
    if (n && n.dataset.kind === (it.kind === 'text' ? 'text' : 'shape')) return n;
    if (n) n.remove();
    if (it.kind === 'text') {
      n = document.createElement('div');
      n.className = 'item text-item';
      n.dataset.kind = 'text';
    } else {
      n = document.createElementNS(SVGNS, 'svg');
      n.setAttribute('class', 'item');
      n.dataset.kind = 'shape';
    }
    n.dataset.id = it.id;
    el.world.appendChild(n);
    itemEls.set(it.id, n);
    return n;
  }

  function fillFor(it) {
    if (it.fill === 'soft') return alpha(it.stroke.length === 7 ? it.stroke : '#1e1e1e', 0.18);
    if (it.fill === 'solid') return it.stroke;
    return 'none';
  }

  function penPath(pts) {
    if (pts.length < 2) {
      const [x, y] = pts[0] || [0, 0];
      return `M${x} ${y}l0.01 0`;
    }
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += `Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
    }
    const last = pts[pts.length - 1];
    return d + `L${last[0]} ${last[1]}`;
  }

  function shapeMarkup(it) {
    const w = Math.max(0, it.w), h = Math.max(0, it.h);
    const stroke = `stroke="${it.stroke}" stroke-width="${it.sw}" stroke-linecap="round" stroke-linejoin="round"`;
    const hitW = it.sw + 14;
    let shape = '', hit = '';
    if (it.kind === 'rect') {
      const r = Math.min(10, w / 4, h / 4);
      shape = `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${fillFor(it)}" ${stroke}/>`;
      hit = `<rect class="hit" x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${it.fill === 'none' ? 'none' : 'transparent'}" stroke="transparent" stroke-width="${hitW}"/>`;
    } else if (it.kind === 'ellipse') {
      shape = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fillFor(it)}" ${stroke}/>`;
      hit = `<ellipse class="hit" cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${it.fill === 'none' ? 'none' : 'transparent'}" stroke="transparent" stroke-width="${hitW}"/>`;
    } else if (it.kind === 'line' || it.kind === 'arrow') {
      const [[x1, y1], [x2, y2]] = it.pts;
      shape = `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" ${stroke}/>`;
      if (it.kind === 'arrow') {
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const len = Math.min(Math.hypot(x2 - x1, y2 - y1) * 0.4, Math.max(12, it.sw * 4.5));
        const a1 = ang + Math.PI - 0.5, a2 = ang + Math.PI + 0.5;
        shape += `<path d="M${x2 + len * Math.cos(a1)} ${y2 + len * Math.sin(a1)}L${x2} ${y2}L${x2 + len * Math.cos(a2)} ${y2 + len * Math.sin(a2)}" fill="none" ${stroke}/>`;
      }
      hit = `<path class="hit" d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="transparent" stroke-width="${hitW}" stroke-linecap="round"/>`;
    } else if (it.kind === 'pen') {
      const d = penPath(it.pts);
      shape = `<path d="${d}" fill="none" ${stroke}/>`;
      hit = `<path class="hit" d="${d}" fill="none" stroke="transparent" stroke-width="${hitW}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return shape + hit;
  }

  function renderItem(it) {
    const n = itemEl(it);
    n.style.left = it.x + 'px';
    n.style.top = it.y + 'px';
    n.style.zIndex = it.z;
    if (it.kind === 'text') {
      n.style.fontSize = it.fs + 'px';
      n.style.color = it.stroke;
      if (editingText !== it.id) n.textContent = it.text;
      return;
    }
    const w = Math.max(1, it.w), h = Math.max(1, it.h);
    n.setAttribute('width', w); n.setAttribute('height', h);
    n.style.width = w + 'px'; n.style.height = h + 'px';
    n.innerHTML = shapeMarkup(it);
  }

  function renderItems() {
    const ids = new Set(doc.items.map(it => it.id));
    for (const [id, n] of itemEls) if (!ids.has(id)) { n.remove(); itemEls.delete(id); }
    doc.items.forEach(renderItem);
    syncSelBox();
  }

  // pen / line / arrow keep their points relative to the item's top-left corner
  function setPoints(it, abs) {
    const xs = abs.map(p => p[0]), ys = abs.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    it.x = minX; it.y = minY;
    it.w = Math.max(...xs) - minX; it.h = Math.max(...ys) - minY;
    it.pts = abs.map(([x, y]) => [+(x - minX).toFixed(1), +(y - minY).toFixed(1)]);
  }

  function itemBox(it) {
    if (it.kind === 'text') {
      const n = itemEls.get(it.id);
      return { x: it.x, y: it.y, w: n ? n.offsetWidth : 40, h: n ? n.offsetHeight : it.fs * 1.3 };
    }
    return { x: it.x, y: it.y, w: it.w, h: it.h };
  }

  function newItem(kind, over = {}) {
    const p = doc.pen;
    const it = Object.assign({ id: uid(), kind, x: 0, y: 0, w: 0, h: 0, stroke: p.stroke, sw: p.sw, fill: p.fill, z: topZ() + 1 }, over);
    if (kind === 'text') Object.assign(it, { text: '', fs: p.fs });
    doc.items.push(it);
    return it;
  }

  function deleteItem(it) {
    doc.items.splice(doc.items.indexOf(it), 1);
    if (sel && sel.id === it.id) sel = null;
    renderItems();
    syncChrome();
    save();
  }

  // selection box for a drawing
  let selBoxEl = null;
  function syncSelBox() {
    const it = selItem();
    if (!it || editingText === it.id) { if (selBoxEl) selBoxEl.hidden = true; return; }
    if (!selBoxEl) {
      selBoxEl = document.createElement('div');
      selBoxEl.className = 'selbox';
      selBoxEl.innerHTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(d => `<div class="h h-${d}" data-dir="${d}"></div>`).join('');
      el.world.appendChild(selBoxEl);
    }
    const b = itemBox(it);
    const pad = it.kind === 'text' ? 0 : it.sw / 2;
    Object.assign(selBoxEl.style, { left: b.x - pad + 'px', top: b.y - pad + 'px', width: b.w + pad * 2 + 'px', height: b.h + pad * 2 + 'px' });
    selBoxEl.classList.toggle('no-handles', it.kind === 'text');
    selBoxEl.hidden = false;
  }

  // ---- text
  function startText(it) {
    editingText = it.id;
    sel = { kind: 'item', id: it.id };
    const n = itemEl(it);
    renderItem(it);
    n.contentEditable = 'true';
    n.spellcheck = false;
    syncChrome();
    setTimeout(() => {
      n.focus();
      const r = document.createRange();
      r.selectNodeContents(n);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
    }, 0);
  }
  function finishText() {
    const it = itemById(editingText);
    const n = itemEls.get(editingText);
    editingText = null;
    if (!it || !n) return;
    n.contentEditable = 'false';
    it.text = n.innerText.replace(/\n$/, '');
    if (!it.text.trim()) { deleteItem(it); return; }
    renderItem(it);
    syncChrome();
    save();
  }

  // ---- drawing properties panel
  el.props.querySelector('#prop-stroke').innerHTML = INK_COLORS.map(c => `<button type="button" class="swatch" data-v="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="false"></button>`).join('');
  function propContext() {
    const it = selItem();
    if (it) return it.kind;
    if (DRAW_TOOLS.includes(tool) || tool === 'text') return tool;
    return null;
  }
  function syncProps() {
    const kind = propContext();
    el.props.hidden = !kind;
    if (!kind) return;
    const src = selItem() || doc.pen;
    const show = {
      stroke: true,
      sw: kind !== 'text',
      fill: kind === 'rect' || kind === 'ellipse',
      fs: kind === 'text',
      actions: !!selItem(),
    };
    el.props.querySelectorAll('.prop-row').forEach(r => { r.hidden = !show[r.dataset.prop]; });
    const mark = (id, v) => el.props.querySelectorAll(`#${id} [data-v]`).forEach(b => b.setAttribute('aria-pressed', String(String(b.dataset.v) === String(v))));
    mark('prop-stroke', src.stroke);
    mark('prop-sw', src.sw);
    mark('prop-fill', src.fill);
    mark('prop-fs', src.fs);
  }
  el.props.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const it = selItem();
    if (b.id === 'prop-del') { if (it) deleteItem(it); return; }
    if (b.id === 'prop-front') { if (it) { it.z = topZ() + 1; renderItem(it); save(); } return; }
    if (b.id === 'prop-back') { if (it) { it.z = bottomZ() - 1; renderItem(it); save(); } return; }
    const row = b.closest('[id^="prop-"]');
    if (!row || b.dataset.v == null) return;
    const key = { 'prop-stroke': 'stroke', 'prop-sw': 'sw', 'prop-fill': 'fill', 'prop-fs': 'fs' }[row.id];
    const v = key === 'sw' || key === 'fs' ? Number(b.dataset.v) : b.dataset.v;
    doc.pen[key] = v;
    if (it && key in it) { it[key] = v; renderItem(it); }
    syncProps(); syncSelBox(); save();
  });

  // ---- tools
  function setTool(t) {
    if (editingText) finishText();
    tool = t;
    document.querySelectorAll('.rail [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    el.area.className = 'canvas-area t-' + t + (DRAW_TOOLS.includes(t) ? ' drawing' : '');
    if (t !== 'select' && sel) { sel = null; tableFor = null; styleOpen = false; renderNow(); }
    closeMenu();
    syncChrome();
  }
  document.querySelector('.rail').addEventListener('click', e => {
    const b = e.target.closest('[data-tool]');
    if (b) { setTool(b.dataset.tool); b.blur(); }
  });

  // ---------------------------------------------------------------- view
  let dprTimer;
  const pixelRatio = () => Math.min(4, (window.devicePixelRatio || 1) * Math.max(1, view.z));
  function applyView() {
    el.world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    el.world.style.setProperty('--z', view.z);
    const g = 20 * view.z;
    el.area.style.backgroundSize = `${g}px ${g}px`;
    el.area.style.backgroundPosition = `${view.x}px ${view.y}px`;
    el.zoomPct.textContent = Math.round(view.z * 100) + '%';
    placeTable();
    closeMenu();
    // re-render graphs sharply after zooming in
    clearTimeout(dprTimer);
    dprTimer = setTimeout(() => {
      const r = pixelRatio();
      for (const k of cards.values()) {
        if (k.chart && k.chart.options.devicePixelRatio !== r) { k.chart.options.devicePixelRatio = r; k.chart.resize(); }
      }
    }, 180);
    save();
  }

  function zoomAt(factor, sx, sy) {
    const nz = Math.min(4, Math.max(0.1, view.z * factor));
    view.x = sx - ((sx - view.x) / view.z) * nz;
    view.y = sy - ((sy - view.y) / view.z) * nz;
    view.z = nz;
    applyView();
  }
  const areaCenter = () => [el.area.clientWidth / 2, el.area.clientHeight / 2];
  const toWorld = (cx, cy) => {
    const r = el.area.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z];
  };

  function fitAll() {
    const boxes = [
      ...doc.charts.map(c => ({ x: c.x, y: c.y - 40, w: c.width, h: c.height + 40 })),
      ...doc.items.map(itemBox),
    ];
    if (!boxes.length || !el.area.clientWidth) { view.x = el.area.clientWidth / 2; view.y = el.area.clientHeight / 2; view.z = 1; applyView(); return; }
    const minX = Math.min(...boxes.map(b => b.x)), minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w)), maxY = Math.max(...boxes.map(b => b.y + b.h));
    const padL = 90, pad = 50;
    const aw = el.area.clientWidth - padL - pad, ah = el.area.clientHeight - pad * 2 - 30;
    const z = Math.max(0.1, Math.min(1, aw / Math.max(1, maxX - minX), ah / Math.max(1, maxY - minY)));
    view.z = z;
    view.x = padL + aw / 2 - ((minX + maxX) / 2) * z;
    view.y = pad + ah / 2 - ((minY + maxY) / 2) * z;
    applyView();
  }

  // Pan (and zoom out if needed) so a graph is on screen. withTable: leave room for its table below.
  function bringIntoView(c, withTable = false) {
    const aw = el.area.clientWidth, ah = el.area.clientHeight;
    if (!aw) return;
    const padL = 90, pad = 50;
    const tableH = withTable ? Math.min(380, ah * 0.5) : 0;
    let z = view.z;
    const fitZ = Math.min((aw - padL - pad) / c.width, Math.max(ah * 0.4, ah - pad * 2 - 40 - tableH) / c.height);
    if (fitZ < z) z = Math.max(0.15, fitZ);
    const sx = c.x * z + view.x, sy = (c.y - 40 / z) * z + view.y;
    const ex = (c.x + c.width) * z + view.x, ey = (c.y + c.height) * z + view.y + tableH;
    const inside = z === view.z && sx >= padL && sy >= pad && ex <= aw - pad && ey <= ah - pad;
    if (inside) return;
    view.z = z;
    view.x = padL + (aw - padL) / 2 - (c.x + c.width / 2) * z;
    view.y = withTable ? pad + 40 - c.y * z : ah / 2 - (c.y + c.height / 2) * z;
    applyView();
  }

  // ---------------------------------------------------------- pointer input
  const pointers = new Map();
  // capture can fail (pointer already gone); that's harmless
  const capture = id => { try { el.area.setPointerCapture(id); } catch { /* ignore */ } };
  let gesture = null;
  let spaceDown = false;

  el.area.addEventListener('pointerdown', e => {
    if (e.target.closest('.table-panel')) return;          // the table behaves like a normal page
    if (editingText && e.target.closest('.text-item') && e.target.closest('.text-item').dataset.id === editingText) return;
    if (e.button === 2) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {                             // two fingers: pinch zoom
      if (gesture && gesture.item && gesture.kind === 'create') { deleteItem(gesture.item); }
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (e.target.closest('button')) return;                // card buttons (⋯, empty-state actions)
    closeMenu();
    if (editingText) finishText();
    const [wx, wy] = toWorld(e.clientX, e.clientY);

    // pan: hand tool, Space, middle button
    if (e.button === 1 || spaceDown || tool === 'hand') { startPan(e); return; }

    if (tool === 'eraser') {
      e.preventDefault();
      capture(e.pointerId);
      gesture = { kind: 'erase' };
      eraseAt(e.clientX, e.clientY);
      return;
    }

    if (DRAW_TOOLS.includes(tool)) {
      e.preventDefault();
      capture(e.pointerId);
      const it = newItem(tool);
      if (tool === 'pen') setPoints(it, [[wx, wy]]);
      else if (tool === 'line' || tool === 'arrow') setPoints(it, [[wx, wy], [wx, wy]]);
      else Object.assign(it, { x: wx, y: wy, w: 0, h: 0 });
      renderItem(it);
      gesture = { kind: 'create', item: it, sx: wx, sy: wy, abs: [[wx, wy]] };
      return;
    }

    if (tool === 'text') {
      e.preventDefault();
      const it = newItem('text', { x: wx, y: wy - doc.pen.fs * 0.7 });
      setTool('select');
      startText(it);
      return;
    }

    // ---- select tool
    const selHandle = e.target.closest('.selbox .h');
    if (selHandle) {
      e.preventDefault();
      capture(e.pointerId);
      const it = selItem();
      gesture = { kind: 'resize-item', dir: selHandle.dataset.dir, item: it, sx: e.clientX, sy: e.clientY, x0: it.x, y0: it.y, w0: it.w, h0: it.h, pts0: it.pts && it.pts.map(p => p.slice()), moved: false };
      return;
    }
    const itemNode = e.target.closest('.item');
    if (itemNode) {
      const it = itemById(itemNode.dataset.id);
      if (it) {
        e.preventDefault();
        selectItem(it);
        renderNow();
        gesture = { kind: 'move-item', item: it, sx: e.clientX, sy: e.clientY, x0: it.x, y0: it.y, moved: false };
        return;
      }
    }
    const cardEl = e.target.closest('.card');
    if (cardEl) {
      const c = byId(cardEl.dataset.id);
      if (!c) return;
      if (selChart() !== c) { selectChart(c); renderNow(); }
      const handle = e.target.closest('.h');
      gesture = {
        kind: handle ? 'resize' : 'move', dir: handle && handle.dataset.dir, c,
        sx: e.clientX, sy: e.clientY, x0: c.x, y0: c.y, w0: c.width, h0: c.height, moved: false,
      };
      if (handle) { e.preventDefault(); capture(e.pointerId); }
      return;
    }
    // empty sheet: deselect and pan
    if (sel || styleOpen) deselect();
    startPan(e);
  });

  function startPan(e) {
    e.preventDefault();
    capture(e.pointerId);
    gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    el.area.classList.add('panning');
    if (document.activeElement && document.activeElement !== document.body && !el.panel.contains(document.activeElement)) document.activeElement.blur();
  }

  function eraseAt(cx, cy) {
    for (const n of document.elementsFromPoint(cx, cy)) {
      const node = n.closest && n.closest('.item');
      if (node) {
        const it = itemById(node.dataset.id);
        if (it) { doc.items.splice(doc.items.indexOf(it), 1); renderItems(); gesture.erased = true; }
        return;
      }
    }
  }

  el.area.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = el.area.getBoundingClientRect();
      view.x += cx - gesture.cx; view.y += cy - gesture.cy;
      zoomAt(d / gesture.d, cx - r.left, cy - r.top);
      Object.assign(gesture, { d, cx, cy });
      return;
    }
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    const z = view.z;
    switch (gesture.kind) {
      case 'pan':
        view.x = gesture.vx + dx; view.y = gesture.vy + dy;
        applyView();
        return;
      case 'erase':
        eraseAt(e.clientX, e.clientY);
        return;
      case 'create': {
        const it = gesture.item;
        const [wx, wy] = toWorld(e.clientX, e.clientY);
        if (it.kind === 'pen') {
          const last = gesture.abs[gesture.abs.length - 1];
          if (Math.hypot(wx - last[0], wy - last[1]) * z < 2) return;
          gesture.abs.push([wx, wy]);
          setPoints(it, gesture.abs);
        } else if (it.kind === 'line' || it.kind === 'arrow') {
          let ex = wx, ey = wy;
          if (e.shiftKey) { // snap to 15°
            const ang = Math.round(Math.atan2(wy - gesture.sy, wx - gesture.sx) / (Math.PI / 12)) * (Math.PI / 12);
            const len = Math.hypot(wx - gesture.sx, wy - gesture.sy);
            ex = gesture.sx + len * Math.cos(ang); ey = gesture.sy + len * Math.sin(ang);
          }
          setPoints(it, [[gesture.sx, gesture.sy], [ex, ey]]); // keeps start → end order for the arrow head
        } else {
          let w = wx - gesture.sx, h = wy - gesture.sy;
          if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          Object.assign(it, { x: Math.min(gesture.sx, gesture.sx + w), y: Math.min(gesture.sy, gesture.sy + h), w: Math.abs(w), h: Math.abs(h) });
        }
        renderItem(it);
        return;
      }
    }
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < 4) return;                  // a click, not a drag (keeps legend clicks working)
      gesture.moved = true;
      capture(e.pointerId);
      const k = gesture.c && cards.get(gesture.c.id);
      if (k && k.chart) k.chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
    }
    if (gesture.kind === 'move-item') {
      const it = gesture.item;
      it.x = Math.round(gesture.x0 + dx / z);
      it.y = Math.round(gesture.y0 + dy / z);
      renderItem(it); syncSelBox();
      return;
    }
    if (gesture.kind === 'resize-item') {
      const it = gesture.item, b = resizeBox(gesture, dx / z, dy / z, e.shiftKey, 4);
      if (it.pts) {
        const sx = gesture.w0 ? b.w / gesture.w0 : 1, sy = gesture.h0 ? b.h / gesture.h0 : 1;
        it.pts = gesture.pts0.map(([px, py]) => [px * sx, py * sy]);
      }
      Object.assign(it, { x: b.x, y: b.y, w: b.w, h: b.h });
      renderItem(it); syncSelBox();
      return;
    }
    const c = gesture.c;
    if (gesture.kind === 'move') {
      c.x = Math.round(gesture.x0 + dx / z);
      c.y = Math.round(gesture.y0 + dy / z);
    } else {
      const b = resizeBox(gesture, dx / z, dy / z, e.shiftKey, 200, 4000);
      Object.assign(c, { x: b.x, y: b.y, width: b.w, height: b.h });
      el.w.value = b.w; el.h.value = b.h;
    }
    positionCard(c);
    placeTable();
  });

  // shared resize math for graphs and drawings
  function resizeBox(g, dx, dy, keepShape, min, max = 1e6) {
    const d = g.dir;
    let x = g.x0, y = g.y0, w = g.w0, h = g.h0;
    if (d.includes('e')) w = g.w0 + dx;
    if (d.includes('s')) h = g.h0 + dy;
    if (d.includes('w')) w = g.w0 - dx;
    if (d.includes('n')) h = g.h0 - dy;
    if (keepShape && d.length === 2 && g.w0 && g.h0) {
      const r = g.w0 / g.h0;
      if (Math.abs(w / g.w0) > Math.abs(h / g.h0)) h = w / r; else w = h * r;
    }
    const clamp = v => Math.max(min, Math.min(max, Math.round(v)));
    w = g.w0 ? clamp(w) : 0; h = g.h0 ? clamp(h) : 0;
    if (d.includes('w')) x = g.x0 + g.w0 - w;
    if (d.includes('n')) y = g.y0 + g.h0 - h;
    return { x: Math.round(x), y: Math.round(y), w, h };
  }

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!gesture) return;
    const g = gesture;
    if (g.kind === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    gesture = null;
    if (g.kind === 'pan') { el.area.classList.remove('panning'); return; }
    if (g.kind === 'erase') { if (g.erased) save(); return; }
    if (g.kind === 'create') {
      const it = g.item;
      const tiny = it.kind !== 'pen' && Math.hypot(it.w, it.h) * view.z < 4;
      if (tiny) { deleteItem(it); return; }
      if (it.kind !== 'pen') { setTool('select'); selectItem(it); renderNow(); }
      else save();
      return;
    }
    if (g.kind === 'resize' && g.moved) { setSize(g.c.width, g.c.height); return; }
    if (g.moved) save();
  }
  el.area.addEventListener('pointerup', endPointer);
  el.area.addEventListener('pointercancel', endPointer);

  el.area.addEventListener('wheel', e => {
    const inTable = e.target.closest('.table-panel');
    if (inTable && !(e.ctrlKey || e.metaKey)) return;     // scroll the table itself
    e.preventDefault();
    const r = el.area.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const step = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(Math.exp(-step * 0.0018), e.clientX - r.left, e.clientY - r.top);
    } else {
      const f = e.deltaMode === 1 ? 33 : 1;
      view.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f;
      view.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * f;
      applyView();
    }
  }, { passive: false });

  // buttons inside graphs: ⋯ / open table / sample
  el.world.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const c = byId(b.closest('.card').dataset.id);
    if (!c) return;
    const act = b.dataset.act;
    if (act === 'more') { menuFor === c.id ? closeMenu() : openMenu(c, b); }
    else if (act === 'table') openTable(c);
    else if (act === 'sample') { selectChart(c); loadSample(); }
  });
  el.world.addEventListener('dblclick', e => {
    if (tool !== 'select' || e.target.closest('.table-panel, button')) return;
    const textNode = e.target.closest('.text-item');
    if (textNode) { const it = itemById(textNode.dataset.id); if (it) startText(it); return; }
    if (e.target.closest('.item')) return;
    const cardEl = e.target.closest('.card');
    if (cardEl) openTable(byId(cardEl.dataset.id));
  });
  el.area.addEventListener('dblclick', e => {
    // double-click on empty sheet: add a text label there
    if (tool !== 'select' || e.target !== el.area && e.target !== el.world) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    startText(newItem('text', { x: wx, y: wy - doc.pen.fs * 0.7 }));
  });
  el.world.addEventListener('keydown', e => {
    if (!e.target.classList.contains('text-item')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
  });
  el.world.addEventListener('focusout', e => {
    if (e.target.classList && e.target.classList.contains('text-item') && editingText === e.target.dataset.id) finishText();
  });

  // ---------------------------------------------------------------- ⋯ menu
  function openMenu(c, btn) {
    menuFor = c.id;
    if (selChart() !== c) selectChart(c);
    renderNow();
    el.menu.hidden = false;
    const r = btn.getBoundingClientRect();
    const mw = el.menu.offsetWidth, mh = el.menu.offsetHeight;
    let left = r.right - mw, top = r.bottom + 6;
    if (left < 8) left = 8;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    el.menu.style.left = left + 'px';
    el.menu.style.top = top + 'px';
    el.menu.querySelector('button').focus({ preventScroll: true });
  }
  function closeMenu() {
    if (!menuFor) return;
    const c = byId(menuFor);
    menuFor = null;
    el.menu.hidden = true;
    if (c) positionCard(c);
  }
  el.menu.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    const c = byId(menuFor);
    closeMenu();
    if (!c) return;
    switch (b.dataset.cmd) {
      case 'style': openStyle(c); break;
      case 'table': openTable(c); break;
      case 'dup': duplicateChart(c); break;
      case 'front': c.z = topZ() + 1; positionCard(c); save(); break;
      case 'png': selectChart(c); renderNow(); exportPng(); break;
      case 'pdf': selectChart(c); renderNow(); exportPdf(); break;
      case 'del': deleteChart(c); break;
    }
  });
  el.menu.addEventListener('keydown', e => {
    const items = [...el.menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', e => {
    if (menuFor && !e.target.closest('#card-menu, .card-more')) closeMenu();
  }, true);

  $('#style-close').addEventListener('click', () => { styleOpen = false; renderNow(); });
  $('#tp-close').addEventListener('click', () => { tableFor = null; renderNow(); });
  $('#raw-toggle').addEventListener('click', () => showRaw(!rawMode));

  // ---------------------------------------------------------- + dialog
  function openAddDialog() {
    if (editingText) finishText();
    closeMenu();
    el.modal.hidden = false;
    el.addText.value = '';
    updateAddStatus();
    setTimeout(() => el.addText.focus(), 0);
  }
  function closeAddDialog() { el.modal.hidden = true; }
  function updateAddStatus() {
    const text = el.addText.value;
    let rows = parseTable(text);
    const ok = rows.length > 0;
    el.addCreate.disabled = !ok;
    if (!text.trim()) { el.addStatus.textContent = ''; el.addStatus.classList.remove('error'); return; }
    const head = detectHeader(rows);
    const body = head ? rows.length - 1 : rows.length;
    const nums = ok ? rows[0].filter((_, c) => rows.slice(head ? 1 : 0).some(r => num(r[c]) != null)).length : 0;
    el.addStatus.classList.toggle('error', !ok || !nums);
    el.addStatus.textContent = !ok ? 'Could not read a table from this text.'
      : `${body} row${body === 1 ? '' : 's'} · ${rows[0].length} column${rows[0].length === 1 ? '' : 's'}${nums ? '' : ' · no numbers found yet'}`;
  }
  el.addText.addEventListener('input', updateAddStatus);
  el.addText.addEventListener('paste', e => {
    // turn rich spreadsheet HTML into tab-separated text
    const cd = e.clipboardData;
    const html = cd && cd.getData('text/html');
    const text = cd && cd.getData('text/plain');
    if (html && text && !text.includes('\t')) {
      const t = fromHtmlTable(html);
      if (t) { e.preventDefault(); document.execCommand('insertText', false, t); }
    }
    setTimeout(updateAddStatus, 0);
  });
  el.addText.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !el.addCreate.disabled) el.addCreate.click();
  });
  el.addCreate.addEventListener('click', () => {
    const text = el.addText.value.replace(/\r\n?/g, '\n');
    closeAddDialog();
    setTool('select');
    addTable(text, 'Graph added');
  });
  $('#add-cancel').addEventListener('click', closeAddDialog);
  $('#add-cancel-x').addEventListener('click', closeAddDialog);
  el.modal.addEventListener('pointerdown', e => { if (e.target === el.modal) closeAddDialog(); });
  $('#add-sample').addEventListener('click', () => { el.addText.value = SAMPLE; updateAddStatus(); el.addCreate.focus(); });
  $('#add-empty').addEventListener('click', () => { closeAddDialog(); setTool('select'); const c = addChart(); openTable(c); toast('Type or paste your data into the table'); });
  $('#add-upload').addEventListener('click', () => $('#file').click());
  $('#add-graph').addEventListener('click', openAddDialog);
  $('#welcome-add').addEventListener('click', openAddDialog);
  $('#welcome-sample').addEventListener('click', loadSample);

  // ---------------------------------------------------------- keyboard
  function undo() {
    if (undoAt <= 0) return;
    undoAt--; restore(undoStack[undoAt]);
  }
  function redo() {
    if (undoAt >= undoStack.length - 1) return;
    undoAt++; restore(undoStack[undoAt]);
  }
  function restore(s) {
    if (editingText) { editingText = null; }
    const d = JSON.parse(s);
    const activeId = state && state.id;
    doc.charts = d.charts;
    doc.items = d.items;
    state = byId(activeId) || null;
    if (sel && !(sel.kind === 'chart' ? byId(sel.id) : itemById(sel.id))) sel = null;
    if (tableFor && !byId(tableFor)) tableFor = null;
    if (state) { el.data.value = state.raw; }
    renderItems();
    renderNow();
    doc.charts.forEach(c => drawCard(c));
    updateUndoButtons();
  }
  el.undo.addEventListener('click', undo);
  el.redo.addEventListener('click', redo);

  const TOOL_KEYS = { v: 'select', h: 'hand', p: 'pen', d: 'pen', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', t: 'text', e: 'eraser' };
  document.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.matches('input, select, textarea') || t.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (!el.modal.hidden) { closeAddDialog(); return; }
      if (menuFor) { closeMenu(); return; }
      if (typing && !t.classList.contains('text-item')) { t.blur(); return; }
    }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.2, ...areaCenter()); return; }
    if (mod && e.key === '-') { e.preventDefault(); zoomAt(1 / 1.2, ...areaCenter()); return; }
    if (mod && e.key === '0') { e.preventDefault(); zoomAt(1 / view.z, ...areaCenter()); return; }
    if (typing || !el.modal.hidden) return;
    if (t.closest && t.closest('.drawer, .menu')) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.code === 'Space' && !e.repeat) { spaceDown = true; el.area.classList.add('space'); e.preventDefault(); return; }
    if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); fitAll(); return; }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const c = selChart(), it = selItem();
      if (c) duplicateChart(c);
      else if (it) { const n = JSON.parse(JSON.stringify(it)); n.id = uid(); n.x += 20; n.y += 20; n.z = topZ() + 1; doc.items.push(n); renderItem(n); selectItem(n); renderNow(); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const c = selChart(), it = selItem();
      if (c || it) e.preventDefault();
      if (c) deleteChart(c); else if (it) deleteItem(it);
      return;
    }
    if (e.key === 'Escape') {
      if (tool !== 'select') setTool('select');
      else if (sel || styleOpen) deselect();
      return;
    }
    if (!mod && !e.altKey && (e.key === 'g' || e.key === 'G' || e.key === '+')) { e.preventDefault(); openAddDialog(); return; }
    if (!mod && !e.altKey && TOOL_KEYS[e.key.toLowerCase()] && !e.shiftKey) { setTool(TOOL_KEYS[e.key.toLowerCase()]); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && sel) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const o = selChart() || selItem();
      o.x += arrows[e.key][0] * step; o.y += arrows[e.key][1] * step;
      if (sel.kind === 'chart') positionCard(o); else { renderItem(o); syncSelBox(); }
      save();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceDown = false; el.area.classList.remove('space'); }
  });
  window.addEventListener('blur', () => { spaceDown = false; el.area.classList.remove('space'); });

  $('#zoom-in').addEventListener('click', () => zoomAt(1.2, ...areaCenter()));
  $('#zoom-out').addEventListener('click', () => zoomAt(1 / 1.2, ...areaCenter()));
  $('#zoom-pct').addEventListener('click', () => zoomAt(1 / view.z, ...areaCenter()));
  $('#zoom-fit').addEventListener('click', fitAll);

  function syncControls() {
    el.header.checked = state.header;
    el.transpose.checked = state.transpose;
    document.querySelectorAll('[data-key]').forEach(inp => {
      const v = state[inp.dataset.key];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else if (document.activeElement !== inp) inp.value = v;
    });
    // types
    el.types.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.type === state.type)));
    // x column
    const t = state.type;
    el.xField.hidden = t === 'histogram' || !columns.length;
    el.xLabelText.textContent = t === 'scatter' || t === 'bubble' ? 'X values' : ARC_TYPES.includes(t) ? 'Slice labels' : t === 'radar' ? 'Spoke labels' : t === 'hbar' ? 'Labels (Y axis)' : 'Labels (X axis)';
    el.xCol.innerHTML = columns.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('');
    el.xCol.value = String(state.labelCol);
    el.binsField.hidden = t !== 'histogram';
    el.seriesNote.textContent = columns.length ? seriesNote() : '';
    // smooth only matters for line-ish charts
    const smoothApplies = ['line', 'area', 'stackedArea', 'combo', 'scatter'].includes(t);
    document.querySelector('[data-key="smooth"]').closest('.switch').classList.toggle('disabled', !smoothApplies);
    // size
    if (document.activeElement !== el.w) el.w.value = state.width;
    if (document.activeElement !== el.h) el.h.value = state.height;
    const key = `${state.width}x${state.height}`;
    el.preset.value = [...el.preset.options].some(o => o.value === key) ? key : '';
    // status
    const rows = columns[0]?.raw.length || 0;
    const numCols = columns.filter(c => c.numeric).length;
    if (!state.raw.trim()) { el.status.textContent = ''; el.status.classList.remove('error'); }
    else if (!columns.length) { el.status.textContent = 'Could not read a table from this text.'; el.status.classList.add('error'); }
    else {
      el.status.classList.toggle('error', numCols === 0);
      el.status.textContent = `${rows} row${rows === 1 ? '' : 's'} · ${columns.length} column${columns.length === 1 ? '' : 's'} · ${numCols} numeric`;
    }
    syncTableZones();
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // The editable table. data-r / data-c are coordinates in `matrix`.
  function renderPreview() {
    if (!columns.length) { el.preview.innerHTML = ''; return; }
    const sel = new Set(state.series);
    const off = state.header ? 1 : 0;
    const head = columns.map((c, i) => {
      const sw = sel.has(i) ? `<span class="sw" style="background:${colorFor(i)}"></span>` : '';
      const tag = i === state.labelCol && state.type !== 'histogram' ? '<span class="tag">labels</span>' : '';
      const name = state.header
        ? `<span class="cell" contenteditable="true" spellcheck="false" data-r="0" data-c="${i}">${esc(matrix[0][i])}</span>`
        : esc(c.name);
      return `<th>${sw}${name}${tag}</th>`;
    }).join('');
    const n = columns[0].raw.length;
    const limit = Math.min(n, 500);
    let body = '';
    for (let r = 0; r < limit; r++) {
      body += '<tr>' + columns.map((c, i) => `<td class="${c.numeric ? 'num' : ''}" contenteditable="true" spellcheck="false" data-r="${r + off}" data-c="${i}">${esc(c.raw[r])}</td>`).join('') + '</tr>';
    }
    if (n > limit) body += `<tr><td class="more" colspan="${columns.length}">… ${n - limit} more rows (edit them in the text box above)</td></tr>`;
    el.preview.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  // ------------------------------------------------------------ table editing
  let editTimer;
  el.preview.addEventListener('input', e => {
    const cell = e.target.closest('[data-r]');
    if (!cell) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    if (!matrix[r]) return;
    matrix[r][c] = cell.textContent.replace(/\s+/g, ' ').trim();
    state.raw = serialize();
    el.data.value = state.raw;
    state.headerAuto = false; // don't let header detection flip while editing
    clearTimeout(editTimer);
    // redraw the chart but keep the table DOM (and the caret) intact
    editTimer = setTimeout(() => renderNow(true), 120);
  });
  el.preview.addEventListener('keydown', e => {
    const cell = e.target.closest('[data-r]');
    if (!cell) return;
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      // Enter moves down a row, like a spreadsheet
      const next = e.key === 'Enter' && !e.shiftKey
        ? el.preview.querySelector(`[data-r="${Number(cell.dataset.r) + 1}"][data-c="${cell.dataset.c}"]`)
        : null;
      next ? focusCell(next) : cell.blur();
    }
  });
  el.preview.addEventListener('paste', e => {
    // paste plain text only into a single cell
    const cell = e.target.closest('[data-r]');
    if (!cell) return;
    e.preventDefault();
    e.stopPropagation();
    const text = (e.clipboardData?.getData('text/plain') || '').replace(/[\t\r\n]+/g, ' ').trim();
    document.execCommand('insertText', false, text);
  });
  el.preview.addEventListener('focusout', e => {
    const cell = e.target.closest('[data-r]');
    if (!cell) return;
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-r]');
    const pos = to ? [to.dataset.r, to.dataset.c] : null;
    clearTimeout(editTimer);
    renderNow(); // tidy up: removes cleared rows, refreshes number alignment
    if (pos) {
      const again = el.preview.querySelector(`[data-r="${pos[0]}"][data-c="${pos[1]}"]`);
      if (again) focusCell(again);
    }
  });
  function focusCell(cell) {
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  $('#add-row').addEventListener('click', () => {
    if (!matrix.length) return;
    const width = matrix[0].length;
    const row = new Array(width).fill('');
    const lab = columns[state.labelCol];
    if (lab && !lab.numeric) row[state.labelCol] = `Row ${matrix.length - (state.header ? 1 : 0) + 1}`;
    else row.fill('0');
    matrix.push(row);
    state.raw = serialize();
    el.data.value = state.raw;
    state.headerAuto = false;
    renderNow();
    const cells = el.preview.querySelectorAll(`[data-r="${matrix.length - 1}"]`);
    const target = [...cells].find(c => c.textContent === '' || c.textContent === '0') || cells[0];
    if (target) { target.scrollIntoView({ block: 'nearest' }); focusCell(target); }
  });
  $('#add-col').addEventListener('click', () => {
    if (!matrix.length) return;
    const n = matrix[0].length;
    matrix.forEach((r, k) => r.push(k === 0 && state.header ? `Series ${n}` : '0'));
    state.raw = serialize();
    el.data.value = state.raw;
    state.headerAuto = false;
    renderNow();
    const target = el.preview.querySelector(`[data-r="${state.header ? 0 : 1}"][data-c="${n}"]`);
    if (target) { target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); focusCell(target); }
  });

  function renderSeries() {
    const numeric = columns.map((c, i) => i).filter(i => columns[i].numeric && (i !== state.labelCol || state.type === 'histogram' || !columns.some((c, k) => k !== i && c.numeric)));
    if (!numeric.length) { el.series.innerHTML = '<span class="none">No numeric columns</span>'; return; }
    const sel = new Set(state.series);
    el.series.innerHTML = numeric.map(i => `
      <div class="chip${sel.has(i) ? '' : ' off'}">
        <input type="color" value="${colorFor(i)}" data-color="${i}" aria-label="Color for ${esc(columns[i].name)}">
        <label><input type="checkbox" data-series="${i}"${sel.has(i) ? ' checked' : ''}><span>${esc(columns[i].name)}</span></label>
      </div>`).join('');
  }

  // -------------------------------------------------------------------- size
  function setSize(w, h) {
    if (!state) return;
    state.width = clampSize(w);
    state.height = clampSize(h);
    render();
  }
  const clampSize = v => Math.max(200, Math.min(4000, Math.round(Number(v) || 0)));

  // ------------------------------------------------------------------ export
  function fileName() {
    const base = (state.title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
    return base.slice(0, 60);
  }

  function exportImage(scale, background) {
    const built = buildConfig();
    if (built.error) return null;
    const { width: w, height: h } = state;
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;pointer-events:none`;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    holder.appendChild(cv);
    document.body.appendChild(holder);
    const cfg = built.config;
    cfg.options.responsive = false;
    cfg.options.devicePixelRatio = scale;
    cfg.options.plugins.bg = { color: background };
    const c = new Chart(cv, cfg);
    const url = c.toBase64Image('image/png', 1);
    c.destroy();
    holder.remove();
    return url;
  }

  function download(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.toast.classList.remove('show'), 2200);
  }

  function exportPng() {
    if (!state) return;
    const scale = Number(state.scale) || 2;
    const url = exportImage(scale, state.bg === 'transparent' ? null : '#ffffff');
    if (!url) return;
    download(url, fileName() + '.png');
    toast(`Saved ${fileName()}.png · ${state.width * scale} × ${state.height * scale} px`);
  }

  function exportPdf() {
    if (!state) return;
    if (!window.jspdf) { toast('PDF library failed to load — check your connection.'); return; }
    const url = exportImage(Math.max(2, Number(state.scale) || 2), '#ffffff');
    if (!url) return;
    const { width: w, height: h } = state;
    const pdf = new window.jspdf.jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'], compress: true });
    pdf.addImage(url, 'PNG', 0, 0, w, h, undefined, 'FAST');
    pdf.setProperties({ title: state.title || 'Chart' });
    pdf.save(fileName() + '.pdf');
    toast(`Saved ${fileName()}.pdf`);
  }
  el.png.addEventListener('click', exportPng);
  el.pdf.addEventListener('click', exportPdf);

  // ------------------------------------------------------------------ events
  el.types.innerHTML = TYPES.map(tp => `<button type="button" role="radio" data-type="${tp.id}" aria-checked="false" title="${tp.name}">${svg(tp.icon)}<span>${tp.name}</span></button>`).join('');
  el.types.addEventListener('click', e => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    state.type = b.dataset.type;
    render();
  });
  el.types.addEventListener('keydown', e => {
    const keys = { ArrowRight: 1, ArrowDown: 5, ArrowLeft: -1, ArrowUp: -5 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const idx = TYPES.findIndex(tp => tp.id === state.type);
    const next = (idx + keys[e.key] + TYPES.length) % TYPES.length;
    state.type = TYPES[next].id;
    renderNow();
    el.types.querySelector(`[data-type="${state.type}"]`).focus();
  });

  function setData(text) {
    state.raw = text;
    state.headerAuto = true;
    state.fresh = true;
    el.data.value = text;
    render();
  }

  // A pasted / uploaded table goes into the current chart if it's empty, otherwise into a new chart.
  function addTable(text, label) {
    const reuse = state && selChart() === state && !state.raw.trim();
    if (!reuse) addChart();
    setData(text);
    toast(label);
  }

  let inputTimer;
  el.data.addEventListener('input', () => {
    clearTimeout(inputTimer);
    const wasEmpty = !state.raw.trim();
    inputTimer = setTimeout(() => {
      state.raw = el.data.value;
      if (wasEmpty) { state.headerAuto = true; state.fresh = true; }
      render();
    }, 150);
  });

  // Paste anywhere on the page (except into other text fields)
  document.addEventListener('paste', e => {
    const tgt = e.target;
    const inField = tgt instanceof HTMLElement && (tgt.matches('input, select, textarea') || tgt.isContentEditable);
    if (inField && tgt !== el.data) return;
    if (!el.modal.hidden) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const html = cd.getData('text/html');
    let text = cd.getData('text/plain');
    if (!text.includes('\t') && html) text = fromHtmlTable(html) || text;
    if (!text.trim()) return;
    text = text.replace(/\r\n?/g, '\n');
    // inside the text box: editing as usual, except a paste over everything replaces this chart's table
    if (tgt === el.data) {
      const all = el.data.selectionStart === 0 && el.data.selectionEnd === el.data.value.length;
      if (!all && el.data.value.trim()) return;
      e.preventDefault();
      setData(text);
      toast('Table pasted');
      return;
    }
    e.preventDefault();
    setTool('select');
    addTable(text, 'Graph created from the pasted table');
  });

  // Upload or drop CSV / TSV files — each file becomes its own chart
  function loadFiles(files) {
    const ok = [...files].filter(f => /\.(csv|tsv|txt)$/i.test(f.name) || /^text\//.test(f.type));
    if (!ok.length) { toast('Use .csv, .tsv or .txt files (in Excel: File → Save As → CSV)'); return; }
    closeAddDialog();
    setTool('select');
    ok.reduce((p, f) => p.then(() => f.text().then(t => {
      addTable(t, `Loaded ${f.name}`);
      if (!state.title) { state.title = f.name.replace(/\.[^.]+$/, ''); renderNow(); }
    })), Promise.resolve());
  }
  $('#file').addEventListener('change', e => { loadFiles(e.target.files); e.target.value = ''; });
  document.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    loadFiles(e.dataTransfer.files);
  });

  $('#sample').addEventListener('click', loadSample);
  function loadSample() {
    setTool('select');
    addTable(SAMPLE, 'Sample graph added');
    if (!state.title) { state.title = 'Sales by channel'; state.subtitle = '2026, in USD'; }
    renderNow();
  }
  $('#clear').addEventListener('click', () => {
    Object.assign(state, { raw: '', fresh: true, headerAuto: true, series: [], known: [], colors: {}, title: '', subtitle: '', xTitle: '', yTitle: '' });
    el.data.value = '';
    render();
    el.data.focus();
  });

  el.header.addEventListener('change', () => { state.header = el.header.checked; state.headerAuto = false; state.fresh = true; render(); });
  el.transpose.addEventListener('change', () => { state.transpose = el.transpose.checked; state.headerAuto = true; state.fresh = true; render(); });

  el.xCol.addEventListener('change', () => {
    state.labelCol = Number(el.xCol.value);
    state.series = state.series.filter(i => i !== state.labelCol);
    if (!state.series.length) {
      state.series = columns.map((c, i) => i).filter(i => columns[i].numeric && i !== state.labelCol).slice(0, 8);
    }
    render();
  });

  el.series.addEventListener('change', e => {
    const s = e.target.closest('[data-series]');
    if (s) {
      const i = Number(s.dataset.series);
      const set = new Set(state.series);
      s.checked ? set.add(i) : set.delete(i);
      state.series = columns.map((c, k) => k).filter(k => set.has(k));
      render();
    }
  });
  el.series.addEventListener('input', e => {
    const c = e.target.closest('[data-color]');
    if (!c) return;
    state.colors[Number(c.dataset.color)] = c.value;
    render();
  });

  document.querySelectorAll('[data-key]').forEach(inp => {
    const ev = inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const k = inp.dataset.key;
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (inp.type === 'number' || k === 'scale') v = Number(v);
      state[k] = v;
      render();
    });
  });

  el.preset.addEventListener('change', () => {
    if (!el.preset.value) return;
    const [w, h] = el.preset.value.split('x').map(Number);
    setSize(w, h);
  });
  [el.w, el.h].forEach(inp => {
    inp.addEventListener('change', () => setSize(el.w.value, el.h.value));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') setSize(el.w.value, el.h.value); });
  });

  // ------------------------------------------------------------------- start
  if (!window.Chart) {
    el.welcome.hidden = false;
    el.welcome.querySelector('h1').textContent = 'Could not load the chart library';
    el.welcome.querySelector('p').textContent = 'Check your internet connection and reload the page.';
    el.welcome.querySelector('.welcome-actions').hidden = true;
    return;
  }
  Chart.defaults.font.family = FONT;
  Chart.defaults.color = INK.secondary;
  setTool('select');
  renderItems();
  renderNow();
  for (const c of doc.charts) drawCard(c);
  applyView();
  if (!hadView) setTimeout(fitAll, 0);
  new ResizeObserver(() => placeTable()).observe(el.area);
})();
