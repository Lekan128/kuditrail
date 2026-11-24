// KudiTrail flow graph: a dependency-free, pannable, zoomable, draggable
// Sankey-style diagram. Ribbon width is proportional to the money flowing.
'use strict';

(function () {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CARD_W = 232, COL_GAP = 150, MIN_H = 92, ROW_GAP = 26, PROP_H = 280;

  function s(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function wrap(text, maxChars, maxLines) {
    const words = String(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }

  class FlowGraph {
    constructor(container, fund, opts) {
      this.c = container; this.fund = fund; this.opts = opts || {};
      this.t = { x: 0, y: 0, k: 1 };
      this.selected = null;
      this.build();
      this.layout();
      this.render();
      this.bind();
      requestAnimationFrame(() => this.fit(false));
    }

    build() {
      const f = this.fund;
      this.nodes = f.nodes.map(n => ({ ...n, inL: [], outL: [] }));
      this.byId = new Map(this.nodes.map(n => [n.id, n]));
      this.links = f.links.map((l, i) => ({ ...l, i, src: this.byId.get(l.from), dst: this.byId.get(l.to) }));
      for (const l of this.links) { l.src.outL.push(l); l.dst.inL.push(l); }
      for (const n of this.nodes) {
        n.inSum = n.inL.reduce((a, l) => a + l.amount, 0);
        n.outSum = n.outL.reduce((a, l) => a + l.amount, 0);
        n.value = Math.max(n.inSum, n.outSum);
        n.isEnd = n.outL.length === 0;
        n.lines = wrap(n.label, 27, 3);
        n.minH = 48 + n.lines.length * 18 + 46;
      }
      // depth = longest path from any source
      const depth = new Map(this.nodes.map(n => [n.id, 0]));
      for (let iter = 0; iter < this.nodes.length; iter++) {
        let changed = false;
        for (const l of this.links) {
          const d = depth.get(l.from) + 1;
          if (d > depth.get(l.to)) { depth.set(l.to, d); changed = true; }
        }
        if (!changed) break;
      }
      for (const n of this.nodes) n.depth = depth.get(n.id);
    }

    layout() {
      const cols = [];
      for (const n of this.nodes) (cols[n.depth] = cols[n.depth] || []).push(n);
      const maxColSum = Math.max(...cols.map(c => c.reduce((a, n) => a + n.value, 0)));
      const k = PROP_H / maxColSum;
      cols.forEach((col, d) => {
        if (d > 0) {
          // barycentre ordering keeps children close to their parents
          for (const n of col) {
            const w = n.inL.reduce((a, l) => a + l.amount, 0) || 1;
            n.bary = n.inL.reduce((a, l) => a + (l.src.y + l.src.h / 2) * l.amount, 0) / w + n.inL[0]?.src.outL.indexOf(n.inL[0]) * 0.001;
          }
          col.sort((a, b) => a.bary - b.bary);
        }
        for (const n of col) n.h = Math.max(MIN_H, n.minH, n.value * k);
        const total = col.reduce((a, n) => a + n.h, 0) + ROW_GAP * (col.length - 1);
        let y = -total / 2;
        for (const n of col) { n.x = d * (CARD_W + COL_GAP); n.y = y; y += n.h + ROW_GAP; }
      });
      for (const n of this.nodes) { n.x0 = n.x; n.y0 = n.y; }
    }

    resetLayout() { for (const n of this.nodes) { n.x = n.x0; n.y = n.y0; this.placeNode(n); } this.drawLinks(); this.fit(true, true); }

    render() {
      this.c.textContent = '';
      const svg = this.svg = s('svg', { class: 'flow-svg', role: 'img', 'aria-label': `Money flow diagram for ${this.fund.title}` }, this.c);
      const defs = s('defs', null, svg);
      const pat = s('pattern', { id: 'hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      s('rect', { width: 10, height: 10, class: 'hatch-bg' }, pat);
      s('line', { x1: 0, y1: 0, x2: 0, y2: 10, class: 'hatch-line' }, pat);
      const lpat = s('pattern', { id: 'hatch-link', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      s('line', { x1: 0, y1: 0, x2: 0, y2: 8, class: 'hatch-line-link' }, lpat);

      this.vp = s('g', { class: 'viewport' }, svg);
      this.gLinks = s('g', { class: 'links' }, this.vp);
      this.gNodes = s('g', { class: 'nodes' }, this.vp);

      for (const l of this.links) {
        const g = l.el = s('g', { class: `link clarity-${l.dst.clarity}${l.estimated ? ' estimated' : ''}` }, this.gLinks);
        l.ribbon = s('path', { class: 'ribbon' }, g);
        l.flow = s('path', { class: 'flowline' }, g);
        const t = s('title', null, g);
        t.textContent = `${l.src.label} → ${l.dst.label}: ${l.estimated ? 'amount not disclosed (drawn as an equal share)' : window.KT.money(l.amount, this.fund.currency)}`;
      }
      for (const n of this.nodes) this.drawNode(n);
      this.drawLinks();
      this.applyTransform();
    }

    drawNode(n) {
      const cur = this.fund.currency;
      const g = n.el = s('g', {
        class: `node status-${n.status} clarity-${n.clarity} type-${n.type}${n.isEnd ? ' is-end' : ''}`,
        tabindex: 0, role: 'button', 'data-id': n.id,
        'aria-label': `${n.label}. ${n.amountDisclosed === false ? 'Amount not disclosed' : window.KT.money(n.value, cur)}. Status: ${window.KT.statusLabel(n.status)}. Press Enter for details.`,
      }, this.gNodes);
      s('rect', { class: 'card-shadow', x: 2, y: 4, width: CARD_W, height: n.h, rx: 14 }, g);
      s('rect', { class: 'card', width: CARD_W, height: n.h, rx: 14 }, g);
      if (n.clarity === 'unclear' || n.clarity === 'pending') s('rect', { class: 'card-hatch', width: CARD_W, height: n.h, rx: 14 }, g);
      s('rect', { class: 'card-bar', width: 6, height: n.h - 20, x: 0, y: 10, rx: 3 }, g);

      const typeT = s('text', { class: 'n-type', x: 18, y: 24 }, g);
      typeT.textContent = window.KT.typeLabel(n.type).toUpperCase();

      const lines = n.lines;
      lines.forEach((ln, i) => { const t = s('text', { class: 'n-label', x: 18, y: 44 + i * 18 }, g); t.textContent = ln; });
      const y = 44 + lines.length * 18 + 6;
      const amt = s('text', { class: 'n-amount', x: 18, y }, g);
      amt.textContent = n.amountDisclosed === false ? 'Amount not disclosed' : window.KT.money(n.value, cur, true);

      // status pill pinned to bottom
      const pill = s('g', { class: 'pill', transform: `translate(18, ${n.h - 30})` }, g);
      const label = window.KT.statusLabel(n.status);
      s('rect', { class: 'pill-bg', width: label.length * 6.6 + 24, height: 20, rx: 10 }, pill);
      s('circle', { class: 'pill-dot', cx: 10, cy: 10, r: 4 }, pill);
      const pt = s('text', { class: 'pill-text', x: 19, y: 14 }, pill); pt.textContent = label;

      if (n.clarity === 'unclear') {
        const q = s('g', { class: 'q-badge', transform: `translate(${CARD_W - 24}, 22)` }, g);
        s('circle', { r: 12 }, q); const qt = s('text', { y: 5 }, q); qt.textContent = '?';
      }
      const ev = (n.evidence || []).length; const up = (this.opts.updateCounts || {})[n.id] || 0;
      if (ev || up) {
        const b = s('text', { class: 'n-badges', x: CARD_W - 14, y: n.h - 15, 'text-anchor': 'end' }, g);
        b.textContent = [ev ? `📎${ev}` : '', up ? `💬${up}` : ''].filter(Boolean).join('  ');
      }
      this.placeNode(n);
    }

    placeNode(n) { n.el.setAttribute('transform', `translate(${n.x},${n.y})`); }

    drawLinks() {
      for (const n of this.nodes) {
        n.outL.sort((a, b) => (a.dst.y - b.dst.y)); n.inL.sort((a, b) => (a.src.y - b.src.y));
        const pad = 10, usableOut = n.h - pad * 2, usableIn = n.h - pad * 2;
        let o = n.y + pad; for (const l of n.outL) { l.ws = Math.max(2, usableOut * l.amount / n.outSum); l.y0 = o; o += l.ws; }
        let i = n.y + pad; for (const l of n.inL) { l.wt = Math.max(2, usableIn * l.amount / n.inSum); l.y1 = i; i += l.wt; }
      }
      for (const l of this.links) {
        const x0 = l.src.x + CARD_W, x1 = l.dst.x, xm = (x0 + x1) / 2;
        const { y0, y1, ws, wt } = l;
        l.ribbon.setAttribute('d', `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + wt}C${xm},${y1 + wt} ${xm},${y0 + ws} ${x0},${y0 + ws}Z`);
        const c0 = y0 + ws / 2, c1 = y1 + wt / 2;
        l.flow.setAttribute('d', `M${x0},${c0}C${xm},${c0} ${xm},${c1} ${x1},${c1}`);
      }
    }

    applyTransform() { this.vp.setAttribute('transform', `translate(${this.t.x},${this.t.y}) scale(${this.t.k})`); }

    bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of this.nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + CARD_W); y1 = Math.max(y1, n.y + n.h); }
      return { x0, y0, x1, y1 };
    }

    // whole=true shows everything; otherwise keep text readable and start from the left (the source)
    fit(animate, whole) {
      const r = this.c.getBoundingClientRect(); if (!r.width) return;
      const b = this.bounds(), pad = 24, w = b.x1 - b.x0, hgt = b.y1 - b.y0;
      let k = Math.min(1.1, (r.width - pad * 2) / w, (r.height - pad * 2) / hgt);
      if (!whole) k = Math.max(k, Math.min(0.78, (r.height - pad * 2) / hgt));
      k = Math.max(0.15, k);
      const x = w * k <= r.width - pad * 2 ? (r.width - w * k) / 2 - b.x0 * k : pad - b.x0 * k;
      const y = hgt * k <= r.height - pad * 2 ? (r.height - hgt * k) / 2 - b.y0 * k : pad - b.y0 * k;
      this.animateTo({ k, x, y }, animate);
    }

    animateTo(target, animate) {
      if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this.t = target; this.applyTransform(); return; }
      const from = { ...this.t }, start = performance.now(), dur = 320;
      const step = now => {
        const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
        this.t = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
        this.applyTransform(); if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    zoomBy(f, cx, cy) {
      const r = this.c.getBoundingClientRect();
      if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
      const k = Math.max(0.15, Math.min(3, this.t.k * f)); const ratio = k / this.t.k;
      this.t = { k, x: cx - (cx - this.t.x) * ratio, y: cy - (cy - this.t.y) * ratio };
      this.applyTransform();
    }

    focusNode(n) {
      const r = this.c.getBoundingClientRect();
      const k = Math.max(this.t.k, 0.8);
      this.animateTo({ k, x: r.width / 2 - (n.x + CARD_W / 2) * k, y: r.height / 2 - (n.y + n.h / 2) * k }, true);
    }

    select(id, { focus = false } = {}) {
      this.selected = id;
      const n = id && this.byId.get(id);
      const keep = new Set();
      if (n) {
        const up = [n], down = [n];
        while (up.length) { const x = up.pop(); if (keep.has('u' + x.id)) continue; keep.add('u' + x.id); keep.add(x.id); x.inL.forEach(l => { keep.add('l' + l.i); up.push(l.src); }); }
        while (down.length) { const x = down.pop(); if (keep.has('d' + x.id)) continue; keep.add('d' + x.id); keep.add(x.id); x.outL.forEach(l => { keep.add('l' + l.i); down.push(l.dst); }); }
      }
      this.svg.classList.toggle('has-selection', !!n);
      for (const m of this.nodes) { m.el.classList.toggle('selected', m.id === id); m.el.classList.toggle('in-path', keep.has(m.id)); }
      for (const l of this.links) l.el.classList.toggle('in-path', keep.has('l' + l.i));
      if (n && focus) this.focusNode(n);
      if (this.opts.onSelect) this.opts.onSelect(n ? this.fund.nodes.find(x => x.id === id) : null);
    }

    bind() {
      const svg = this.svg; const pointers = new Map(); let mode = null, dragNode = null, start = null, pinch = null, moved = false;
      const local = e => { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

      svg.addEventListener('pointerdown', e => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        svg.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, local(e));
        moved = false;
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.t.k, t: { ...this.t }, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
          mode = 'pinch'; dragNode = null; return;
        }
        const nodeEl = e.target.closest('.node');
        dragNode = nodeEl ? this.byId.get(nodeEl.dataset.id) : null;
        mode = dragNode ? 'maybe-drag' : 'pan';
        start = { p: local(e), t: { ...this.t }, nx: dragNode?.x, ny: dragNode?.y };
        svg.classList.add('grabbing');
      });

      svg.addEventListener('pointermove', e => {
        if (!pointers.has(e.pointerId)) return;
        const p = local(e); pointers.set(e.pointerId, p);
        if (mode === 'pinch' && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const k = Math.max(0.15, Math.min(3, pinch.k * d / pinch.d)); const ratio = k / pinch.t.k;
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          this.t = { k, x: cx - (pinch.cx - pinch.t.x) * ratio, y: cy - (pinch.cy - pinch.t.y) * ratio };
          this.applyTransform(); moved = true; return;
        }
        if (!start) return;
        const dx = p.x - start.p.x, dy = p.y - start.p.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        if (mode === 'maybe-drag') mode = 'drag';
        if (mode === 'drag') {
          dragNode.x = start.nx + dx / this.t.k; dragNode.y = start.ny + dy / this.t.k;
          this.placeNode(dragNode); this.drawLinks();
        } else if (mode === 'pan') {
          this.t = { ...this.t, x: start.t.x + dx, y: start.t.y + dy }; this.applyTransform();
        }
      });

      const end = e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        if (mode === 'pinch') { if (pointers.size === 0) { mode = null; start = null; } return; }
        if (!moved && mode === 'maybe-drag' && dragNode) this.select(dragNode.id);
        else if (!moved && mode === 'pan' && e.type === 'pointerup') this.select(null);
        mode = null; dragNode = null; start = null; svg.classList.remove('grabbing');
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);

      // Plain scrolling scrolls the page (no scroll-trapping). Ctrl/⌘ + scroll or a trackpad pinch zooms.
      const hint = document.createElement('div'); hint.className = 'zoom-hint'; hint.textContent = 'To zoom, hold Ctrl (or ⌘) and scroll, or use the + and − buttons';
      this.c.appendChild(hint);
      svg.addEventListener('wheel', e => {
        if (!e.ctrlKey && !e.metaKey) {
          hint.classList.add('show'); clearTimeout(this._ht); this._ht = setTimeout(() => hint.classList.remove('show'), 1400);
          return;
        }
        e.preventDefault();
        const p = local(e);
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
        this.zoomBy(f, p.x, p.y);
      }, { passive: false });

      svg.addEventListener('keydown', e => {
        const nodeEl = e.target.closest && e.target.closest('.node');
        if (nodeEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.select(nodeEl.dataset.id, { focus: true }); }
        if (e.key === '+' || e.key === '=') this.zoomBy(1.2);
        if (e.key === '-') this.zoomBy(1 / 1.2);
        if (e.key === 'Escape') this.select(null);
      });

      this.onResize = () => this.fit(false);
      this.ro = new ResizeObserver(() => { clearTimeout(this._rt); this._rt = setTimeout(this.onResize, 120); });
      this.ro.observe(this.c);
    }

    destroy() { this.ro && this.ro.disconnect(); }
  }

  window.FlowGraph = FlowGraph;
})();
