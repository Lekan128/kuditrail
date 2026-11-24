// Evidence audit: every step and timeline entry must point to a source.
// Run: node scripts/audit.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'funds');
let problems = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const say = m => { problems++; console.log(`${d.id}: ${m}`); };
  if (!d.evidence?.length) say('fund has no sources');
  for (const n of d.nodes) if (!n.evidence?.length) say(`step "${n.label}" has no source`);
  for (const t of d.timeline || []) {
    if (!t.evidence?.length) say(`timeline ${t.date} has no source`);
    for (const i of t.evidence || []) if (!d.evidence[i]) say(`timeline ${t.date} points to missing source #${i}`);
  }
  for (const k of ['simple', 'verdict', 'asOf']) if (!d[k] || (Array.isArray(d[k]) && !d[k].length)) say(`missing ${k}`);
}
// National budget page: every figure and statement must point to a source
const B = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'budget.json'), 'utf8'));
for (const y of B.years) {
  const say = m => { problems++; console.log(`budget ${y.year}: ${m}`); };
  const check = (what, idxs) => {
    if (!idxs?.length) say(`${what} has no source`);
    for (const i of idxs || []) if (!y.evidence[i]) say(`${what} points to missing source #${i}`);
  };
  y.split.forEach(x => { check(`split "${x.part}"`, x.evidence); if (!B.parts[x.part]) say(`unknown part ${x.part}`); });
  const sum = y.split.reduce((a, x) => a + x.amount, 0);
  if (Math.abs(sum - y.total) / y.total > 0.005) say(`split adds up to ${sum}, not the total ${y.total}`);
  y.verdict.forEach(v => check(`statement "${v.text.slice(0, 40)}…"`, v.evidence));
  (y.progress?.rows || []).forEach(r => check(`progress "${r.label}"`, r.evidence));
  if (y.areas) check('areas', y.areas.evidence);
  if (y.trees) {
    const near = (a, b) => Math.abs(a - b) <= Math.max(1e9, Math.abs(b) * 0.001);
    const walk = (n, where) => {
      if (n.plan != null && n.plan > 0 && n.plan < 1e9) say(`tree "${where}" has a plan figure that looks like it is in billions, not naira`);
      if (n.ev) for (const i of n.ev) if (!y.evidence[i]) say(`tree "${where}" points to missing source #${i}`);
      if (n.children && !n.childSource) {
        const c = n.children.reduce((a, x) => a + x.amount, 0);
        if (!near(c, n.amount)) say(`tree "${where}" parts add up to ${c}, not ${n.amount}`);
      }
      (n.children || []).forEach(k => walk(k, `${where} > ${k.label}`));
    };
    for (const mode of ['planned', 'spent']) for (const side of ['out', 'in']) {
      const t = y.trees[mode] && y.trees[mode][side];
      if (!t) { say(`missing ${mode} ${side} tree`); continue; }
      if (!t.ev || !t.ev.length) say(`${mode} ${side} tree has no source`);
      walk(t, `${mode} ${side}`);
    }
    if (!near(y.trees.planned.out.amount, y.total)) say('planned tree does not match the budget total');
  }
}

// Performance budget (design system: "Fast on any phone"): the whole app, compressed, stays under 100 KB
const zlib = require('zlib');
const pub = path.join(__dirname, '..', 'public');
const appBytes = fs.readdirSync(pub).filter(f => /\.(html|css|js|svg)$/.test(f))
  .reduce((a, f) => a + zlib.gzipSync(fs.readFileSync(path.join(pub, f))).length, 0);
if (appBytes > 100 * 1024) { problems++; console.log(`app is ${Math.round(appBytes / 1024)} KB compressed, over the 100 KB budget`); }
console.log(problems ? `\n${problems} problem(s)` : `All steps, timeline entries and budget figures have sources, budget splits add up, and the app is ${Math.round(appBytes / 1024)} KB compressed (budget 100 KB).`);
process.exitCode = problems ? 1 : 0;
