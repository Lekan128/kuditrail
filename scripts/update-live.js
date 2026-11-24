// Automatic updates from official public data (no API keys needed).
// Run by GitHub Actions twice a day (.github/workflows/update-live.yml):
//   node scripts/update-live.js   -> writes data/live.json, which is committed.
//
// Rules, because correctness matters more than freshness:
//  - We only use official sources that publish machine-readable data.
//  - Every value is sanity-checked before it is accepted. A bad or failed fetch
//    keeps the last good value; it never blanks the site.
//  - Live values are shown as "updated automatically" with their source and date.
//    They never silently rewrite the checked facts in data/funds/*.json.
'use strict';

const fs = require('fs');
const path = require('path');


const TIMEOUT_MS = 30000;

const SOURCES = {
  rate: {
    name: 'Central Bank of Nigeria',
    title: 'CBN official exchange rate (US dollar, central rate)',
    page: 'https://www.cbn.gov.ng/rates/ExchRateByCurrency.html',
    api: 'https://www.cbn.gov.ng/api/GetAllExchangeRates',
  },
  population: {
    name: 'World Bank',
    title: 'World Bank: Population, total (Nigeria)',
    page: 'https://data.worldbank.org/indicator/SP.POP.TOTL?locations=NG',
    api: 'https://api.worldbank.org/v2/country/NGA/indicator/SP.POP.TOTL?format=json&mrnev=1',
  },
  worldbank: {
    name: 'World Bank Finances One',
    title: 'IDA Statement of Credits and Grants (historical data)',
    page: 'https://financesone.worldbank.org/ida-statement-of-credits-grants-and-guarantees-historical-data/DS00976',
    api: id => `https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00976&resourceId=RS00906&type=json&top=1000&filter=${encodeURIComponent(`project_id='${id}'`)}`,
  },
};

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'KudiTrail/1.0 (public-interest open data reader)', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "31-Oct-2026" -> "2026-10-31"
function wbDate(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s || '').trim());
  if (!m || MONTHS[m[2].toLowerCase()] == null) return null;
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()] + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function fetchRate() {
  const rows = await getJson(SOURCES.rate.api);
  const usd = rows.filter(r => /^US DOLLAR$/i.test(String(r.currency).trim()) && /^\d{4}-\d{2}-\d{2}$/.test(r.ratedate))
    .sort((a, b) => b.ratedate.localeCompare(a.ratedate))[0];
  const value = usd && num(usd.centralrate);
  if (!value || value < 100 || value > 20000) throw new Error('No sensible US dollar rate in CBN data');
  return { value: Math.round(value * 100) / 100, date: usd.ratedate };
}

async function fetchPopulation() {
  const data = await getJson(SOURCES.population.api);
  const row = Array.isArray(data) && Array.isArray(data[1]) ? data[1][0] : null;
  const value = row && num(row.value);
  if (!value || value < 150e6 || value > 400e6) throw new Error('No sensible population figure in World Bank data');
  return { value, year: String(row.date) };
}

// Latest monthly snapshot of a World Bank (IDA) loan, summed over its credits
async function fetchWorldBankLoan(projectId) {
  if (!/^P\d{6}$/.test(projectId)) throw new Error('Bad project id');
  const { data } = await getJson(SOURCES.worldbank.api(projectId));
  const rows = (data || []).filter(r => r.project_id === projectId && wbDate(r.end_of_period));
  if (!rows.length) throw new Error('No rows for ' + projectId);
  const latest = rows.map(r => wbDate(r.end_of_period)).sort().pop();
  const snap = rows.filter(r => wbDate(r.end_of_period) === latest);
  const sum = k => snap.reduce((a, r) => a + (num(r[k]) || 0), 0);
  const dates = k => snap.map(r => wbDate(r[k])).filter(Boolean).sort();
  const out = {
    projectId, asOf: latest, credits: snap.map(r => r.credit_number),
    status: snap.map(r => r.credit_status).join(', '),
    original: sum('original_principal_amount_us_'), disbursed: sum('disbursed_amount_us_'),
    undisbursed: sum('undisbursed_amount_us_'), cancelled: sum('cancelled_amount_us_'), repaid: sum('repaid_to_ida_us_'),
    owed: sum('due_to_ida_us_'),
    closingDate: dates('closed_date_most_recent').pop() || null,
    lastDisbursement: dates('last_disbursement_date').pop() || null,
    firstRepayment: dates('first_repayment_date')[0] || null,
    lastRepayment: dates('last_repayment_date').pop() || null,
    sourcePage: SOURCES.worldbank.page,
    projectPage: `https://projects.worldbank.org/en/projects-operations/project-detail/${projectId}`,
  };
  if (!(out.original > 0) || out.disbursed < 0 || out.disbursed > out.original * 1.05) throw new Error('World Bank figures failed sanity check');
  return out;
}

// Run all fetches and write data/live.json. A failed fetch keeps the last
// good value and records the error, so the site never goes blank.
async function run({ file = path.join(__dirname, '..', 'data', 'live.json'), log = console } = {}) {
  let state = { rate: null, population: null, worldbank: {}, errors: {}, lastRun: null };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (_) { /* first run */ }

  async function step(key, fn, assign) {
    try {
      const v = await fn();
      assign({ ...v, fetchedAt: new Date().toISOString() });
      delete state.errors[key];
      log.log(`  [live] ${key}: ok`);
    } catch (e) {
      state.errors[key] = { message: String(e.message || e), at: new Date().toISOString() };
      log.warn(`  [live] ${key}: ${state.errors[key].message} (keeping last good value)`);
    }
  }

  await step('rate', fetchRate, v => state.rate = v);
  await step('population', fetchPopulation, v => state.population = v);
  const projects = new Set();
  const fundsDir = path.join(__dirname, '..', 'data', 'funds');
  for (const f of fs.readdirSync(fundsDir).filter(f => f.endsWith('.json'))) {
    const fund = JSON.parse(fs.readFileSync(path.join(fundsDir, f), 'utf8'));
    if (fund.live && fund.live.worldbankProject) projects.add(fund.live.worldbankProject);
  }
  for (const p of projects) await step('worldbank:' + p, () => fetchWorldBankLoan(p), v => state.worldbank[p] = v);
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  return state;
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });

module.exports = { run, SOURCES, fetchRate, fetchPopulation, fetchWorldBankLoan, wbDate };
