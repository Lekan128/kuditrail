// Daily moderation reminder (run by .github/workflows/moderation-reminder.yml).
//
// Reads the counts that wrangler wrote to a JSON file, then keeps ONE open
// GitHub issue (label "moderation") up to date:
//   - something waiting, no issue  -> open an issue (GitHub emails the owner)
//   - more waiting than last time  -> comment, so the owner is emailed again
//   - still waiting a week or more -> a weekly nudge (Mondays)
//   - nothing waiting              -> close the issue
// The repo is public, so the issue shows COUNTS ONLY: never names, emails or text.
//
// Usage: node scripts/moderation-reminder.js counts.json
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), SITE_URL; DRY_RUN=1 to print only.
'use strict';

const fs = require('fs');

const LABEL = 'moderation';
const MARK = /<!-- waiting:(\d+) -->/;
const { GITHUB_TOKEN, GITHUB_REPOSITORY, SITE_URL = 'https://kuditrail.pages.dev', DRY_RUN } = process.env;
const owner = (GITHUB_REPOSITORY || 'owner/repo').split('/')[0];

async function gh(method, path, body) {
  if (DRY_RUN && method !== 'GET') { console.log(`[dry run] ${method} ${path}`, body ? JSON.stringify(body, null, 2) : ''); return {}; }
  if (DRY_RUN) return [];
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    method,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kuditrail-reminder' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && !(method === 'POST' && path === '/labels' && res.status === 422)) {
    throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? {} : res.json();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function main() {
  const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const row = (Array.isArray(raw) ? raw[0] : raw).results[0];
  const updates = Number(row.updates) || 0;
  const messages = Number(row.messages) || 0;
  const total = updates + messages;
  const oldestDays = row.oldest ? Math.floor((Date.now() - Date.parse(row.oldest)) / 864e5) : 0;
  console.log(`Waiting: ${updates} updates, ${messages} messages; oldest ${oldestDays} days`);

  const [issue] = await gh('GET', `/issues?labels=${LABEL}&state=open&per_page=1`);

  if (total === 0) {
    if (issue) {
      await gh('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
      console.log(`Nothing waiting; closed #${issue.number}`);
    } else console.log('Nothing waiting');
    return;
  }

  const title = `Moderation: ${plural(total, 'item')} waiting`;
  const body = [
    `**${plural(updates, 'citizen update')}** and **${plural(messages, 'message')}** (corrections, right of reply, takedown requests and others) are waiting.`,
    '',
    oldestDays >= 1 ? `The oldest has been waiting **${plural(oldestDays, 'day')}**.` : 'The oldest arrived today.',
    '',
    `Review them at ${SITE_URL}/#/admin. This issue closes by itself once nothing is waiting.`,
    '',
    '_Updated daily by the moderation reminder. Counts only: what people sent stays private._',
    `<!-- waiting:${total} -->`,
  ].join('\n');

  if (!issue) {
    await gh('POST', '/labels', { name: LABEL, color: 'd93f0b', description: 'Items waiting on the moderation page' });
    await gh('POST', '/issues', { title, body: `@${owner}\n\n${body}`, labels: [LABEL] });
    console.log('Opened a reminder issue');
    return;
  }

  const prev = Number((MARK.exec(issue.body || '') || [])[1]) || 0;
  await gh('PATCH', `/issues/${issue.number}`, { title, body: `@${owner}\n\n${body}` });
  const monday = new Date().getUTCDay() === 1;
  if (total > prev) {
    await gh('POST', `/issues/${issue.number}/comments`, { body: `@${owner} ${plural(total - prev, 'new item')} arrived. ${plural(total, 'item')} now waiting.` });
    console.log(`Commented on #${issue.number}: new items`);
  } else if (monday && oldestDays >= 7) {
    await gh('POST', `/issues/${issue.number}/comments`, { body: `@${owner} Weekly reminder: ${plural(total, 'item')} still waiting, the oldest for ${plural(oldestDays, 'day')}.` });
    console.log(`Commented on #${issue.number}: weekly reminder`);
  } else console.log(`Updated #${issue.number} quietly`);
}

main().catch(e => { console.error(e); process.exit(1); });
