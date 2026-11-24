# KudiTrail: follow Nigeria's public money

*Kudi* means money. KudiTrail takes a loan or public fund and lets anyone follow it from the lender, through government, to the road, bridge or programme it was meant for. Each step has evidence behind it. Where the trail goes cold, the site says so.

## What's in the MVP

- **Eight real, researched funds.** All were re-checked on 19 Nov 2026:

  | Fund | What it shows |
  |---|---|
  | Abacha loot returned in 2020 ($311.8m) | Bridge finished; Abuja–Kano road partly done; Lagos–Ibadan road open but part failing |
  | China loan for the Lagos–Ibadan railway ($1.27bn) | Train running; loan still being repaid |
  | Port Harcourt refinery repair ($1.5bn) | Restarted in 2024, shut in 2025, not working steadily in 2026; spending not itemised |
  | Sukuk bond for 25 roads (₦100bn) | ₦16.67bn per zone; 15 of 25 roads identified so far |
  | World Bank loan for cash to poor families ($800m) | 93% paid out; about 10.46m households paid; no public link between payments and the loan |
  | $52.88m returned by the US in 2025 | $50m for rural electricity via the World Bank; no spending report found yet |
  | IMF COVID-19 emergency loan ($3.4bn) | Repaid; no public record of what it bought |
  | Money borrowed from the Central Bank (₦22.7trn) | No public record of what it paid for; now a 40-year debt |

- **National budget page** (`#/budget`, button on the home page). It shows the 2026 and 2025 federal budgets: the total, the amount for every Nigerian, the split (projects, debts, running the government, fixed shares set by law), and "Was it spent?" figures from the Budget Office reports. Every figure has a numbered source. The data is in `data/budget.json`.
- **Automatic updates from official data** (`live.js`). Twice a day the server fetches:
  - the US dollar rate from the Central Bank of Nigeria API;
  - Nigeria's population from the World Bank API;
  - for any fund with `"live": { "worldbankProject": "P…" }`, the loan's latest monthly figures from the World Bank's Finances One API (paid out, left to pay, paid back, repayment dates).

  Automatic figures are labelled "Updates automatically" and show their date. A failed fetch keeps the last good value, and automatic data never rewrites the checked text in the fund files. Moderators can see the status and press "Refresh now" at `#/admin`.
- **Plain language first.** Every fund and every step has an "In simple words" line. Dollar amounts also show a naira equivalent and "≈ ₦X for every Nigerian", using the rate and population in `data/settings.json`. Update those values now and then.
- **Two ways to follow the money:** a **step-by-step list** (the default on phones) and an **interactive flow diagram** (the default on laptops). Each visitor's choice is remembered.
- **Interactive flow diagram.** Drag to pan, scroll or pinch to zoom, drag boxes to rearrange, tap a box for details. Ribbon thickness is proportional to the money. Pages deep-link to a box, e.g. `#/fund/abacha-loot-2020/p-lie`.
- **Clarity labels on every step.** *Documented* (official source), *Reported* (credible media), *Unclear* (no public record found, shown hatched with a "?"), *Not yet itemised*. Each fund card shows a bar of how much of the money can be traced.
- **One-click evidence** for every box and fund. The list shows source type (official, document, dataset, news) with Open and Download buttons.
- **Citizen updates.** People can send what they see on the ground: status, location, date, text, links and a photo. Photos are re-encoded on the device so GPS/EXIF data is removed. **Nothing is published until a moderator approves it.**
- **Legal protection:** a disclaimer page, a notice on every fund page, a contact form for corrections, right of reply and takedown requests (each gets a reference number), and an "as of" date on every fund.
- **Moderation dashboard** at `#/admin` to approve, reject or delete updates and to work through contact messages.

## Design system

KudiTrail's promise is that anyone with a phone can open any page and, within one minute, say where the money went, what state it is in, and how we know. The rules behind that promise are:
- answer first;
- plain words;
- numbers people can feel ("for every Nigerian", "out of every ₦100");
- charts whose headline states the message;
- honesty about gaps;
- proof one tap away;
- fast on any phone;
- accessible.

The full rules, with the research behind them and examples of where others use them, are in [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md). The live reference, built from the real components, is at `/#/design` (linked in the footer).

## Hosting plan (free)

Only what people send in (citizen updates, contact messages and photos) needs a database. Everything else can be static files.

- **Cloudflare Pages:** the site and the fund and budget data, on a global CDN.
- **Pages Functions:** the API for the forms.
- **D1:** a free SQLite database for updates and messages.
- **R2:** photo storage.
- **GitHub Actions:** a job twice a day that fetches the official figures (CBN, World Bank) and commits them, so every automatic change is recorded in git.

Free-plan limits (Cloudflare docs, Nov 2026):
- Workers: 100,000 requests a day.
- D1: 5 million rows read and 100,000 written a day, with 5 GB of storage.
- R2: 10 GB of storage.

## Run it

