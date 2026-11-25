// KudiTrail web app: vanilla JS, hash routing, no build step.
'use strict';

(function () {
  // Labels and formatting
  const STATUS = {
    passed_on: { label: 'Sent onward', help: 'This money was sent on to the next step.' },
    completed: { label: 'Completed', help: 'Reported as finished.' },
    operational: { label: 'In use', help: 'Finished and in use by the public.' },
    ongoing: { label: 'Work ongoing', help: 'Still being built or paid out.' },
    stalled: { label: 'Stalled', help: 'Work has stopped or not started.' },
    defects: { label: 'Defects reported', help: 'Finished, but problems have since been reported.' },
    under_review: { label: 'Under investigation', help: 'Being looked into by an official body. Allegations are not findings.' },
    disbursed: { label: 'Paid out', help: 'The money was released.' },
    not_disbursed: { label: 'Not paid out', help: 'Approved but not released.' },
    repaid: { label: 'Repaid', help: 'The loan has been paid back.' },
    unclear: { label: 'Unclear', help: 'We could not find a public record of where this money ended up.' },
    pending_data: { label: 'Data pending', help: 'Information exists or is expected, but we have not added it yet.' },
  };
  const CLARITY = {
    documented: { label: 'Official record', help: 'Confirmed by an official or primary source (a government, lender or court document).' },
    reported: { label: 'News reports', help: 'Reported by credible media or secondary sources, but not confirmed by an official document we have found.' },
    unclear: { label: 'No public record', help: 'We could not find a public record of where this money went. That is not proof of wrongdoing, but the public cannot trace it.' },
    pending: { label: 'Not listed here yet', help: 'The detail exists in public sources, but we have not added it to KudiTrail yet. You can help.' },
  };
  const TYPES = { source: 'Source', government: 'Government', agency: 'Agency', contractor: 'Contractor', allocation: 'Allocation', project: 'Project', section: 'Section', outcome: 'End point' };
  const OBSERVED = { completed: 'Completed', operational: 'In use', ongoing: 'Work ongoing', stalled: 'Stalled', defects: 'Has defects', abandoned: 'Abandoned', not_started: 'Not started', unsure: 'Not sure' };
  const EVTYPE = { official: ['🏛️', 'Official'], document: ['📄', 'Document'], dataset: ['📊', 'Dataset'], news: ['📰', 'News report'], reference: ['📚', 'Reference'] };
  const CONTACT_TYPES = { correction: 'Report an error / correction', right_of_reply: 'Right of reply (I am named or represent someone named)', takedown: 'Request removal of content', new_evidence: 'Share new evidence', suggest_fund: 'Suggest a fund to track', general: 'General enquiry' };

  function money(n, cur, short) {
    const sym = cur === 'NGN' ? '₦' : cur === 'USD' ? '$' : cur + ' ';
    const a = Math.abs(n);
    const units = short ? [[1e12, 'trn'], [1e9, 'bn'], [1e6, 'm'], [1e3, 'k']] : [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million'], [1e3, ' thousand']];
    for (const [v, u] of units) if (a >= v) {
      const x = n / v; const dec = x >= 10 ? 1 : 2;
      return sym + x.toFixed(dec).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + u;
    }
    return sym + n.toLocaleString('en-NG');
  }
  function fmtDate(d) {
    if (!d) return '';
    const p = d.split('-');
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (p.length === 1) return p[0];
    if (p.length === 2) return `${mo[+p[1] - 1]} ${p[0]}`;
    return `${+p[2]} ${mo[+p[1] - 1]} ${p[0]}`;
  }
  const CLARITY_SHORT = { documented: 'proven by official papers', reported: 'reported in the news', pending: 'not listed here yet', unclear: 'no public record' };
  // Naira equivalents use today's rate from data/settings.json: rough guides only
  function toNgn(amount, cur) { return cur === 'NGN' ? amount : cur === 'USD' && CONFIG.usdToNgn ? amount * CONFIG.usdToNgn : null; }
  function nairaHint(amount, cur) { if (cur !== 'USD') return ''; const n = toNgn(amount, cur); return n == null ? '' : `≈ ${money(n, 'NGN')}`; }
  function perPerson(amount, cur) {
    const n = toNgn(amount, cur); if (n == null || !CONFIG.population) return '';
    const v = n / CONFIG.population; const r = v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v);
    return '₦' + r.toLocaleString('en-NG');
  }
  const statusLabel = k => (STATUS[k] || { label: k }).label;
  const typeLabel = k => TYPES[k] || k;
  window.KT = { money, statusLabel, typeLabel };

  // Tiny DOM helper (always uses textContent, never innerHTML for data)
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : String(kid));
    return e;
  }
  // replace an element's children, skipping null/false and flattening arrays
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
  const SYMBOLS = {
    good: ['✅', 'Done, or paid back'],
    progress: ['⏳', 'Still in progress'],
    bad: ['⚠️', 'Problem reported, or under investigation'],
    unknown: ['❓', 'We found no public record of where the money went. This is not an accusation.'],
    neutral: ['ℹ️', 'Good to know'],
  };
  const verdictList = (v, cls) => v && v.length ? h('ul', { class: `verdict ${cls || ''}` },
    v.map(x => h('li', { class: `tone-${x.tone}` }, h('span', { class: 'v-icon', 'aria-hidden': 'true' }, (SYMBOLS[x.tone] || SYMBOLS.neutral)[0]), h('span', null, x.text)))) : null;
  const symbolKey = () => h('section', { class: 'key' }, h('h2', null, 'What the symbols mean'),
    h('ul', { class: 'verdict' }, Object.entries(SYMBOLS).map(([t, [icon, text]]) => h('li', { class: `tone-${t}` }, h('span', { class: 'v-icon', 'aria-hidden': 'true' }, icon), h('span', null, text)))));
  const pill = (status, extra) => h('span', { class: `pill status-${status} ${extra || ''}`, title: (STATUS[status] || {}).help }, h('i'), statusLabel(status));
  const clarityTag = c => h('span', { class: `clarity-tag clarity-${c}`, title: CLARITY[c].help }, CLARITY[c].label);
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }

  // ===== Design system components (live reference at #/design, rules in docs/DESIGN-SYSTEM.md) =====
  // Money in words: write million / billion / trillion in full (GOV.UK style guide)
  function naira(n) {
    if (n === 0) return '₦0';
    for (const [v, u] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']])
      if (Math.abs(n) >= v) return `₦${(n / v).toFixed(2)} ${u}`; // same 2 decimals everywhere, so lists line up
    return '₦' + Math.round(n).toLocaleString('en-NG');
  }
  // A percentage in everyday words, using "x in 10" where it helps (natural frequencies)
  function plainShare(p) {
    const t = [[0.5, 'none'], [5, 'almost none'], [15, 'about 1 in 10'], [23, 'about 1 in 5'], [29, 'about a quarter'], [38, 'about a third'],
      [45, 'about 4 in 10'], [56, 'about half'], [63, 'about 6 in 10'], [71, 'about two-thirds'], [78, 'about three-quarters'], [85, 'about 8 in 10'],
      [95, 'about 9 in 10'], [99.5, 'almost all'], [100.5, 'all of it'], [Infinity, 'more than planned']];
    return t.find(([max]) => p < max)[1];
  }
  // Split 100 into whole parts that add up exactly (largest remainder)
  function per100Shares(values) {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const raw = values.map(v => v / total * 100); const out = raw.map(Math.floor);
    let left = 100 - out.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
    return out;
  }
  // Figure: one big number and what it means for one person
  const figure = ({ label, value, context, note }) => h('div', { class: 'figure' },
    label ? h('span', { class: 'fig-label' }, label) : null, h('strong', { class: 'fig-value' }, value),
    context ? h('span', { class: 'fig-context' }, context) : null, note ? h('span', { class: 'fig-note' }, note) : null);
  // Source chip: opens just the sources behind one statement
  function sourceChip(items, about) {
    items = (items || []).filter(Boolean); if (!items.length) return null;
    const label = items.length === 1 ? 'Source' : `${items.length} sources`;
    return h('button', { type: 'button', class: 'src-chip', 'aria-label': `${label} for: ${about}`, onclick: () => showEvidence(about, items) }, label);
  }
  // Chart block: headline states the message, subtitle says what/where/when, numbers available as a table
  function chartBlock({ headline, sub, visual, table, after }) {
    return h('section', { class: 'chart' },
      h('h2', { class: 'chart-h' }, headline), sub ? h('p', { class: 'chart-sub' }, sub) : null, visual,
      table ? h('details', { class: 'chart-table' }, h('summary', null, 'See the numbers as a table'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, table.head.map((c, i) => h('th', { class: (table.num || []).includes(i) ? 'num' : null, scope: 'col' }, c)))),
          h('tbody', null, table.rows.map(r => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { class: (table.num || []).includes(i) ? 'num' : null, scope: i === 0 ? 'row' : null }, c)))))))) : null,
      after || null);
  }
  // Out of every ₦100: 10 x 10 icon array, filled in the same order as the list beside it
  function per100(parts) {
    const shares = per100Shares(parts.map(p => p.amount));
    const cells = []; shares.forEach((n, i) => { for (let k = 0; k < n; k++) cells.push(h('i', { class: parts[i].cls })); });
    while (cells.length < 100) cells.push(h('i'));
    return h('div', { class: 'per100' },
      h('div', { class: 'waffle', role: 'img', 'aria-label': 'Out of every ₦100: ' + parts.map((p, i) => `₦${shares[i]} for ${p.label.toLowerCase()}`).join(', ') }, cells),
      h('ul', { class: 'per100-list' }, parts.map((p, i) => h('li', { class: p.cls },
        h('span', { class: 'sw', 'aria-hidden': 'true' }), h('span', null, h('span', { class: 'p-name' }, p.label)), h('span', { class: 'p-share' }, `₦${shares[i]}`),
        h('span', { class: 'p-more' }, naira(p.amount), '. ', p.more || '', ' ', p.chip || '')))));
  }
  // Plan versus actual: bars start at zero; the text says it in words too
  function pva(rows) {
    return h('ul', { class: 'pva' }, rows.map(r => {
      const pct = r.pct != null ? r.pct : r.planned ? r.actual / r.planned * 100 : 0;
      const bar = h('span', { class: 'pva-bar', 'aria-hidden': 'true' }, h('i')); bar.firstChild.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (r.color) bar.style.setProperty('--c', r.color);
      return h('li', null,
        h('div', { class: 'sl-top' }, h('strong', null, r.label), h('span', { class: 'sl-amt' }, r.right != null ? r.right : `${Math.round(pct)}%`)),
        bar, h('p', null, r.text, ' ', r.chip || ''));
    }));
  }
  const pctTxt = f => f > 0 && f < 0.005 ? 'under 1' : String(Math.round(f * 100));
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  // Planned and Spent, as two labelled bars with their amounts, so nobody has to work anything out.
  // max sets the scale: one box on its own (the tree), or all the rows in a list (the bars).
  function planSpentBars(n, { actual = 'Spent', planOf = x => x.plan || 0, parentHasPlan = false, max } = {}) {
    const p = planOf(n), m = max || Math.max(p, n.amount) || 1, low = p && n.amount / p < 0.5;
    const bar = (cls, label, v) => { const i = h('i'); i.style.width = `max(${v > 0 ? 3 : 0}px, ${(v / m * 100).toFixed(1)}%)`;
      return h('span', { class: `tb ${cls}` }, h('span', { class: 'tb-l' }, h('span', null, label), h('b', null, naira(v))), h('span', { class: 'tb-t' }, i)); };
    return [p ? bar('tb-plan', 'Planned', p) : null,
      bar(`tb-spent${low ? ' low' : ''}`, p ? `${actual} ${low ? '⚠️ ' : '· '}${pctTxt(n.amount / p)}% of plan` : actual, n.amount),
      !p && parentHasPlan && n.amount > 0 ? h('span', { class: 'tb-none' }, 'Not in the plan') : null];
  }
  // Version 1 (bars): one bar row per part, plan and spent in the same bar
  function gotWords(n, parent) {
    if (!n.plan) return n.amount > 0 && parent && parent.plan ? 'Not in the plan' : '';
    const p = n.amount / n.plan * 100;
    if (p >= 100.5) return `More than the ${naira(n.plan)} planned`;
    if (p >= 99.5) return `All of the ${naira(n.plan)} planned`;
    const w = plainShare(p);
    return `${p < 50 && w.startsWith('about') ? 'Only ' + w : cap(w)} of the ${naira(n.plan)} planned`;
  }
  const planTone = n => !n.plan ? '' : n.amount / n.plan < 0.5 ? 'low' : n.amount / n.plan > 1.05 ? 'over' : '';
  function planBars(root, { chipFor, infoOf, parentEv, depth = 1, actual = 'Spent', shareWord = 'spending' } = {}) {
    const kids = [...(root.children || [])].sort((a, b) => (b.plan || b.amount) - (a.plan || a.amount));
    const max = Math.max(...kids.map(k => Math.max(k.amount, k.plan || 0)), 1);
    return h('ul', { class: `pb-list pb-d${depth}` }, kids.map(n => {
      const ev = n.ev && n.ev.length ? n.ev : parentEv;
      const info = infoOf ? infoOf(n) : null;
      const chip = chipFor && ev ? chipFor(ev, n.label) : null;
      const more = [n.note ? h('p', null, n.note) : null, info ? h('p', null, info) : null,
        n.children && n.children.length ? planBars(n, { chipFor, parentEv: ev, depth: depth + 1, actual, shareWord: n.label.toLowerCase() }) : null].filter(Boolean);
      const row = h(more.length ? 'summary' : 'div', { class: 'pb-row' },
        h('span', { class: 'pb-top' }, h('span', { class: 'pb-name' }, n.label), h('span', { class: 'pb-share' }, `${pctTxt(n.amount / (root.amount || 1))}% of ${shareWord}`)),
        planSpentBars(n, { actual, max, parentHasPlan: !!root.plan }),
        more.length ? h('span', { class: 'pb-open', 'aria-hidden': 'true' }) : null);
      return h('li', { class: 'pb-item' }, more.length ? h('details', null, row, h('div', { class: 'pb-more' }, more)) : row, chip ? h('p', { class: 'pb-src' }, chip) : null);
    }));
  }
  // Budget tree: the total at the top, its parts branching below it, joined by lines.
  // Every box shows Planned and Spent as two labelled bars, so the comparison is inside the box.
  // Tapping a box grows its own branch underneath; the path you took is drawn in green.
  // Options: onOpen(n) replaces opening in place (the budget page sends people to the explorer instead);
  // wide lays every row out side by side, for the explorer's draggable canvas; open is a list of labels to start opened.
  // content(n, parent) replaces what a box shows; onLeaf(n) makes end boxes tappable (fund pages open the details panel).
  function budgetTree(root, { shareWord = 'spending', actual = 'Spent', rootTitle, onPick, onOpen, wide, open: startOpen = [], onRender, chipFor, content, onLeaf } = {}) {
    const plan = n => n.plan || ((n.children || []).length && n.children.every(c => c.plan) ? n.children.reduce((a, c) => a + c.plan, 0) : 0);
    const kidsOf = n => [...(n.children || [])].sort((a, b) => (plan(b) || b.amount) - (plan(a) || a.amount));
    const wrap = h('div', { class: `tree${wide ? ' wide' : ''}` });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'tree-lines'); svg.setAttribute('aria-hidden', 'true');
    const path = [root];
    for (const label of startOpen) { const k = (path[path.length - 1].children || []).find(c => c.label === label); if (!k || !(k.children || []).length) break; path.push(k); }
    const bars = (n, parent) => planSpentBars(n, { actual, planOf: plan, parentHasPlan: !!(parent && plan(parent)) });
    // A box's sources are its own, or those of the nearest box above it
    const evMap = new Map(); (function walk(n, acc) { const e = n.ev && n.ev.length ? n.ev : acc; evMap.set(n, e); (n.children || []).forEach(c => walk(c, e)); })(root, null);
    const srcOf = n => chipFor && evMap.get(n) ? h('span', { class: 'tn-src' }, chipFor(evMap.get(n), n.label)) : null;
    const box = (n, parent, level) => {
      const kids = n.children || [];
      const body = content ? [content(n, parent), kids.length ? h('span', { class: 'tn-more', 'aria-hidden': 'true' }, `${kids.length} part${kids.length === 1 ? '' : 's'}`) : null] : [h('span', { class: 'tn-name' }, n.label),
        parent ? h('span', { class: 'tn-share' }, `${pctTxt(n.amount / (parent.amount || 1))}% of ${parent === root ? shareWord : parent.label.length <= 24 ? parent.label.toLowerCase() : 'the box above'}`) : null,
        bars(n, parent),
        kids.length ? h('span', { class: 'tn-more', 'aria-hidden': 'true' }, `${kids.length} part${kids.length === 1 ? '' : 's'}`) : null];
      const el = h('div', { class: `tnode${kids.length ? ' has-kids kids' : ''}` });
      if (!kids.length) { el.append(onLeaf ? h('button', { type: 'button', class: 'tn-hit', onclick: () => onLeaf(n) }, body) : h('div', { class: 'tn-hit' }, body)); el.append(...[srcOf(n)].filter(Boolean)); if (onLeaf) el.classList.add('has-kids'); return el; }
      el.append(h('button', { type: 'button', class: 'tn-hit', 'aria-expanded': 'false', onclick: () => {
        if (onOpen) return onOpen(n);
        const open = path[level + 1] === n;
        path.length = level + 1; if (!open) path.push(n);
        render(); onPick && onPick(path.length > 1 ? path[path.length - 1] : null, path.slice(1).map(x => x.label)); if (!open && !wide) { requestAnimationFrame(() => wrap.querySelector(`.tgrid[data-level="${level + 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }
      } }, body));
      el.append(...[srcOf(n)].filter(Boolean));
      return el;
    };
    // Each opened box's parts sit in a panel placed straight after the row that holds the box
    let grids = [], panels = [];
    const tnodes = g => [...g.children].filter(e => e.classList.contains('tnode'));
    const render = () => {
      const rootBox = h('div', { class: 'tnode troot' }, h('div', { class: 'tn-hit' }, content ? content(root, null) : [h('span', { class: 'tn-name' }, rootTitle || root.label), bars(root, null)]), srcOf(root));
      grids = path.map((n, lv) => h('div', { class: `tgrid${n.children.length > 2 ? ' many' : ''}`, dataset: { level: String(lv) } },
        kidsOf(n).map(k => { const e = box(k, n, lv); e._node = k; if (path[lv + 1] === k) { e.classList.add('on'); e.querySelector('.tn-hit').setAttribute('aria-expanded', 'true'); } return e; })));
      grids.forEach((g, lv) => { if ((path[lv].children || []).length === 1) g.classList.add('solo'); });
      panels = grids.map((g, lv) => lv === 0 ? g : h('div', { class: `tpanel${g.classList.contains('solo') ? ' solo' : ''}` }, g));
      wrap.replaceChildren(svg, rootBox, panels[0]);
      place();
      onRender && onRender([...wrap.querySelectorAll('.tnode.on')].pop() || null);
    };
    const place = () => {
      for (let lv = 1; lv < panels.length; lv++) {
        panels[lv].remove();
        const els = tnodes(grids[lv - 1]); const sel = els.find(e => e.classList.contains('on'));
        const row = els.filter(e => e.offsetTop === sel.offsetTop);
        row[row.length - 1].after(panels[lv]);
      }
      draw();
    };
    const draw = () => {
      const W = wrap.getBoundingClientRect(); if (!W.width) return;
      const k = W.width / (wrap.offsetWidth || W.width); // the explorer may be zoomed: work in unzoomed pixels
      const r = el => { const b = el.getBoundingClientRect(); return { l: (b.left - W.left) / k, r: (b.right - W.left) / k, t: (b.top - W.top) / k, b: (b.bottom - W.top) / k, cx: ((b.left + b.right) / 2 - W.left) / k }; };
      const WW = wrap.offsetWidth, WH = wrap.offsetHeight;
      svg.setAttribute('width', WW); svg.setAttribute('height', WH); svg.setAttribute('viewBox', `0 0 ${WW} ${WH}`);
      const out = [];
      const line = (d, cls) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); if (cls) p.setAttribute('class', cls); out.push(p); };
      grids.forEach((g, lv) => {
        const P = r(lv === 0 ? wrap.querySelector('.troot') : tnodes(grids[lv - 1]).find(e => e.classList.contains('on')));
        const els = tnodes(g); if (!els.length) return;
        const G = r(g), cls = lv === 0 ? null : 'branch';
        // Phones: one box per line, the trunk runs down the left and a branch goes into the side of each box
        if (g.classList.contains('solo')) { const E = r(els[0]); const tx = Math.min(P.l, E.l) + 24;
          line(`M${tx},${P.b} V${E.t}`, cls); if (els[0].classList.contains('on')) line(`M${tx},${P.b} V${E.t}`, 'hot'); return; }
        if (!wide && new Set(els.map(e => Math.round(r(e).l))).size === 1) {
          const tx = G.l + 14, y = E => E.t + 22;
          const ends = els.map(e => r(e));
          line(`M${tx},${P.b} V${y(ends[ends.length - 1])}`, cls);
          els.forEach((e, k) => {
            line(`M${tx},${y(ends[k])} H${ends[k].l}`, cls);
            if (e.classList.contains('on')) line(`M${tx},${P.b} V${y(ends[k])} H${ends[k].l}`, 'hot');
          });
          return;
        }
        const trunk = (G.l + G.r) / 2, bus = t => t - 12;
        const tops = els.map(e => r(e).t), lastBus = bus(Math.max(...tops)), firstBus = bus(Math.min(...tops));
        // the trunk goes behind an opened panel, not across it
        const Q = panels[lv + 1] ? r(panels[lv + 1]) : null;
        line(Q && Q.t > firstBus && Q.b < lastBus ? `M${P.cx},${P.b} V${firstBus} H${trunk} V${Q.t} M${trunk},${Q.b} V${lastBus}` : `M${P.cx},${P.b} V${firstBus} H${trunk} V${lastBus}`, cls);
        els.forEach(e => {
          const E = r(e); line(`M${trunk},${bus(E.t)} H${E.cx} V${E.t}`, cls);
          if (e.classList.contains('on')) line(`M${P.cx},${P.b} V${firstBus} H${trunk} V${bus(E.t)} H${E.cx} V${E.t}`, 'hot');
        });
      });
      out.sort((x, y) => (x.getAttribute('class') === 'hot') - (y.getAttribute('class') === 'hot'));
      svg.replaceChildren(...out);
    };
    if (window.ResizeObserver) new ResizeObserver(() => place()).observe(wrap);
    render();
    return wrap;
  }

  // The same tree as table rows for chartBlock: every part, indented by level
  function branchTable(root, spent) {
    const rows = [];
    const walk = (n, depth) => {
      rows.push([h('span', { style: `padding-left:${depth * 14}px` }, n.label), naira(n.amount), `${pctTxt(n.amount / (root.amount || 1))}%`].concat(spent ? [n.plan ? naira(n.plan) : '—'] : []));
      (n.children || []).forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    return { head: ['Part', spent ? 'Spent' : 'Amount', 'Share of total'].concat(spent ? ['Planned'] : []), num: spent ? [1, 2, 3] : [1, 2], rows };
  }

  // Stamp: when a person last checked this, or that it updates by itself
  const stamp = ({ auto, date, extra }) => h('p', { class: `stamp${auto ? ' auto' : ''}` },
    h('b', null, auto ? 'Updates automatically' : 'Checked by a person'), ` · ${auto ? 'last updated' : 'last checked'} ${fmtDate(date)}`, extra ? ['. ', extra] : '');

  // Plain words first, official words second (used on the About and design pages)
  const GLOSSARY = [
    ['Projects', 'Capital expenditure', 'Money to build or buy things that last: roads, schools, hospitals, power, equipment.'],
    ['Paying debts', 'Debt service', 'Interest and repayments on money borrowed before.'],
    ['Running the government', 'Recurrent (non-debt) expenditure', 'Salaries, pensions and the day-to-day costs of ministries.'],
    ['Fixed shares set by law', 'Statutory transfers', 'Money the law says must go to bodies such as the National Assembly, the courts and UBEC.'],
    ['The budget law', 'Appropriation Act', 'The law that allows the government to spend money in a year.'],
    ['Ministries and agencies', 'MDAs', 'Ministries, departments and agencies: the parts of government that spend the money.'],
    ['Released', 'Cash release / warrant', 'When the Finance Ministry actually gives a ministry money that was budgeted for it.'],
    ['Paid out', 'Disbursed', 'When a lender or the treasury actually sends the money.'],
    ['Money collected', 'Revenue', 'Taxes, oil money and other income the government receives.'],
    ['The gap to borrow', 'Deficit', 'How much more the government plans to spend than it expects to collect.'],
    ['Extended', 'Budget extension or rollover', 'When the National Assembly lets an old budget keep being spent after its year ends.'],
  ];

  // API
  async function api(path, opts = {}) {
    const res = await fetch('/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  let CONFIG = { contactEmail: '' };
  let configReady = Promise.resolve();
  // Keep read-only data in memory, so switching years or going back is instant and needs no network.
  // A request that fails is forgotten, so the next visit tries again.
  const apiCache = new Map();
  function cached(path) {
    if (!apiCache.has(path)) apiCache.set(path, api(path).catch(e => { apiCache.delete(path); throw e; }));
    return apiCache.get(path);
  }
  const getFund = id => cached('funds/' + encodeURIComponent(id));

  // Modal
  const modalRoot = () => document.getElementById('modal-root');
  let lastFocus = null;
  function openModal(title, body, { wide } = {}) {
    lastFocus = document.activeElement;
    const close = () => { root.textContent = ''; document.body.classList.remove('modal-open'); lastFocus && lastFocus.focus && lastFocus.focus(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const root = modalRoot();
    const dlg = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('div', { class: 'modal-head' }, h('h2', { id: 'modal-title' }, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body));
    root.textContent = '';
    root.append(h('div', { class: 'modal-backdrop', onclick: e => { if (e.target === e.currentTarget) close(); } }, dlg));
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKey);
    setTimeout(() => (dlg.querySelector('input, textarea, select, a, button.primary') || dlg.querySelector('button')).focus(), 30);
    return close;
  }

  function showEvidence(title, evidence, fund) {
    const list = (evidence || []).length
      ? h('ul', { class: 'evidence-list' }, evidence.map(ev => {
        const [icon, label] = EVTYPE[ev.type] || ['🔗', 'Link'];
        return h('li', null,
          h('span', { class: 'ev-icon', 'aria-hidden': 'true' }, icon),
          h('div', { class: 'ev-main' },
            h('a', { href: ev.url, target: '_blank', rel: 'noopener noreferrer nofollow' }, ev.title),
            h('div', { class: 'ev-meta' }, [label, ev.publisher, ev.date && fmtDate(ev.date), domain(ev.url)].filter(Boolean).join(' · '))),
          h('a', { class: 'btn small', href: ev.url, target: '_blank', rel: 'noopener noreferrer nofollow', 'aria-label': `Open ${ev.title}` }, ev.type === 'document' ? 'Download ↓' : 'Open ↗'));
      }))
      : h('p', { class: 'empty' }, 'We have no public evidence for this step yet. That itself is worth knowing. If you have a document, link or photo, please share it.');
    openModal(`Evidence: ${title}`, [
      list,
      h('p', { class: 'fine' }, 'These links go to third-party websites and documents that KudiTrail does not control. Sources can disagree, so we label what is documented and what is only reported. Spotted a broken or wrong link? ',
        h('a', { href: `#/contact?type=correction${fund ? '&fund=' + fund.id : ''}`, onclick: () => modalRoot().textContent = '' }, 'Tell us'), '.'),
    ]);
  }

  // Photo: re-encode on device (strips EXIF/GPS metadata, shrinks size)
  function encodePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file'));
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }

  function updateForm(fund, node) {
    let photo = null;
    const msg = h('div', { class: 'form-msg', role: 'status', 'aria-live': 'polite' });
    const preview = h('div', { class: 'photo-preview' });
    const statusChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'What state is it in?' },
      Object.entries(OBSERVED).map(([k, v], i) => h('label', { class: 'chip' }, h('input', { type: 'radio', name: 'status', value: k, checked: i === 7 }), h('span', null, v))));
    const form = h('form', { class: 'form', novalidate: true },
      h('p', { class: 'lead-sm' }, 'Have you seen or experienced ', h('strong', null, node.label), ' first-hand? Tell people what it looks like today.'),
      h('fieldset', null, h('legend', null, 'What state is it in?'), statusChips),
      h('div', { class: 'row2' },
        h('label', null, 'Where exactly?', h('input', { name: 'location', maxlength: 160, placeholder: 'e.g. Km 42, Ibadan-bound, near Ogere' })),
        h('label', null, 'When did you see it?', h('input', { name: 'observedOn', type: 'date', max: new Date().toISOString().slice(0, 10) }))),
      h('label', null, 'What did you see? *', h('textarea', { name: 'message', required: true, minlength: 20, maxlength: 2000, rows: 5, placeholder: 'Describe what you saw: is work happening, is it finished, are there problems? Stick to facts you observed.' })),
      h('label', null, 'Links (optional, one per line)', h('textarea', { name: 'links', rows: 2, placeholder: 'https://… a news report, video or document' })),
      h('label', null, 'Photo (optional)', h('input', { type: 'file', accept: 'image/*', onchange: async e => {
        const f = e.target.files[0]; preview.textContent = ''; photo = null; if (!f) return;
        try { photo = await encodePhoto(f); preview.append(h('img', { src: photo, alt: 'Selected photo preview' }), h('span', null, 'Location data in the photo has been removed.')); }
        catch (err) { preview.append(h('span', { class: 'err' }, err.message)); }
      } })), preview,
      h('div', { class: 'row2' },
        h('label', null, 'Your name (optional, shown publicly)', h('input', { name: 'name', maxlength: 80, placeholder: 'Leave blank to post as Anonymous' })),
        h('label', null, 'Email or phone (optional, private)', h('input', { name: 'contact', maxlength: 120, placeholder: 'Only so we can verify. Never published.' }))),
      h('input', { name: 'website', class: 'hp', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' }),
      h('div', { class: 'guidelines' },
        h('strong', null, 'Before you send:'),
        h('ul', null,
          h('li', null, 'Share only what you saw yourself, or link to where you found it.'),
          h('li', null, 'Do not accuse named people of crimes. Describe the project, not the person.'),
          h('li', null, 'No faces of private people, children, or anyone\'s personal details.'),
          h('li', null, 'Every update is checked by a moderator before it goes public.'))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'consent' }),
        h('span', null, 'I confirm this is true to the best of my knowledge, it is my own work or I have the right to share it, and I agree to the ', h('a', { href: '#/disclaimer', target: '_blank' }, 'terms'), '.')),
      msg,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Send update for review')));

    form.addEventListener('submit', async e => {
      e.preventDefault(); msg.className = 'form-msg'; msg.textContent = '';
      const fd = new FormData(form);
      const body = {
        fundId: fund.id, nodeId: node.id, status: fd.get('status'), location: fd.get('location'), observedOn: fd.get('observedOn'),
        message: fd.get('message'), links: String(fd.get('links') || '').split(/\s*\n\s*/).filter(Boolean),
        name: fd.get('name'), contact: fd.get('contact'), consent: fd.get('consent') === 'on', website: fd.get('website'), photo,
      };
      if ((body.message || '').trim().length < 20) { msg.className = 'form-msg err'; msg.textContent = 'Please describe what you saw (at least 20 characters).'; return; }
      if (!body.consent) { msg.className = 'form-msg err'; msg.textContent = 'Please tick the confirmation box.'; return; }
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await api('updates', { method: 'POST', body: JSON.stringify(body) });
        form.replaceWith(h('div', { class: 'success' }, h('div', { class: 'big' }, '✓'), h('h3', null, 'Thank you. Your update is in the review queue.'),
          h('p', null, 'A moderator will check it, usually within a few days. Once approved it will appear on this project for everyone to see.')));
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Send update for review'; }
    });
    openModal('Send an update', form);
  }

  // Layout pieces
  const app = () => document.getElementById('app');
  function setTitle(t) { document.title = t ? `${t} · KudiTrail` : 'KudiTrail: follow Nigeria\'s public money'; }

  function legend() {
    return h('div', { class: 'legend' },
      h('div', { class: 'legend-group' }, h('span', { class: 'legend-title' }, 'How sure are we?'),
        Object.keys(CLARITY).map(c => h('span', { class: 'legend-item', title: CLARITY[c].help }, h('span', { class: `swatch clarity-${c}` }), CLARITY[c].label))),
      h('div', { class: 'legend-group' }, h('span', { class: 'legend-title' }, 'Where it stands'),
        ['completed', 'operational', 'ongoing', 'defects', 'under_review', 'unclear', 'pending_data', 'repaid'].map(s => pill(s))));
  }

  function clarityBar(c) {
    const segs = ['documented', 'reported', 'pending', 'unclear'].filter(k => c[k] > 0.001);
    return h('div', { class: 'clarity-bar-wrap' },
      h('div', { class: 'clarity-bar', role: 'img', 'aria-label': segs.map(k => `${Math.round(c[k] * 100)}% ${CLARITY_SHORT[k]}`).join(', ') },
        segs.map(k => { const d = h('span', { class: `seg clarity-${k}`, title: `${Math.round(c[k] * 100)}% ${CLARITY_SHORT[k]}` }); d.style.width = (c[k] * 100) + '%'; return d; })),
      h('div', { class: 'clarity-bar-key' }, segs.map(k => h('span', null, h('i', { class: `dot clarity-${k}` }), `${Math.round(c[k] * 100)}% ${CLARITY_SHORT[k]}`))));
  }

  // Pages
  let currentGraph = null;
  let homeFilter = 'All', homeQuery = '';

  async function pageHome() {
    setTitle('');
    const [funds, B] = await Promise.all([cached('funds'), cached('budget').catch(() => null)]);
    // The budget card leads with this year's main finding, so people know what they will find before they tap
    const Y = B && B.years[0];
    const top = Y && Y.verdict[0];
    // At a glance: all the money we follow, in naira, and where it ended up. The dots match the bar on each fund.
    const KEYS = ['documented', 'reported', 'pending', 'unclear'];
    const tot = { all: 0 }; KEYS.forEach(k => tot[k] = 0);
    funds.forEach(f => { const n = toNgn(f.amount, f.currency); if (n == null) return; tot.all += n; KEYS.forEach(k => tot[k] += n * ((f.clarity || {})[k] || 0)); });
    const glance = tot.all ? balance([
      { label: 'Money we follow', value: `about ${naira(tot.all)}`, cls: 'bal-total' },
      { heading: 'Where it ended up' },
      ...KEYS.filter(k => tot[k] > 0).map(k => ({ label: CLARITY[k].label, dot: `clarity-${k}`, value: `about ${naira(tot[k])}`, small: `${pctTxt(tot[k] / tot.all)}%` }))], 'All the money we follow') : null;
    const traceBar = c => { const segs = KEYS.filter(k => c[k] > 0.001);
      const bar = h('div', { class: 'clarity-bar trace-mini', role: 'img', 'aria-label': 'Where it ended up: ' + segs.map(k => `${Math.round(c[k] * 100)}% ${CLARITY_SHORT[k]}`).join(', ') },
        segs.map(k => { const d = h('span', { class: `seg clarity-${k}` }); d.style.width = (c[k] * 100) + '%'; return d; }));
      return bar; };
    app().replaceChildren(h('div', { class: 'home container narrow' },
      h('h1', null, 'Where did the money go?'),
      h('p', { class: 'lead' }, 'We follow Nigeria\'s public money to see what it paid for. Every step links to its source.'),
      h('a', { class: 'budget-entry', href: '#/budget' },
        h('span', { class: 'be-main' },
          h('span', { class: 'be-kicker' }, Y ? `The ${Y.year} national budget: ${naira(Y.total)}` : 'The national budget'),
          h('strong', null, top ? top.text : 'How the government planned to spend its money, and what really happened.'),
          h('span', { class: 'be-go' }, 'See where the budget went →'))),
      h('h2', { class: 'list-h' }, `Loans and funds we follow (${funds.length})`),
      glance,
      h('ol', { class: 'fund-list' }, funds.map(f => {
        const ngn = nairaHint(f.amount, f.currency).replace('≈ ', '');
        const v = f.verdict || [];
        return h('li', null,
          h('h2', null, h('a', { href: `#/fund/${f.id}` }, f.title)),
          h('p', { class: 'fl-amount' }, h('strong', null, money(f.amount, f.currency)), ngn ? ` (about ${ngn})` : '', ' · ', fmtDate(f.date)),
          f.clarity ? traceBar(f.clarity) : null,
          verdictList(v.slice(0, 1)),
          h('a', { class: 'fl-go', href: `#/fund/${f.id}`, 'aria-label': `See how the money moved: ${f.title}` }, v.length > 1 ? `See ${v.length - 1} more and how the money moved →` : 'See how the money moved →'));
      })),
      symbolKey(),
      h('section', { class: 'home-foot' },
        h('h2', null, 'Something wrong or missing?'),
        h('p', null, 'If you spot a mistake, have a better source, or know a fund we should follow, ', h('a', { href: '#/contact' }, 'tell us'), '.'),
        rateNote())));
  }

  function rateNote() {
    return h('p', { class: 'fine' }, `Naira amounts use ₦${(CONFIG.usdToNgn || 0).toLocaleString('en-NG')} to $1`,
      CONFIG.rateSource ? [' (', h('a', { href: CONFIG.rateSource.url, target: '_blank', rel: 'noopener noreferrer' }, CONFIG.rateAuto ? 'Central Bank of Nigeria rate' : CONFIG.rateSource.title), `, ${fmtDate(CONFIG.rateDate)})`] : '',
      '. "For every Nigerian" uses a population of about ', `${Math.round((CONFIG.population || 0) / 1e5) / 10} million`,
      CONFIG.populationNote ? ` (${CONFIG.populationNote})` : '', '. ',
      CONFIG.rateAuto ? 'These update automatically. ' : '', 'They are rough guides only.');
  }

  // The answer list: the most important line shows, the rest are one tap away under "N more"
  function answerList(items, chipOf) {
    if (!items || !items.length) return null;
    const li = x => h('li', { class: `tone-${x.tone}` }, h('span', { class: 'v-icon', 'aria-hidden': 'true' }, (SYMBOLS[x.tone] || SYMBOLS.neutral)[0]),
      h('span', null, x.text, chipOf ? [' ', chipOf(x)] : null));
    const rest = items.slice(1);
    return [h('ul', { class: 'verdict big' }, li(items[0])),
      rest.length ? h('details', { class: 'verdict-more' }, h('summary', null, `${rest.length} more`), h('ul', { class: 'verdict big' }, rest.map(li))) : null];
  }
  // The balance: label on the left, amount on the right, read like a bank statement.
  // A row can carry a Source button, a coloured dot (to match a bar elsewhere) and a small note.
  function balance(rows, label) {
    return h('section', { class: 'balance', 'aria-label': label || 'At a glance' }, h('dl', null, rows.filter(Boolean).map(r => r.heading
      ? h('div', { class: 'bal-head' }, h('dt', null, r.heading))
      : h('div', { class: `bal-row ${r.cls || ''}` },
        h('dt', null, r.dot ? h('i', { class: `dot ${r.dot}`, 'aria-hidden': 'true' }) : null, r.label, r.chip ? [' ', r.chip] : null),
        h('dd', null, r.value, r.small ? h('small', null, r.small) : null)))));
  }

  // National budget: answer first, then one chart that puts the plan beside what was spent, then "Go further"
  let budgetYear = null;

  async function pageBudget(params) {
    setTitle('The national budget');
    const B = await cached('budget');
    const years = B.years.map(y => y.year);
    let yr = Number(params.get('year')) || budgetYear || years[0];
    if (!years.includes(yr)) yr = years[0];
    budgetYear = yr;
    const Y = B.years.find(y => y.year === yr);
    const ev = idxs => (idxs || []).map(i => Y.evidence[i]).filter(Boolean);
    const chip = (idxs, about) => sourceChip(ev(idxs), about);
    const pp = perPerson(Y.total, 'NGN');
    const yearNav = years.length > 1 ? h('nav', { class: 'view-toggle year-toggle', 'aria-label': 'Choose a year' },
      years.map(y => h('a', { href: `#/budget?year=${y}`, class: y === yr ? 'on' : null, 'aria-current': y === yr ? 'page' : null }, String(y)))) : null;

    // The balance, like a bank statement: the budget, then what came in, what was spent and what is left
    const bal = () => {
      const TR = Y.trees; if (!TR) return figure({ label: Y.title, value: naira(Y.total), context: pp ? `About ${pp} for every Nigerian` : '', note: Y.totalNote || `Signed into law on ${fmtDate(Y.signed)}.` });
      const inn = TR.spent.in.amount, out = TR.spent.out.amount, left = inn - out;
      const per = TR.period.replace(/ \d{4}$/, '').replace(/([A-Z][a-z]{2})[a-z]*/g, '$1').replace(' to ', '–'); // "Jan–Jun"
      return balance([
        { label: `Budget for ${Y.year}`, value: naira(Y.total), cls: 'bal-total' },
        { label: `Came in, ${per}`, value: naira(inn), chip: chip(TR.spent.in.ev, `Money that came in, ${TR.period}`) },
        { label: `Spent, ${per}`, value: `− ${naira(out)}`, cls: 'bal-out', chip: chip(TR.spent.out.ev, `Money spent, ${TR.period}`) },
        { label: left >= 0 ? 'Left over' : 'Short by', value: naira(Math.abs(left)), cls: 'bal-left' }], 'The budget balance');
    };
    const head = [
      h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, '← All funds')),
      h('div', { class: 'budget-title' }, h('h1', null, 'The national budget'), yearNav),
      bal(),
      h('h2', { class: 'small-h' }, 'The short answer'),
      answerList(Y.verdict, x => chip(x.evidence, x.text))];

    // Main chart: spent against planned, for the money going out and the money coming in
    const charts = [];
    const tables = [];
    if (Y.trees) {
      const TR = Y.trees, S = TR.spent;
      const chipFor = (idxs, about) => sourceChip((idxs || []).map(i => Y.evidence[i]), about);
      const explore = (side, n) => { location.hash = `#/budget/tree?year=${yr}&side=${side}${n ? '&open=' + encodeURIComponent(n.label) : ''}`; };
      const exploreBtn = (side, text) => h('p', { class: 'tree-go' }, h('a', { class: 'btn', href: `#/budget/tree?year=${yr}&side=${side}` }, text));
      const borrowed = S.in.children.find(c => c.part === 'r2');
      // Two versions to compare: the tree (default) and the bars. The switch needs no network.
      let version = 'tree'; try { if (localStorage.getItem('kt-budget-version') === 'bars') version = 'bars'; } catch (_) { }
      const setVersion = v => { try { localStorage.setItem('kt-budget-version', v); } catch (_) { } pageBudget(params); };
      charts.push(h('div', { class: 'view-toggle version-toggle', role: 'group', 'aria-label': 'How to show the budget' },
        [['tree', 'Tree'], ['bars', 'Bars']].map(([v, t]) => h('button', { type: 'button', class: v === version ? 'on' : null, 'aria-pressed': String(v === version), onclick: () => v !== version && setVersion(v) }, t))));
      if (version === 'bars') {
        const infoOf = n => { const P = B.parts[n.part]; return P && P.simple ? [P.simple, ' ', h('span', { class: 'tech' }, `Official term: ${P.tech}.`)] : null; };
        charts.push(chartBlock({
          headline: S.out.plan ? `${naira(S.out.amount)} of the ${naira(S.out.plan)} planned was spent` : `${naira(S.out.amount)} was spent`,
          sub: `${TR.period}. Tap a part to see inside it.`,
          visual: planBars(S.out, { chipFor, infoOf, parentEv: S.out.ev }) }));
        charts.push(chartBlock({
          headline: borrowed ? `₦${Math.round(borrowed.amount / (S.in.amount || 1) * 100)} of every ₦100 that came in was borrowed or raised` : 'Where the money came from',
          sub: `${naira(S.in.amount)} came in from ${TR.period}. ${S.in.note || ''}`,
          visual: planBars(S.in, { chipFor, parentEv: S.in.ev, actual: 'Came in', shareWord: 'money in' }) }));
      } else {
      charts.push(chartBlock({
        headline: S.out.plan ? `${naira(S.out.amount)} of the ${naira(S.out.plan)} planned was spent` : `${naira(S.out.amount)} was spent`,
        sub: `${TR.period}. Tap a part to explore it.`,
        visual: [budgetTree(S.out, { rootTitle: `The ${Y.year} budget, ${TR.period.replace(/ \d{4}$/, '')}`, onOpen: n => explore('out', n), chipFor }), exploreBtn('out', 'Explore the whole spending tree →')] }));
      charts.push(chartBlock({
        headline: borrowed ? `₦${Math.round(borrowed.amount / (S.in.amount || 1) * 100)} of every ₦100 that came in was borrowed or raised` : 'Where the money came from',
        sub: `${TR.period}. Tap a part to explore it.`,
        visual: [budgetTree(S.in, { shareWord: 'money in', actual: 'Came in', rootTitle: `Money that came in, ${TR.period.replace(/ \d{4}$/, '')}`, onOpen: n => explore('in', n), chipFor }), exploreBtn('in', 'Explore where the money came from →')] }));
      }
      tables.push(['Where the money went', branchTable(S.out, true)], ['Where the money came from', branchTable(S.in, true)]);
    } else if (Y.progress) {
      const prog = Y.progress;
      charts.push(chartBlock({ headline: prog.headline, sub: prog.title + '. ' + prog.note,
        visual: pva(prog.rows.map(r => { const pct = r.pct != null ? r.pct : r.planned ? r.actual / r.planned * 100 : 0;
          return { label: r.label, pct, text: r.planned ? `${naira(r.actual)} of the ${naira(r.planned)} planned. That is ${plainShare(pct)}.` : naira(r.actual), chip: chip(r.evidence, r.label) }; })) }));
    }

    // Go further: everything else, one tap away
    const parts = Y.split.map((x, i) => {
      const P = B.parts[x.part];
      return { label: P.label, amount: x.amount, cls: 'c' + (i + 1), more: [P.simple, ' ', h('span', { class: 'tech' }, `Official term: ${P.tech}.`)], chip: chip(x.evidence, `${Y.title}: ${P.label}`) };
    });
    const tableEl = t => h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, t.head.map((c, i) => h('th', { class: (t.num || []).includes(i) ? 'num' : null, scope: 'col' }, c)))),
      h('tbody', null, t.rows.map(r => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { class: (t.num || []).includes(i) ? 'num' : null, scope: i === 0 ? 'row' : null }, c)))))));
    const more = (title, ...body) => h('details', null, h('summary', null, title), ...body);
    const maxArea = Y.areas ? Math.max(...Y.areas.rows.map(r => r.amount)) : 1;
    const further = h('section', { class: 'more-about further' },
      h('h2', { class: 'section-h' }, 'Go further'),
      more(`How the whole ${Y.year} budget was planned`,
        h('p', { class: 'more-lead' }, pp ? `The budget is about ${pp} for every Nigerian. ` : '', Y.totalNote || `Signed into law on ${fmtDate(Y.signed)}.`),
        h('p', { class: 'more-lead' }, Y.splitHeadline, '. ', `Out of every ₦100 in the ${Y.year} budget. ${Y.splitSub || ''}`),
        per100(parts), Y.splitNote ? h('p', { class: 'fine' }, Y.splitNote) : null),
      Y.areas ? more(Y.areas.headline || Y.areas.title,
        h('p', { class: 'more-lead' }, Y.areas.note),
        pva(Y.areas.rows.map(r => ({ label: r.label, pct: r.amount / maxArea * 100, right: naira(r.amount), text: '' }))),
        h('p', { class: 'fine' }, chip(Y.areas.evidence, Y.areas.title))) : null,
      tables.length ? more('Every number, as a table', tables.map(([t, tb]) => [h('h3', null, t), tableEl(tb)])) : null,
      more(`What we could not find (${Y.gaps.length})`,
        h('ul', { class: 'gaps' }, Y.gaps.map(g => h('li', null, g))),
        h('p', null, h('a', { href: '#/contact?type=new_evidence' }, 'Have a document that fills a gap? Tell us.'))),
      more('Words used on this page',
        h('dl', { class: 'gloss-list' }, GLOSSARY.slice(0, 7).flatMap(([plain, official, means]) => [h('dt', null, plain, h('span', { class: 'tech' }, ` (${official})`)), h('dd', null, means)]))),
      more('Check it yourself',
        h('ul', { class: 'check-list' }, B.checkYourself.map(c => h('li', null,
          h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.title, ' ↗'), h('span', null, c.text)))),
        h('p', null, h('button', { class: 'btn', onclick: () => showEvidence(Y.title, Y.evidence) }, `📎 All sources for this year (${Y.evidence.length})`))));

    app().replaceChildren(h('div', { class: 'budget-page container narrow' }, head, charts, further,
      stamp({ date: B.asOf, extra: ['Government reports come out months late, so the latest months are not shown yet. ', h('a', { href: '#/disclaimer' }, 'Read the disclaimer'), '.'] })));
  }

  // Budget explorer: the whole tree on a canvas you can drag around and zoom. Tap a box to open its branches.
  async function pageBudgetTree(params) {
    const B = await cached('budget');
    const years = B.years.filter(y => y.trees).map(y => y.year);
    let yr = Number(params.get('year')) || budgetYear || years[0];
    if (!years.includes(yr)) yr = years[0];
    budgetYear = yr;
    const Y = B.years.find(y => y.year === yr), TR = Y.trees;
    const side = params.get('side') === 'in' ? 'in' : 'out';
    const open = (params.get('open') || '').split('>').filter(Boolean);
    const T = TR.spent[side];
    const period = TR.period.replace(/ \d{4}$/, '');
    setTitle(`Explore the ${yr} budget`);
    const q = (o) => { const p = new URLSearchParams({ year: yr, side, ...o }); return `#/budget/tree?${p}`; };

    // What the opened box is, with its sources, under the canvas
    const evOf = n => { const walk = (x, acc) => { const e = x.ev && x.ev.length ? x.ev : acc; if (x === n) return e;
      for (const c of x.children || []) { const r = walk(c, e); if (r !== undefined) return r; } }; return walk(T, null); };
    const info = h('p', { class: 'tree-info' });
    const showInfo = n => {
      if (!n) { info.hidden = true; return; }
      const P = B.parts[n.part]; info.hidden = false;
      fill(info, h('b', null, n.label, ': '), [P ? P.simple : null, n.note].filter(Boolean).join(' '),
        P ? [' ', h('span', { class: 'tech' }, `Official term: ${P.tech}.`)] : null, ' ', sourceChip((evOf(n) || []).map(i => Y.evidence[i]), n.label));
    };

    // Pan and zoom
    const view = h('div', { class: 'tx-view' }), canvas = h('div', { class: 'tx-canvas' });
    let x = 0, y = 0, k = 1;
    const apply = () => { canvas.style.transform = `translate(${x}px, ${y}px) scale(${k})`; };
    const clampK = v => Math.max(0.25, Math.min(1.5, v));
    const zoomAt = (f, cx, cy) => { const nk = clampK(k * f); x = cx - (cx - x) * nk / k; y = cy - (cy - y) * nk / k; k = nk; apply(); };
    const focusOn = el => {
      const V = view.getBoundingClientRect(), C = canvas.getBoundingClientRect(), E = el.getBoundingClientRect();
      // centre on the branch that just opened (the row of parts under the box), keeping the box itself in view
      const kids = el.classList.contains('on') ? el.parentElement.querySelector(':scope > .tpanel > .tgrid') : null;
      const K = kids ? kids.getBoundingClientRect() : E;
      const ex = (K.left - C.left) / k + K.width / k / 2, ey = (E.top - C.top) / k;
      x = V.width / 2 - ex * k; x = Math.max(x, 10 - (E.left - C.left)); y = 20 - ey * k; apply(); // never hide the opened box itself
    };
    const fit = () => { const V = view.getBoundingClientRect(); k = clampK(Math.min(1, V.width / canvas.offsetWidth, V.height / canvas.offsetHeight)); x = (V.width - canvas.offsetWidth * k) / 2; y = 12; apply(); };
    let kidsMax = 1; (function walk(n) { kidsMax = Math.max(kidsMax, (n.children || []).length); (n.children || []).forEach(walk); })(T);
    canvas.style.width = Math.max(520, Math.min(kidsMax, 4) * 216 + 60) + 'px'; // at most 4 boxes a row
    let ready = false;
    const tree = budgetTree(T, { wide: true, open, chipFor: (idxs, about) => sourceChip((idxs || []).map(i => Y.evidence[i]), about), shareWord: side === 'in' ? 'money in' : 'spending', actual: side === 'in' ? 'Came in' : 'Spent',
      rootTitle: side === 'in' ? `Money that came in, ${period}` : `The ${yr} budget, ${period}`,
      onPick: (n, labels) => { showInfo(n); history.replaceState(null, '', q(labels.length ? { open: labels.join('>') } : {})); },
      onRender: el => { if (ready) requestAnimationFrame(() => focusOn(el || canvas.querySelector('.troot'))); } });
    canvas.append(tree); view.append(canvas);

    // Drag with a finger or mouse, pinch or scroll to zoom. A drag never counts as a tap.
    const pts = new Map(); let moved = 0, pinch = null;
    view.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    view.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 6) { view.setPointerCapture(e.pointerId); view.classList.add('dragging'); } x += dx; y += dy; apply(); }
      else if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const V = view.getBoundingClientRect();
        zoomAt(d / pinch, (a.x + b.x) / 2 - V.left, (a.y + b.y) / 2 - V.top); pinch = d; moved = 99; }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; view.classList.remove('dragging'); };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('click', e => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); } }, true);
    view.addEventListener('wheel', e => { e.preventDefault(); const V = view.getBoundingClientRect();
      if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY / 200), e.clientX - V.left, e.clientY - V.top); else { x -= e.deltaX; y -= e.deltaY; apply(); } }, { passive: false });
    const centre = () => { const V = view.getBoundingClientRect(); return [V.width / 2, V.height / 2]; };
    const tools = h('div', { class: 'tx-tools' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', onclick: () => zoomAt(1 / 1.25, ...centre()) }, '−'),
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', onclick: () => zoomAt(1.25, ...centre()) }, '+'),
      h('button', { class: 'icon-btn wide', onclick: fit }, 'See all'));
    view.append(tools);

    const yearNav = years.length > 1 ? h('nav', { class: 'view-toggle year-toggle', 'aria-label': 'Choose a year' },
      years.map(v => h('a', { href: `#/budget/tree?year=${v}&side=${side}`, class: v === yr ? 'on' : null, 'aria-current': v === yr ? 'page' : null }, String(v)))) : null;
    const sideNav = h('nav', { class: 'view-toggle', 'aria-label': 'Spending or money in' },
      [['out', 'Spent'], ['in', 'Came in']].map(([v, t]) => h('a', { href: `#/budget/tree?year=${yr}&side=${v}`, class: v === side ? 'on' : null, 'aria-current': v === side ? 'page' : null }, t)));
    app().replaceChildren(h('div', { class: 'budget-page container tx-page' },
      h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: `#/budget?year=${yr}` }, '← The national budget')),
      h('div', { class: 'budget-title' }, h('h1', null, `Explore the ${yr} budget`), yearNav),
      h('div', { class: 'tx-bar' }, sideNav, h('span', { class: 'tx-hint' }, 'Drag to move. Tap a box to open it.')),
      view, info,
      stamp({ date: B.asOf, extra: [`${TR.period}. From the Budget Office and Debt Management Office reports. `, h('a', { href: '#/disclaimer' }, 'Read the disclaimer'), '.'] })));
    showInfo(null);
    // Start readable: full size on a laptop, a little smaller on a phone, centred on what was opened
    const V = view.getBoundingClientRect(); k = clampK(Math.min(1, V.width / 480)); apply();
    const last = [...canvas.querySelectorAll('.tnode.on')].pop();
    if (last) { const labels = []; let n = T; for (const l of open) { n = (n.children || []).find(c => c.label === l); if (!n) break; labels.push(n); } showInfo(labels.pop() || null); }
    focusOn(last || canvas.querySelector('.troot'));
    ready = true;
  }

  function preferredView() {
    try { const v = localStorage.getItem('kt-trail-view'); if (v === 'tree' || v === 'steps' || v === 'diagram') return v; } catch (_) { }
    return 'tree';
  }

  // depth of each node = longest path from a source
  function depths(fund) {
    const d = new Map(fund.nodes.map(n => [n.id, 0]));
    for (let i = 0; i < fund.nodes.length; i++) {
      let changed = false;
      for (const l of fund.links) if (d.get(l.from) + 1 > d.get(l.to)) { d.set(l.to, d.get(l.from) + 1); changed = true; }
      if (!changed) break;
    }
    return d;
  }

  // Official figures fetched automatically by the server (see live.js)
  function liveBox(fund) {
    const w = fund.liveData && fund.liveData.worldbank;
    if (!w) return null;
    const row = (k, v) => v ? h('li', null, h('span', null, k), h('strong', null, v)) : null;
    const usd = n => money(n, 'USD', true);
    return h('section', { class: 'live-box' },
      h('h2', { class: 'small-h' }, 'Latest official figures', h('span', { class: 'auto-tag' }, 'Updates automatically')),
      h('ul', { class: 'live-list' },
        row('Paid out so far', `${usd(w.disbursed)} of ${usd(w.original)} (${Math.round(w.disbursed / w.original * 100)}%)`),
        row('Still to be paid out', w.undisbursed > 0 ? usd(w.undisbursed) : 'Nothing'),
        w.repaid > 0 ? row('Paid back so far', usd(w.repaid)) : null,
        row('Nigeria starts paying back', w.repaid > 0 ? null : fmtDate(w.firstRepayment)),
        row('Last repayment due', fmtDate(w.lastRepayment))),
      stamp({ auto: true, date: w.fetchedAt.slice(0, 10), extra: ['From the World Bank\'s own loan records, with figures up to ', fmtDate(w.asOf), '. ',
        h('a', { href: w.sourcePage, target: '_blank', rel: 'noopener noreferrer' }, 'See the record ↗')] }));
  }

  async function pageFund(id, nodeId) {
    const [fund, updates] = await Promise.all([getFund(id), api('updates?fund=' + encodeURIComponent(id))]);
    setTitle(fund.title);
    const counts = {}; updates.forEach(u => counts[u.nodeId] = (counts[u.nodeId] || 0) + 1);
    const nodeById = new Map(fund.nodes.map(n => [n.id, n]));
    const inflow = nid => fund.links.filter(l => l.to === nid);
    const outflow = nid => fund.links.filter(l => l.from === nid);
    const nodeValue = nid => Math.max(inflow(nid).reduce((a, l) => a + l.amount, 0), outflow(nid).reduce((a, l) => a + l.amount, 0));
    const amountText = (n, short) => n.amountDisclosed === false ? 'Amount not disclosed' : money(nodeValue(n.id), fund.currency, short);

    let view = preferredView();
    const graphBox = h('div', { class: 'graph', tabindex: -1 });
    const stepsBox = h('div', { class: 'steps' });
    const treeBox = h('div', { class: 'ftree' });
    const panel = h('aside', { class: 'panel', 'aria-live': 'polite' });
    const backdrop = h('div', { class: 'sheet-backdrop', 'aria-hidden': 'true', onclick: () => selectNode(null) });
    const updatesBox = h('div', { class: 'updates' });
    const selectNode = (nid, opts = {}) => {
      currentGraph.select(nid, opts);
      if (nid && opts.focus && view === 'steps') stepsBox.querySelector(`[data-id="${CSS.escape(nid)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Simple step list (default on phones)
    const d = depths(fund); const maxD = Math.max(...d.values());
    stepsBox.append(h('p', { class: 'steps-hint' }, 'Read from top to bottom. Tap a step to see its sources.'));
    const stepTitle = i => i === 0 ? 'Where the money came from' : i === maxD ? 'Where it ended up' : 'Then it went to';
    for (let i = 0; i <= maxD; i++) {
      const col = fund.nodes.filter(n => d.get(n.id) === i);
      const parentSets = new Set(col.map(n => inflow(n.id).map(l => l.from).join(',')));
      if (i > 0) {
        const moving = fund.links.filter(l => d.get(l.to) === i).reduce((a, l) => a + l.amount, 0);
        stepsBox.append(h('div', { class: 'step-arrow', 'aria-hidden': 'true' }, h('span', null, '↓'), h('em', null, money(moving, fund.currency, true))));
      }
      stepsBox.append(h('section', { class: 'step' },
        h('h3', { class: 'step-h' }, h('span', { class: 'step-n' }, `Step ${i + 1}`), stepTitle(i), i === maxD ? ' 🏁' : null),
        col.length > 1 ? h('p', { class: 'step-split' }, `The money was split ${col.length} ways:`) : null,
        h('div', { class: 'step-cards' }, col.map(n => {
          const isEnd = !outflow(n.id).length; const ev = (n.evidence || []).length; const up = counts[n.id] || 0;
          const parents = inflow(n.id).map(l => nodeById.get(l.from).label);
          if (!isEnd) return h('button', { class: `step-row step-card status-${n.status} clarity-${n.clarity}`, dataset: { id: n.id }, onclick: () => selectNode(n.id), 'aria-label': `${n.label}, ${amountText(n)}. Tap for details.` },
            h('span', { class: 'sr-main' }, h('span', { class: 'n-type-tag' }, typeLabel(n.type)), h('strong', null, n.label)),
            h('span', { class: 'sr-side' }, n.status !== 'passed_on' ? pill(n.status) : null, h('span', { class: 'sr-amt' }, amountText(n, true)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
          return h('button', { class: `step-card status-${n.status} clarity-${n.clarity}`, dataset: { id: n.id }, onclick: () => selectNode(n.id) },
            h('div', { class: 'sc-top' }, h('span', { class: 'n-type-tag' }, typeLabel(n.type)), pill(n.status)),
            h('strong', { class: 'sc-label' }, n.clarity === 'unclear' ? '❓ ' : '', n.label),
            h('div', { class: 'sc-amount' }, amountText(n), n.amountDisclosed === false ? null : nairaHint(nodeValue(n.id), fund.currency) ? h('small', null, ' ' + nairaHint(nodeValue(n.id), fund.currency)) : null),
            n.simple && col.length <= 2 ? h('p', { class: 'sc-simple' }, n.simple) : null,
            parentSets.size > 1 && parents.length ? h('p', { class: 'sc-from' }, 'From: ', parents.join(' + ')) : null,
            isEnd && i !== maxD ? h('p', { class: 'sc-end' }, '🏁 The trail ends here') : null,
            h('div', { class: 'sc-foot' }, h('span', null, `📎 ${ev} source${ev === 1 ? '' : 's'}`), up ? h('span', null, `💬 ${up}`) : null, h('span', { class: 'go' }, 'Details →')));
        }))));
    }

    const renderPanel = node => {
      stepsBox.querySelectorAll('.step-card').forEach(c => c.classList.toggle('selected', !!node && c.dataset.id === node.id));
      panel.classList.toggle('open', !!node);
      backdrop.classList.toggle('open', !!node);
      document.body.classList.toggle('sheet-open', !!node);
      if (!node) {
        if (history.replaceState && location.hash !== `#/fund/${fund.id}`) history.replaceState(null, '', `#/fund/${fund.id}`);
        fill(panel, h('div', { class: 'panel-empty' },
          h('div', { class: 'tap-hint', 'aria-hidden': 'true' }, '👆'),
          h('h3', null, view === 'steps' ? 'Tap any step' : 'Tap any box'),
          h('p', null, 'You\'ll see how much went there, what state it is in now, and the proof behind it.'),
          view === 'diagram' ? h('p', { class: 'fine' }, 'Tip: drag to move around. Use + and − to zoom. Thicker ribbons mean more money.') : null));
        return;
      }
      const inF = inflow(node.id), outF = outflow(node.id), val = nodeValue(node.id);
      const nodeUpdates = updates.filter(u => u.nodeId === node.id);
      const nm = nid => nodeById.get(nid).label;
      const estimated = inF.some(l => l.estimated);
      const sameHelp = node.status === 'unclear' && node.clarity === 'unclear';
      const pp = node.amountDisclosed === false ? '' : perPerson(val, fund.currency);
      fill(panel,
        h('div', { class: 'panel-head' },
          h('span', { class: 'n-type-tag' }, typeLabel(node.type)),
          h('button', { class: 'icon-btn', 'aria-label': 'Close details', onclick: () => selectNode(null) }, '✕')),
        h('h2', null, node.label),
        node.location ? h('p', { class: 'loc' }, '📍 ', node.location) : null,
        h('div', { class: 'panel-amount' }, node.amountDisclosed === false ? h('span', { class: 'nd' }, 'Amount not disclosed') : money(val, fund.currency),
          node.amountDisclosed !== false && nairaHint(val, fund.currency) ? h('span', { class: 'ngn' }, ' ' + nairaHint(val, fund.currency)) : null,
          pp ? h('small', null, `About ${pp} for every Nigerian`) : null,
          node.amountDisclosed === false && estimated ? h('small', null, 'The diagram shows an equal share so you can see the flow. The real split has not been published.') : null),
        h('div', { class: 'panel-tags' }, pill(node.status, 'lg')),
        h('p', { class: 'src-line' }, 'Based on: ', CLARITY[node.clarity].label.toLowerCase(), '.'),
        node.simple ? h('div', { class: 'simple-box' }, h('span', null, 'In simple words'), h('p', null, node.simple)) : null,
        h('div', { class: 'panel-actions' },
          h('button', { class: 'btn primary', onclick: () => showEvidence(node.label, node.evidence, fund) }, `📎 See the sources (${(node.evidence || []).length})`),
          h('button', { class: 'btn', onclick: () => updateForm(fund, node) }, '📣 I\'ve seen this: send an update')),
        (inF.length || outF.length) ? h('div', { class: 'flows' },
          inF.length ? h('div', null, h('span', { class: 'flow-h' }, 'Money came from'), inF.map(l => h('button', { class: 'flow-link', onclick: () => selectNode(l.from, { focus: true }) }, '← ', nm(l.from), h('em', null, l.estimated ? 'n/d' : money(l.amount, fund.currency, true))))) : null,
          outF.length ? h('div', null, h('span', { class: 'flow-h' }, 'Money went to'), outF.map(l => h('button', { class: 'flow-link', onclick: () => selectNode(l.to, { focus: true }) }, '→ ', nm(l.to), h('em', null, l.estimated ? 'n/d' : money(l.amount, fund.currency, true))))) : h('div', { class: 'endpoint-note' }, '🏁 This is where the trail ends. The status above is the latest we know.')) : null,
        h('details', { class: 'more', open: window.matchMedia('(min-width: 1001px)').matches },
          h('summary', null, 'More detail'),
          h('p', { class: 'status-help' }, sameHelp ? '' : (STATUS[node.status] || {}).help + ' ', CLARITY[node.clarity].help),
          h('p', { class: 'desc' }, node.description)),
        nodeUpdates.length ? h('div', { class: 'panel-updates' }, h('h3', null, `Citizen updates (${nodeUpdates.length})`), nodeUpdates.slice(0, 3).map(u => updateCard(u)),
          nodeUpdates.length > 3 ? h('a', { href: '#updates', onclick: e => { e.preventDefault(); updatesBox.scrollIntoView({ behavior: 'smooth' }); } }, 'See all updates ↓') : null) : null,
        h('p', { class: 'fine' }, 'Information as of ', fmtDate(fund.asOf), '. ', h('a', { href: `#/contact?type=correction&fund=${fund.id}` }, 'Something wrong? Tell us.')));
      if (history.replaceState) history.replaceState(null, '', `#/fund/${fund.id}/${node.id}`);
    };

    const renderUpdates = () => {
      updatesBox.textContent = '';
      updatesBox.append(h('div', { class: 'sec-head' }, h('h2', { id: 'updates' }, 'From the ground: citizen updates'),
        h('p', null, 'Reports from people who have seen these projects. A moderator checks each one before it is published, but the views are the senders\' own.')));
      if (!updates.length) updatesBox.append(h('div', { class: 'empty-box' }, h('p', null, 'No updates yet. Have you seen one of these projects? Tap it above and choose ', h('strong', null, '“send an update”'), '.')));
      else updatesBox.append(h('div', { class: 'update-grid' }, updates.map(u => updateCard(u, fund))));
    };
    const updateCard = (u, f) => h('article', { class: 'update' },
      h('div', { class: 'u-head' }, h('span', { class: `pill obs obs-${u.status}` }, h('i'), OBSERVED[u.status] || 'Not sure'),
        f ? h('span', { class: 'u-node' }, f.nodes.find(n => n.id === u.nodeId)?.label) : null),
      u.photo ? h('a', { href: u.photo, target: '_blank', rel: 'noopener' }, h('img', { src: u.photo, alt: `Photo sent by ${u.name}`, loading: 'lazy' })) : null,
      h('p', null, u.message),
      u.links?.length ? h('ul', { class: 'u-links' }, u.links.map(l => h('li', null, h('a', { href: l, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, domain(l) + ' ↗')))) : null,
      h('div', { class: 'u-meta' }, [u.name, u.location, u.observedOn ? 'seen ' + fmtDate(u.observedOn) : ''].filter(Boolean).join(' · ')));

    // view toggle
    const diagramTools = h('div', { class: 'gt-btns' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => currentGraph.zoomBy(1 / 1.25) }, '−'),
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => currentGraph.zoomBy(1.25) }, '+'),
      h('button', { class: 'icon-btn wide', title: 'Show everything', onclick: () => currentGraph.fit(true, true) }, 'Fit'),
      h('button', { class: 'icon-btn wide', title: 'Put boxes back', onclick: () => currentGraph.resetLayout() }, 'Reset'));
    const legendEl = legend();
    const toggle = h('div', { class: 'view-toggle', role: 'tablist', 'aria-label': 'How to show the money trail' },
      h('button', { role: 'tab', dataset: { v: 'tree' } }, 'Tree'),
      h('button', { role: 'tab', dataset: { v: 'steps' } }, 'Steps'),
      h('button', { role: 'tab', dataset: { v: 'diagram' } }, 'Diagram'));
    const wrap = h('div', { class: 'graph-wrap' }, h('div', { class: 'graph-tools' }, toggle, diagramTools), treeBox, stepsBox, graphBox, legendEl);
    const setView = v => {
      view = v; try { localStorage.setItem('kt-trail-view', v); } catch (_) { }
      wrap.classList.toggle('view-steps', v === 'steps'); wrap.classList.toggle('view-diagram', v === 'diagram'); wrap.classList.toggle('view-tree', v === 'tree');
      toggle.querySelectorAll('button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      if (currentGraph && !currentGraph.selected) renderPanel(null);
    };
    toggle.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });

    const ngn = nairaHint(fund.amount, fund.currency); const pp = perPerson(fund.amount, fund.currency); const live = liveBox(fund);

    // The money trail as a tree: the money on top, then where it went, step by step.
    // A step that got money from two places shows under each of them, with the amount from that one.
    const grow = (nid, amount, estimated) => { const n = nodeById.get(nid);
      return { label: n.label, amount: amount != null ? amount : nodeValue(nid), estimated, ev: n.evidence, node: n,
        children: outflow(nid).map(l => grow(l.to, l.amount, l.estimated)) }; };
    const starts = fund.nodes.filter(n => !inflow(n.id).length);
    const startKids = starts.map(n => grow(n.id)), startSum = startKids.reduce((a, k) => a + k.amount, 0);
    // When more went in than the fund itself (Nigeria adding its own money to a loan), the top box shows all of it, so the shares add up
    const treeRoot = { label: fund.title, amount: Math.max(fund.amount, startSum), ev: fund.evidence, children: startKids };
    const autoOpen = []; for (let n = treeRoot; n.children.length === 1 && n.children[0].children.length;) { n = n.children[0]; autoOpen.push(n.label); }
    const boxContent = (t, parent) => {
      if (!parent) { const all = t.amount > fund.amount; const hint = nairaHint(t.amount, fund.currency);
        return [h('span', { class: 'tn-name' }, all ? 'All the money that went in' : 'The money'), h('span', { class: 'tn-amt' }, money(t.amount, fund.currency)), hint ? h('span', { class: 'tn-share' }, hint) : null]; }
      const n = t.node, hidden = n.amountDisclosed === false || t.estimated;
      return [h('span', { class: 'n-type-tag' }, typeLabel(n.type)), h('span', { class: 'tn-name' }, n.label),
        h('span', { class: 'tn-amt' }, hidden ? 'Amount not disclosed' : money(t.amount, fund.currency)),
        !hidden && parent.amount ? h('span', { class: 'tn-share' }, `${pctTxt(t.amount / parent.amount)}% of ${parent === treeRoot ? 'the money' : parent.label.length <= 24 ? parent.label : 'the box above'}`) : null,
        n.status !== 'passed_on' || ['unclear', 'pending'].includes(n.clarity) ? h('span', { class: 'tn-tags' }, n.status !== 'passed_on' ? pill(n.status) : null, ['unclear', 'pending'].includes(n.clarity) && !['unclear', 'pending_data'].includes(n.status) ? clarityTag(n.clarity) : null) : null];
    };
    treeBox.append(budgetTree(treeRoot, { content: boxContent, open: autoOpen, chipFor: (ev, about) => sourceChip(ev, about), onLeaf: t => selectNode(t.node.id) }));

    // The fund balance: how much, how much has been paid out, and where it ended up
    const endTotals = { documented: 0, reported: 0, pending: 0, unclear: 0 };
    fund.links.forEach(l => { if (!outflow(l.to).length) endTotals[nodeById.get(l.to).clarity] += l.amount; });
    const endSum = Object.values(endTotals).reduce((a, b) => a + b, 0) || 1;
    const w = fund.liveData && fund.liveData.worldbank;
    const wbSource = w ? sourceChip([{ title: 'World Bank loan record', publisher: 'World Bank', type: 'dataset', url: w.sourcePage, date: w.asOf }], 'Paid out so far') : null;
    const fundBalance = balance([
      { label: 'The money', value: money(fund.amount, fund.currency), small: ngn ? ngn : null, cls: 'bal-total' },
      w ? { label: 'Paid out so far', value: money(w.disbursed, 'USD'), chip: wbSource } : null,
      w && w.undisbursed > 0 ? { label: 'Still to be paid out', value: money(w.undisbursed, 'USD') } : null,
      w && w.repaid > 0 ? { label: 'Paid back so far', value: money(w.repaid, 'USD') } : null,
      { heading: 'Where it ended up' },
      ...['documented', 'reported', 'pending', 'unclear'].filter(k => endTotals[k] > 0).map(k => ({
        label: CLARITY[k].label, dot: `clarity-${k}`, value: money(endTotals[k], fund.currency), small: `${pctTxt(endTotals[k] / endSum)}%` }))], 'The money at a glance');
    const main = h('div', { class: 'fund-page' },
      h('nav', { class: 'crumbs container', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, '← All funds')),
      h('header', { class: 'fund-head container narrow-left' },
        h('h1', null, fund.title),
        fundBalance,
        h('h2', { class: 'small-h' }, 'The short answer'),
        answerList(fund.verdict),
        stamp({ date: fund.asOf, extra: ['Built from public reports. ', h('a', { href: '#/disclaimer' }, 'Read the disclaimer'), '.'] })),
      h('h2', { class: 'container section-h' }, 'How the money moved'),
      h('section', { class: 'explorer container' }, wrap, panel, backdrop),
      h('section', { class: 'container narrow-left more-about further' },
        h('h2', { class: 'section-h' }, 'Go further'),
        h('details', null, h('summary', null, 'The story in short'),
          h('p', { class: 'more-lead' }, `From ${fund.source}, ${fmtDate(fund.date)}.`, pp ? ` That is about ${pp} for every Nigerian.` : ''),
          fund.simple ? h('p', null, fund.simple) : null,
          h('p', null, fund.summary),
          h('p', { class: 'fine' }, 'How much of the money can be traced:'), clarityBar(fund.clarityBreakdown)),
        live ? h('details', null, h('summary', null, 'The lender\'s own record'), live) : null,
        h('details', null, h('summary', null, `What we could not find (${fund.gaps.length})`),
          h('ul', { class: 'gaps' }, fund.gaps.map(g => h('li', null, g))),
          h('p', null, h('a', { href: `#/contact?type=new_evidence&fund=${fund.id}` }, 'Can you help fill a gap? Tell us.'))),
        h('details', null, h('summary', null, 'Timeline'),
          h('ol', { class: 'timeline' }, fund.timeline.map(t => h('li', null, h('time', null, fmtDate(t.date)), h('p', null, t.text, ' ',
            sourceChip((t.evidence || []).map(i => fund.evidence[i]), `${fmtDate(t.date)}: ${t.text}`)))))),
        h('details', null, h('summary', null, `All sources (${fund.evidence.length})`),
          h('p', null, 'The documents and reports behind this page. Each step in the trail also has its own sources.'),
          h('button', { class: 'btn', onclick: () => showEvidence(fund.title, fund.evidence, fund) }, `📎 See the sources (${fund.evidence.length})`))),
      h('section', { class: 'container' }, updatesBox));
    app().replaceChildren(main);
    renderUpdates();

    if (currentGraph) currentGraph.destroy();
    currentGraph = new window.FlowGraph(graphBox, fund, { updateCounts: counts, onSelect: renderPanel });
    setView(view);
    if (nodeId && nodeById.has(nodeId)) setTimeout(() => selectNode(nodeId, { focus: true }), 60);
  }

  function pageContact(params) {
    setTitle('Contact & corrections');
    const msg = h('div', { class: 'form-msg', role: 'status', 'aria-live': 'polite' });
    const fundSel = h('select', { name: 'fundId' }, h('option', { value: '' }, '(None / not about a specific fund)'));
    cached('funds').then(fs => fs.forEach(f => fundSel.append(h('option', { value: f.id, selected: params.get('fund') === f.id }, f.title)))).catch(() => {});
    const form = h('form', { class: 'form card-form', novalidate: true },
      h('label', null, 'What is this about? *', h('select', { name: 'type' }, Object.entries(CONTACT_TYPES).map(([k, v]) => h('option', { value: k, selected: params.get('type') === k }, v)))),
      h('label', null, 'Which fund?', fundSel),
      h('div', { class: 'row2' },
        h('label', null, 'Your name *', h('input', { name: 'name', required: true, maxlength: 100, autocomplete: 'name' })),
        h('label', null, 'Email *', h('input', { name: 'email', type: 'email', required: true, maxlength: 160, autocomplete: 'email' }))),
      h('label', null, 'Organisation (if any)', h('input', { name: 'organisation', maxlength: 160 })),
      h('label', null, 'Your message *', h('textarea', { name: 'message', required: true, rows: 6, maxlength: 5000, placeholder: 'Tell us what is wrong or missing, and what the correct information is. Please include sources where you can.' })),
      h('label', null, 'Supporting links (optional, one per line)', h('textarea', { name: 'links', rows: 2 })),
      h('input', { name: 'website', class: 'hp', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' }),
      msg, h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Send message')));
    form.addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(form); msg.className = 'form-msg'; msg.textContent = '';
      const body = Object.fromEntries(fd.entries()); body.links = String(body.links || '').split(/\s*\n\s*/).filter(Boolean);
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const r = await api('contact', { method: 'POST', body: JSON.stringify(body) });
        form.replaceWith(h('div', { class: 'success card-form' }, h('div', { class: 'big' }, '✓'), h('h3', null, 'Message received'),
          h('p', null, 'Your reference is ', h('strong', null, r.reference || '—'), '. We aim to acknowledge corrections and right-of-reply requests within 3 working days, and to act on clear factual errors promptly.')));
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; }
    });
    app().replaceChildren(h('div', { class: 'container prose-page' },
      h('h1', null, 'Contact, corrections & right of reply'),
      h('p', { class: 'lead' }, 'We want to be accurate and fair. If something on KudiTrail is wrong, out of date or unfair to you or your organisation, tell us and we will review it.'),
      h('div', { class: 'contact-grid' }, form,
        h('div', { class: 'contact-side' },
          h('h3', null, 'What happens next'),
          h('ol', null,
            h('li', null, 'We acknowledge your message and give you a reference.'),
            h('li', null, 'We check your information against sources.'),
            h('li', null, 'If we got something wrong, we correct it and note the correction on the page.'),
            h('li', null, 'If you are named, we will publish your response alongside the record on request.')),
          h('h3', null, 'Urgent legal matters'),
          h('p', null, 'For takedown or legal notices you can also email ', CONFIG.contactEmail ? h('a', { href: 'mailto:' + CONFIG.contactEmail }, CONFIG.contactEmail) : 'us', '. While a request is being reviewed we may temporarily hide the disputed content.')))));
  }

  function pageDisclaimer() {
    setTitle('Disclaimer & terms');
    const sec = (title, ...ps) => h('section', null, h('h2', null, title), ...ps.map(p => typeof p === 'string' ? h('p', null, p) : p));
    app().replaceChildren(h('div', { class: 'container prose-page prose' },
      h('h1', null, 'Disclaimer & terms of use'),
      h('p', { class: 'lead' }, 'Please read this before you rely on, share or contribute to KudiTrail.'),
      sec('1. What KudiTrail is',
        'KudiTrail is an independent, non-partisan public-interest project. It brings together publicly available information about how public funds are borrowed, received and spent in Nigeria. It is not affiliated with any government, lender, political party or contractor.'),
      sec('2. Information only, not findings of wrongdoing',
        'Everything on this site is for general information. It comes from public sources such as official documents, lender publications, court records and media reports, which we link as evidence. We label each step as Documented, Reported, Unclear or Not yet itemised.',
        h('p', null, h('strong', null, '“Unclear” means only that we could not find a public record'), ' of where money went. It is not an allegation, suggestion or finding that any person or organisation has done anything wrong. Where we mention investigations or allegations, we say so plainly. Allegations are not proven, and everyone is presumed innocent unless a court decides otherwise.')),
      sec('3. Accuracy',
        'We work hard to be accurate, but sources can be incomplete, out of date or contradict each other. Amounts are as reported and may be rounded or estimated. Where a split has not been published, the diagram shows an estimated equal share, labelled “amount not disclosed”. Each fund shows the date it was last checked. Please check the original sources before you rely on anything here. KudiTrail accepts no liability for any loss arising from use of this site, to the extent the law allows.'),
      sec('4. Third-party links',
        'Evidence links go to websites and documents run by others. We do not control them and are not responsible for their content or availability.'),
      sec('5. Citizen updates',
        'Updates are sent by members of the public and reflect their own views and observations, not KudiTrail\'s. Every update is checked by a moderator before it is published. We may edit, decline or remove updates, for example ones that contain allegations against named people, personal data, hateful content or content that may be unlawful. By sending an update you confirm it is truthful to the best of your knowledge and that you have the right to share it. You also give KudiTrail a free, non-exclusive licence to publish it. Photos are re-encoded on your device to remove location data. Contact details you give are never published.'),
      sec('6. Corrections, right of reply and takedown',
        h('p', null, 'If you think something here is inaccurate or unfair, especially if you or your organisation is mentioned, please ', h('a', { href: '#/contact?type=correction' }, 'contact us'), '. We review every request, correct factual errors, and will publish a response from anyone named on request. While a complaint is being reviewed we may temporarily hide disputed content.')),
      sec('7. Privacy',
        'We collect only what you choose to send. For abuse prevention we store a one-way hash of your network address, never the address itself. We do not sell data or use advertising trackers.'),
      sec('8. Changes',
        'We may update these terms. The version on this page is the one that applies.'),
      h('p', { class: 'fine' }, 'This MVP text is a starting point and is not legal advice. Have it reviewed by a Nigerian lawyer before public launch.')));
  }

  function pageAbout() {
    setTitle('About');
    app().replaceChildren(h('div', { class: 'container narrow prose-page prose' },
      h('h1', null, 'About KudiTrail'),
      h('p', { class: 'lead' }, 'Nigeria borrows and spends a lot of money for us. KudiTrail follows some of that money, step by step, to see what it paid for. Kudi means money.'),
      h('h2', null, 'How we check facts'),
      h('ul', null,
        h('li', null, 'Every fact links to where we found it. Tap “See the sources” on any page.'),
        h('li', null, 'We use official papers first: government, lender and court documents. When we only have news reports, we say so.'),
        h('li', null, 'When sources disagree, we say so, and we show the figure we trust most.'),
        h('li', null, 'If we cannot find a source for something, we leave it out.'),
        h('li', null, 'Every page shows the date we last checked it.'),
        h('li', null, 'Investigations and allegations are not proof. Everyone is innocent until a court decides.')),
      symbolKey(),
      h('h2', null, 'How sure are we?'),
      h('p', null, 'Each step shows what it is based on:'),
      h('ul', null, Object.entries(CLARITY).map(([k, v]) => h('li', null, h('strong', null, v.label), ': ', v.help))),
      h('h2', null, 'Where we get information'),
      h('p', null, 'Government and lender websites (IMF, World Bank, US Department of Justice, NSIA, Debt Management Office, Budget Office, federal ministries), research datasets such as AidData, and Nigerian newspapers and TV.'),
      h('h2', null, 'Words we use'),
      h('dl', { class: 'gloss-list' }, GLOSSARY.flatMap(([plain, official, means]) => [h('dt', null, plain, h('span', { class: 'tech' }, ` (official term: ${official})`)), h('dd', null, means)])),
      h('h2', null, 'What updates automatically'),
      h('p', null, 'Some official sources publish data that computers can read. Once a day we fetch:'),
      h('ul', null,
        h('li', null, 'the dollar exchange rate, from the Central Bank of Nigeria;'),
        h('li', null, 'Nigeria\'s population, from the World Bank;'),
        h('li', null, 'how much of a World Bank loan has been paid out and paid back, from the World Bank\'s own loan records.')),
      h('p', null, 'These figures are marked “Updates automatically”. If a source is down, we keep showing the last good figure and its date. Everything else, including the budget page, is checked by a person, because most Nigerian government reports are published as PDFs and news stories, not as data.'),
      h('h2', null, 'Found a mistake?'),
      h('p', null, 'Please ', h('a', { href: '#/contact?type=correction' }, 'tell us'), '. We check every message and fix mistakes quickly. If a page mentions you or your organisation, you can ', h('a', { href: '#/contact?type=right_of_reply' }, 'reply'), ', and we will add your response.')));
  }

  // Living design system: the rules, with the real components rendered from the same code the site uses
  function pageDesign() {
    setTitle('Design system');
    const src = (title, url) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, title);
    const ex = (tag, ...kids) => h('div', { class: 'ds-example' }, h('span', { class: 'ex-tag' }, tag), ...kids);
    const dd = (good, bad) => h('div', { class: 'dodont' }, h('div', { class: 'do' }, h('b', null, 'Do'), good), h('div', { class: 'dont' }, h('b', null, 'Don\'t'), bad));
    const demoEv = [{ title: 'Budget Office of the Federation', publisher: 'Federal Government of Nigeria', type: 'official', url: 'https://budgetoffice.gov.ng/' }];
    const principles = [
      ['Answer first', 'Every page opens with the answer in one or two lines. Detail comes after, or behind a tap.', ['Inverted pyramid; NN/g on deferring secondary content', 'https://www.nngroup.com/articles/defer-secondary-content-for-mobile/']],
      ['One thing at a time', 'Show what most people need. Put the rest in "More about this" sections that open on a tap.', ['NN/g: writing for mobile', 'https://www.nngroup.com/articles/mobile-content/']],
      ['Plain words', 'Everyday words first, the official term after it. Sentences under 25 words, paragraphs under 5 sentences.', ['GOV.UK: use clear language', 'https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/']],
      ['Numbers people can feel', 'Write numbers as digits and write million, billion and trillion in full. Add what it means for one person ("₦287,600 for every Nigerian") or "out of every ₦100".', ['Barrio, Goldstein & Hofman (CHI 2016): perspectives improve understanding of numbers', 'https://www.microsoft.com/en-us/research/publication/improving-comprehension-of-numbers-in-the-news/']],
      ['Charts that say the answer', 'Each chart has a headline that states its message. Bars start at zero, there are four colours at most, labels go on the chart, and the numbers are also available as a table.', ['UK Government Analysis Function: charts', 'https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts']],
      ['Honest about gaps', 'Say what we could not find, how sure we are, and when we last checked. Missing proof is not proof of wrongdoing.', ['GAO on USAspending.gov: make data limitations prominent', 'https://www.gao.gov/products/gao-22-104127']],
      ['Proof one tap away', 'Every number and claim has a Source button that opens the exact documents behind it.', ['IBP: The Power of Making It Simple (citizens budgets)', 'https://internationalbudget.org/wp-content/uploads/Citizen-Budget-Guide.pdf']],
      ['Fast on any phone', 'Most Nigerian web traffic is on phones. No web fonts, no frameworks, the whole app under 100 KB compressed, and it works on slow 3G.', ['Alex Russell: real-world performance budgets', 'https://infrequently.org/2017/10/can-you-afford-it-real-world-web-performance-budgets/']],
      ['Everyone can use it', 'Meet WCAG 2.2 AA: text contrast of at least 4.5:1, graphics at least 3:1, never colour alone, and big tap targets.', ['Analysis Function: accessible charts checklist', 'https://analysisfunction.civilservice.gov.uk/policy-store/charts-a-checklist']],
    ];
    const colours = [['--brand', 'Brand, links'], ['--ink', 'Main text'], ['--ink-2', 'Second text'], ['--ink-3', 'Small print'], ['--surface-2', 'Quiet fill'], ['--line-2', 'Borders'],
      ['--tone-good', 'Good: done'], ['--tone-progress', 'In progress'], ['--tone-bad', 'Problem'], ['--tone-unknown', 'No public record'],
      ['--chart-1', 'Chart 1'], ['--chart-2', 'Chart 2'], ['--chart-3', 'Chart 3'], ['--chart-4', 'Chart 4']];
    const sw = ([v, name]) => { const i = h('i'); i.style.background = `var(${v})`; return h('div', { class: 'swatch-card' }, i, h('span', null, h('b', null, name), h('br'), h('code', null, v))); };
    const sample = [{ label: 'Projects', amount: 47, cls: 'c1', more: 'Roads, schools, hospitals.' }, { label: 'Paying debts', amount: 23, cls: 'c2', more: 'Interest and repayments.' },
      { label: 'Running the government', amount: 23, cls: 'c3', more: 'Salaries and running costs.' }, { label: 'Fixed shares set by law', amount: 7, cls: 'c4', more: 'National Assembly, courts, UBEC.' }];

    app().replaceChildren(h('div', { class: 'container narrow prose-page ds-page' },
      h('h1', null, 'KudiTrail design system'),
      h('p', { class: 'lead' }, 'Our promise: anyone with a phone can open any page and, within one minute, say where the money went, what state it is in, and how we know. These are the rules we use to keep that promise. The examples below come from the same code that runs the site.'),

      h('section', null, h('h2', null, 'Principles'),
        h('ol', { class: 'ds-principles' }, principles.map(([t, d, [st, su]]) => h('li', null, h('strong', null, t), h('p', null, d), h('p', { class: 'fine' }, 'Based on: ', src(st, su)))))),

      h('section', null, h('h2', null, 'Writing'),
        h('ul', null,
          h('li', null, 'Write for someone who never reads business news. Aim for a reading age of about 9.'),
          h('li', null, 'Put the most important words first in headings, list items and buttons.'),
          h('li', null, 'Use "we" for KudiTrail and "you" for the reader. Use active verbs.'),
          h('li', null, 'Use "reported", "alleged" or "under investigation" unless a court has decided. Describe projects, not people.'),
          h('li', null, 'Dates look like 17 April 2026. Use digits for numbers, including at the start of a sentence.')),
        dd('Paying debts (official term: debt service)', 'Debt service'),
        dd('₦68.32 trillion', '₦68.32trn, N68,320,000,000,000'),
        dd('₦5.08 trillion of the ₦9.22 trillion planned. That is about half.', '55.09% revenue performance against prorated projection'),
        dd('We found no public record of where this money went.', 'The money was diverted. (Only a court can say that.)'),
        h('h3', null, 'Words we use'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table glossary' }, h('thead', null, h('tr', null, h('th', null, 'We say'), h('th', null, 'Official term'), h('th', null, 'What it means'))),
          h('tbody', null, GLOSSARY.map(([a, b, c]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', null, b), h('td', null, c))))))),

      h('section', null, h('h2', null, 'Numbers'),
        h('p', null, 'Show one big number, then say what it means for one person. Round to what people can hold in their head. Say how sure we are.'),
        ex('Figure', figure({ label: 'The 2026 budget', value: naira(68.32e12), context: `About ${perPerson(68.32e12, 'NGN') || '₦287,600'} for every Nigerian`, note: 'Signed into law on 17 Apr 2026.' })),
        h('p', null, 'For a share of a whole, use "out of every ₦100" with a 10 × 10 grid of squares. Research on icon arrays shows they help people who find numbers hard (',
          src('Galesic, Garcia-Retamero & Gigerenzer, 2009', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2775772'), '). The squares fill in the same order as the list, and the list gives the exact numbers in words.'),
        ex('Out of every ₦100', per100(sample)),
        h('p', null, 'Percentages also get everyday words: 55% is "', plainShare(55), '", 18% is "', plainShare(18), '", and 72% is "', plainShare(72), '".')),

      h('section', null, h('h2', null, 'Charts'),
        h('ul', null,
          h('li', null, 'Pick the chart by the question it answers (', src('FT Visual Vocabulary', 'https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md'), '): part of a whole uses "out of every ₦100", plan against actual uses bars, and the money trail uses steps or a flow diagram.'),
          h('li', null, 'The headline states the message. The line under it says what is shown, where and when.'),
          h('li', null, 'Bars start at zero. Use 4 colours at most, from the accessible palette. Put labels on the chart, not in a separate key.'),
          h('li', null, 'Every chart offers "See the numbers as a table". Don\'t use pie charts, 3D effects or dual axes.')),
        h('p', null, 'For money split into parts, use a tree: the total at the top and its parts below, joined by lines. Each box shows Planned and Spent as two labelled bars. Only boxes that got less than half of their plan turn orange.'),
        ex('Budget tree', budgetTree({ label: 'Spent so far', amount: 18.78e12, plan: 31.75e12, children: [{ label: 'Paying debts', amount: 7.9e12, plan: 7.9e12 }, { label: 'Running the government', amount: 6.7e12, plan: 7.71e12 }, { label: 'Projects', amount: 4.18e12, plan: 16.14e12 }] }, { rootTitle: 'Example budget' })),
        ex('Chart block', chartBlock({ headline: 'The government collected about half of what it planned', sub: 'January to March 2026. From the Budget Office\'s first-quarter report.',
          visual: pva([{ label: 'Money collected', pct: 55, text: `₦5.08 trillion of the ₦9.22 trillion planned. That is ${plainShare(55)}.`, color: 'var(--tone-progress)', chip: sourceChip(demoEv, 'Money collected') }]),
          table: { head: ['', 'Collected', 'Planned'], num: [1, 2], rows: [['Money collected', '₦5.08 trillion', '₦9.22 trillion']] } }))),

      h('section', null, h('h2', null, 'Answers, proof and certainty'),
        ex('Answer list: the 3-second answer at the top of a page', verdictList([{ tone: 'good', text: 'Bridge: finished (2023)' }, { tone: 'progress', text: 'Road: part done, the rest due Nov 2026' }, { tone: 'bad', text: 'Part of the road is breaking up' }, { tone: 'unknown', text: 'We found no public record of where this money went' }], 'big')),
        ex('Source button', h('p', null, 'No 2026 project money had been released by 30 June 2026. ', sourceChip(demoEv, 'Example statement'))),
        ex('How sure are we?', h('p', null, Object.keys(CLARITY).map(c => [clarityTag(c), ' ']))),
        ex('Where it stands', h('p', null, ['completed', 'operational', 'ongoing', 'stalled', 'defects', 'under_review', 'unclear'].map(s2 => [pill(s2), ' ']))),
        ex('Gap', h('ul', { class: 'gaps' }, h('li', null, 'We could not find state-by-state payment figures that the public can check.'))),
        ex('Stamps', stamp({ date: '2026-11-19' }), stamp({ auto: true, date: '2026-11-19' }))),

      h('section', null, h('h2', null, 'Foundations'),
        h('h3', null, 'Colour'),
        h('p', null, 'The same meaning always gets the same colour and the same symbol, so colour is never the only signal. The chart colours are the UK Government Analysis Function\'s accessible palette (', src('colours guidance', 'https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-colours-in-charts'), '). Every colour has a light and a dark version.'),
        h('div', { class: 'swatches' }, colours.map(sw)),
        h('h3', null, 'Type'),
        h('p', null, 'We use the phone\'s own fonts, so nothing has to download. Body text is 16px with 1.55 line spacing, and lines are no wider than 68 characters.'),
        [['--fs-figure', 'Big number'], ['--fs-2xl', 'Page title'], ['--fs-lg', 'Chart headline'], ['--fs-md', 'Lead text'], ['--fs-base', 'Body text'], ['--fs-sm', 'Supporting text'], ['--fs-xs', 'Small print']].map(([v, n]) => {
          const t = h('span', null, n); t.style.fontSize = `var(${v})`; t.style.fontWeight = '700'; return h('div', { class: 'type-row' }, h('code', null, v), t);
        }),
        h('h3', null, 'Space and touch'),
        h('p', null, 'Spacing uses a 4px grid (4, 8, 12, 16, 24, 32, 48). Main buttons are at least 44px tall. Small inline buttons, such as Source, are at least 28px, above the WCAG 2.2 minimum of 24px.')),

      h('section', null, h('h2', null, 'Testing: the one-minute test'),
        h('p', null, 'Before a page goes live, give it to five people on their own phones. Ask three questions:'),
        h('ol', null, h('li', null, 'Where did the money go?'), h('li', null, 'What state is it in now?'), h('li', null, 'How do we know?')),
        h('p', null, 'If any of them can\'t answer within one minute, change the page and test again. Also check every page on a slow 3G connection and in dark mode, and with the text made larger.')),

      h('p', { class: 'fine' }, 'The full write-up, with the research and examples behind each rule, is in docs/DESIGN-SYSTEM.md in the code repository.')));
  }

  function pageAdmin() {
    setTitle('Moderation');
    let token = ''; try { token = sessionStorage.getItem('kt-admin') || ''; } catch (_) { }
    const box = h('div');
    const authed = (path, opts = {}) => api(path, { ...opts, headers: { 'x-admin-token': token } });
    const login = () => {
      const inp = h('input', { type: 'password', placeholder: 'Admin token', 'aria-label': 'Admin token' });
      box.replaceChildren(h('form', { class: 'form card-form narrow', onsubmit: e => { e.preventDefault(); token = inp.value.trim(); try { sessionStorage.setItem('kt-admin', token); } catch (_) { } load(); } },
        h('label', null, 'Admin token', inp), h('button', { class: 'btn primary' }, 'Sign in')));
    };
    const load = async () => {
      let updates, contacts, live;
      try { [updates, contacts, live] = await Promise.all([authed('admin/updates'), authed('admin/contacts'), authed('admin/live')]); }
      catch (e) { box.replaceChildren(h('p', { class: 'form-msg err' }, e.message)); login(); box.prepend(h('p', { class: 'form-msg err' }, e.message)); return; }
      const act = async (id, action) => { if (action === 'delete' && !window.confirm('Delete permanently?')) return; await authed('admin/updates/' + id, { method: 'POST', body: JSON.stringify({ action }) }); load(); };
      const photoImg = async (u) => {
        const img = h('img', { alt: 'Submitted photo' });
        try { const r = await fetch(u.photo, { headers: { 'x-admin-token': token } }); img.src = URL.createObjectURL(await r.blob()); } catch (_) { }
        return img;
      };
      const pending = updates.filter(u => u.moderation === 'pending');
      const rows = await Promise.all(updates.map(async u => h('article', { class: `mod-item mod-${u.moderation}` },
        h('div', { class: 'mod-head' }, h('span', { class: `mod-state ${u.moderation}` }, u.moderation), h('strong', null, u.fundTitle), ' → ', u.nodeLabel, h('span', { class: 'mod-date' }, new Date(u.createdAt).toLocaleString())),
        h('p', null, h('span', { class: `pill obs obs-${u.status}` }, h('i'), OBSERVED[u.status]), ' ', u.message),
        u.photo ? await photoImg(u) : null,
        u.links?.length ? h('ul', null, u.links.map(l => h('li', null, h('a', { href: l, target: '_blank', rel: 'noopener noreferrer' }, l)))) : null,
        h('p', { class: 'fine' }, `By: ${u.name}${u.contact ? ' · private contact: ' + u.contact : ''}${u.location ? ' · ' + u.location : ''}${u.observedOn ? ' · seen ' + u.observedOn : ''}`),
        h('div', { class: 'actions' },
          u.moderation !== 'approved' ? h('button', { class: 'btn primary small', onclick: () => act(u.id, 'approved') }, 'Approve & publish') : null,
          u.moderation !== 'rejected' ? h('button', { class: 'btn small', onclick: () => act(u.id, 'rejected') }, u.moderation === 'approved' ? 'Unpublish' : 'Reject') : null,
          h('button', { class: 'btn small danger', onclick: () => act(u.id, 'delete') }, 'Delete')))));
      fill(box,
        h('div', { class: 'mod-bar' }, h('span', null, `${pending.length} pending · ${updates.length} total updates · ${contacts.filter(c => c.state === 'open').length} open messages`),
          h('button', { class: 'btn small', onclick: () => { try { sessionStorage.removeItem('kt-admin'); } catch (_) { } token = ''; login(); } }, 'Sign out')),
        h('h2', null, 'Automatic data'),
        h('article', { class: 'mod-item' },
          h('p', null, `Figures last changed: ${live.lastRun ? new Date(live.lastRun).toLocaleString() : 'never'}. `,
            `Exchange rate: ${live.rate ? '₦' + live.rate.value + ' (' + live.rate.date + ')' : '—'}. `,
            `Population: ${live.population ? live.population.value.toLocaleString() + ' (' + live.population.year + ')' : '—'}. `,
            `World Bank loans: ${Object.values(live.worldbank || {}).map(w => `${w.projectId} ${w.asOf}`).join(', ') || '—'}.`),
          Object.keys(live.errors || {}).length ? h('ul', { class: 'form-msg err' }, Object.entries(live.errors).map(([k, e]) => h('li', null, `${k}: ${e.message} (${new Date(e.at).toLocaleString()})`))) : h('p', { class: 'fine' }, 'No errors.'),
          h('p', { class: 'fine' }, 'If an automatic figure differs from the checked text on a fund page, update the fund file. Automatic data never rewrites it.'),
          h('p', { class: 'fine' }, 'The figures are fetched once a day by a GitHub job. When they change, the job saves them and the site redeploys within a few minutes.'),
          live.runUrl ? h('div', { class: 'actions' }, h('a', { class: 'btn small', href: live.runUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Run the update now (on GitHub)')) : null),
        h('h2', null, 'Citizen updates'), rows.length ? rows : h('p', { class: 'empty' }, 'Nothing yet.'),
        h('h2', null, 'Contact, corrections & takedown requests'),
        contacts.length ? contacts.map(c => h('article', { class: `mod-item mod-${c.state}` },
          h('div', { class: 'mod-head' }, h('span', { class: `mod-state ${c.state === 'open' ? 'pending' : 'approved'}` }, c.state), h('strong', null, CONTACT_TYPES[c.type]), h('span', { class: 'mod-date' }, new Date(c.createdAt).toLocaleString())),
          h('p', null, c.message),
          c.links?.length ? h('ul', null, c.links.map(l => h('li', null, h('a', { href: l, target: '_blank', rel: 'noopener noreferrer' }, l)))) : null,
          h('p', { class: 'fine' }, `${c.name} <${c.email}>${c.organisation ? ' · ' + c.organisation : ''}${c.fundId ? ' · fund: ' + c.fundId : ''} · ref ${c.id.slice(0, 8).toUpperCase()}`),
          h('div', { class: 'actions' },
            h('a', { class: 'btn small', href: `mailto:${c.email}?subject=${encodeURIComponent('KudiTrail ref ' + c.id.slice(0, 8).toUpperCase())}` }, 'Reply by email'),
            h('button', { class: 'btn small', onclick: async () => { await authed('admin/contacts/' + c.id, { method: 'POST', body: JSON.stringify({ state: c.state === 'open' ? 'resolved' : 'open' }) }); load(); } }, c.state === 'open' ? 'Mark resolved' : 'Reopen')))) : h('p', { class: 'empty' }, 'No messages.'));
    };
    app().replaceChildren(h('div', { class: 'container prose-page' }, h('h1', null, 'Moderation'), box));
    token ? load() : login();
  }

  // Router
  let lastPath = null;
  async function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, query] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    // Start downloading this page's data now, alongside the settings, instead of one after the other
    if (!parts.length) { cached('funds').catch(() => {}); cached('budget').catch(() => {}); }
    else if (parts[0] === 'budget') cached('budget').catch(() => {});
    else if (parts[0] === 'fund' && parts[1]) getFund(parts[1]).catch(() => {});
    await configReady;
    // Switching the year on the same page keeps your place; a new page starts at the top
    const samePage = pathPart === lastPath; lastPath = pathPart;
    document.body.classList.remove('sheet-open', 'modal-open');
    modalRoot().textContent = '';
    if (currentGraph && parts[0] !== 'fund') { currentGraph.destroy(); currentGraph = null; }
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + (parts[0] || '')));
    try {
      if (!parts.length) await pageHome();
      else if (parts[0] === 'fund' && parts[1]) {
        // selecting a node only rewrites the hash with replaceState, so a real hashchange means a new page
        await pageFund(parts[1], parts[2]);
      }
      else if (parts[0] === 'budget' && parts[1] === 'tree') await pageBudgetTree(params);
      else if (parts[0] === 'budget') await pageBudget(params);
      else if (parts[0] === 'contact') pageContact(params);
      else if (parts[0] === 'disclaimer') pageDisclaimer();
      else if (parts[0] === 'about') pageAbout();
      else if (parts[0] === 'design') pageDesign();
      else if (parts[0] === 'admin') pageAdmin();
      else app().replaceChildren(h('div', { class: 'container prose-page' }, h('h1', null, 'Page not found'), h('p', null, h('a', { href: '#/' }, '← Back to all funds'))));
    } catch (e) {
      app().replaceChildren(h('div', { class: 'container prose-page' }, h('h1', null, 'Something went wrong'), h('p', null, e.message), h('p', null, h('a', { href: '#/' }, '← Back to all funds'))));
    }
    if (!samePage) window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', async () => {
    configReady = cached('config').then(c => { CONFIG = c; }, () => { });
    document.getElementById('year').textContent = new Date().getFullYear();
    const toggle = document.getElementById('nav-toggle');
    toggle.addEventListener('click', () => { const open = document.body.classList.toggle('nav-open'); toggle.setAttribute('aria-expanded', String(open)); });
    document.querySelector('.nav').addEventListener('click', () => { document.body.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); });
    route();
  });
})();