You need Node 18 or newer. There are no dependencies, so no `npm install` is needed.

```bash
npm start                 # http://localhost:3000
PORT=8080 npm start       # another port
```

The admin token prints in the console and is saved to `data/store/.admin-token`. Use it at `/#/admin`.

| Env var | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `ADMIN_TOKEN` | Set your own moderator token (recommended in production) |
| `CONTACT_EMAIL` | Email shown for legal notices (default is a placeholder) |
| `STORE_DIR` | Where submissions are stored (default `data/store`) |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy, so rate limiting uses `X-Forwarded-For` |
| `LIVE_UPDATES` | Set to `0` to turn off automatic fetching (then `data/settings.json` values are used) |

## Add or edit a fund

Each fund is one JSON file in `data/funds/`. Run `npm run check` to validate the files and run the evidence audit, then restart the server (or `POST /api/admin/reload` with the admin token).

```jsonc
{
  "id": "my-fund", "title": "…", "category": "Foreign loans", "source": "…",
  "amount": 1000000, "currency": "USD",          // or NGN
  "date": "2024-01-31", "asOf": "2026-11-01",    // asOf = when you last checked
  "order": 1,                                     // position on the home page
  "status": "ongoing",
  "simple": "One or two plain sentences anyone can understand.",
  "verdict": [                                    // the 3-second answer shown first on cards and fund pages
    { "tone": "good|progress|bad|unknown|neutral", "text": "Bridge: finished" }   // tone picks the symbol: ✅ ⏳ ⚠️ ❓ ℹ️
  ],
  "summary": "The fuller, more precise version.",
  "gaps": ["What we couldn't find…"],
  "timeline": [{ "date": "2024-01", "text": "…", "evidence": [0] }],  // indexes into evidence[]
  "evidence": [{ "title": "…", "publisher": "…", "type": "official|document|dataset|news|reference", "url": "https://…" }],
  "nodes": [{
    "id": "x", "type": "source|government|agency|contractor|allocation|project|section|outcome",
    "label": "…", "simple": "Plain one-liner", "location": "…", "description": "Full detail",
    "status": "passed_on|completed|operational|ongoing|stalled|defects|under_review|disbursed|not_disbursed|repaid|unclear|pending_data",
    "clarity": "documented|reported|unclear|pending",
    "amountDisclosed": false,                      // optional: the split isn't published
    "evidence": [ … ]
  }],
  "links": [{ "from": "x", "to": "y", "amount": 1000000, "estimated": true }]
}
```

Boxes with no outgoing link are **end points**, where the trail stops. If a split isn't published, give the link an equal-share amount with `"estimated": true` and set `"amountDisclosed": false` on the child.

**Editorial rules (please keep them):** write `simple` lines for someone who never reads business news, with no jargon. link a source for every claim. Use "reported" or "alleged" wording for anything that is not a court finding. Describe projects, not people. Update `asOf` whenever you re-check a fund.

`scripts/audit.js` fails if any of these is true:
- a fund step or timeline entry has no source;
- a budget figure or statement has no source;
- a budget split does not add up to its total.

To update the budget page, edit `data/budget.json`. Add a new year at the top of `years`, and run `npm run check`.

## Structure

```
server.js            Node http server: static files, JSON API, moderation, photo handling
live.js              Automatic updates from official APIs (CBN, World Bank)
data/budget.json     National budget page data
data/funds/*.json    Fund data (the editorial content)
data/store/          Runtime data: submissions, contacts, uploads (git-ignored)
public/index.html    App shell
public/app.js        Pages, routing, modals, forms (vanilla JS)
public/flow.js       Custom pan/zoom/drag Sankey flow graph (no libraries)
public/styles.css    Styles, light and dark mode, mobile bottom-sheet panel
```

API: `GET /api/budget`, `GET /api/funds`, `GET /api/funds/:id`, `GET /api/updates?fund=`, `POST /api/updates`, `POST /api/contact`, `GET /api/photo/:id`, plus `/api/admin/*` (requires the `x-admin-token` header).

## Before a public launch

1. **Have a Nigerian lawyer review** the disclaimer, the terms and the wording on the Ways & Means and Abacha pages.
2. Set `ADMIN_TOKEN` and a real `CONTACT_EMAIL`, and serve over HTTPS behind a proxy (`TRUST_PROXY=1`).
3. Re-verify each fund's figures and links, and update `asOf`.
4. Back up `data/store/`. For larger scale, move it to a database such as SQLite or Postgres and move uploads to object storage.

## Roadmap ideas

- More automatic sources: AfDB loans (via IATI), and IMF lending to Nigeria. Open Treasury, the Budget Office and the DMO publish PDFs and spreadsheets, not APIs, so they need a person (or a carefully checked parser) to update.
- Map view of projects, and "follow" a project for alerts.
- Itemise the 25 Sukuk roads and the later Sukuk issues (2018–2024).
- Hausa, Yoruba, Igbo and Pidgin translations.
