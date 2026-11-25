# KudiTrail design system

**The promise:** anyone with a phone can open any page and, within one minute, say:
1. where the money went;
2. what state it is in now;
3. how we know.

That is the value of KudiTrail: complex public finance, distilled.

This document gives the rules and the research behind them. The live version, with the real components rendered by the site's own code, is at **`/#/design`**. Tokens live at the top of `public/styles.css`, and components are in `public/app.js` under "Design system components".

---

## 1. What we studied

| Source | What it is | What we took from it |
|---|---|---|
| [GOV.UK: Use clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/) | The UK government's writing standard for every public page | Plain English is mandatory. Split sentences over 25 words. Keep paragraphs to 5 sentences or fewer. Prefer short words ("buy", not "purchase"). Explain specialist terms the first time. |
| [GOV.UK style guide](https://www.gov.uk/guidance/style-guide) | House style for numbers, dates and money | Always write million and billion in full for money (£138 billion). We extend this to trillion. |
| [NN/g: Show numbers as numerals](https://www.nngroup.com/articles/web-writing-show-numbers-as-numerals/) | Eyetracking research on how people read numbers online | Use digits: they stop the scanning eye. Explain very large units such as trillions for general audiences. |
| [NN/g: Mobile content](https://www.nngroup.com/articles/mobile-content/) and [Defer secondary content](https://www.nngroup.com/articles/defer-secondary-content-for-mobile/) | Research on reading on phones (276 participants) | Reading on a phone is not worse for easy text, but difficult text slows people down. Keep pages short, show what matters first, and put secondary detail one tap away. |
| [UK Government Analysis Function: charts](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts), [checklist](https://analysisfunction.civilservice.gov.uk/policy-store/charts-a-checklist), [colours](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-colours-in-charts) | The UK civil service standard for statistical charts | See the list after this table. We also use its accessible colour palette. |
| [Datawrapper Academy: annotations](https://www.datawrapper.de/academy/annotate-tab) | Practical chart-writing advice from a chart tool used by newsrooms | Make the title the one statement the reader should remember. |
| [FT Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md) | The Financial Times' chart chooser | Choose the chart by the relationship you want to show: part of a whole, ranking, change over time or flow. |
| [Barrio, Goldstein & Hofman, CHI 2016](https://www.microsoft.com/en-us/research/publication/improving-comprehension-of-numbers-in-the-news/) | Microsoft Research experiments with over 3,200 people | Adding a perspective to a big number ("that is about … for every person") helps people understand it, and follow-up work found the effect lasts for weeks. This is why every amount says what it means for one Nigerian. |
| [Galesic, Garcia-Retamero & Gigerenzer, 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2775772) | Experiments on icon arrays (grids of small symbols) | Icon arrays improved accuracy for people with both low and high numeracy. This is why we show "out of every ₦100" as a 10 × 10 grid. |
| [IBP: The Power of Making It Simple (2012)](https://internationalbudget.org/wp-content/uploads/Citizen-Budget-Guide.pdf) | The International Budget Partnership's guide for governments writing Citizens Budgets | A citizens' budget is a simpler, less technical version of the budget. It covers its content, how to spread it and how to evaluate it. |
| [Budget Office of the Federation: Citizen's Guide to the Budget](https://budgetoffice.gov.ng/) | Nigeria's own simplified budget, published every year since 2009 ([OGP](https://www.opengovpartnership.org/members/nigeria/commitments/NG0031/)) | Uses the same vocabulary as the official reports, so our plain words map to them (see the glossary). |
| [BudgIT Tracka](https://budgit.org/our_programs/tracka/) | A Nigerian civic tool that tracks government projects in communities | Summarises the budget in simple terms per project. Trained officers verify citizen feedback before acting on it, which is the model for our moderated citizen updates. |
| [GAO on USAspending.gov](https://www.gao.gov/products/gao-22-104127) and [GAO-19-72](https://www.gao.gov/products/gao-19-72) | US audits of the federal spending website | Treasury did more than 150 user interviews and shows plain-language definitions next to official ones. GAO recommended making data limitations more prominent, which is why we have "What we could not find" on every page. |
| [Alex Russell: real-world performance budgets](https://infrequently.org/2017/10/can-you-afford-it-real-world-web-performance-budgets/) | Performance engineering for cheap phones on slow networks | About 130–170 KB of critical resources for a 5-second load on a cheap Android phone on slow 3G. |
| [Statcounter: Nigeria mobile vs desktop](https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/nigeria) | Web traffic by device | Phones carry most of Nigeria's web traffic: 53–75% across 2026, depending on the month. |

The Analysis Function chart rules we follow:
- A headline title that states the message, plus a subtitle that says what is shown, where and when.
- Bar charts start at zero.
- No more than 4 categories in stacked bars.
- Label directly instead of using a legend.
- Never rely on colour alone.
- Contrast of 3:1 for graphics and 4.5:1 for text.
- Every chart has a text or table alternative.
- No 3D or dual axes.
- "A well structured table can often be as powerful as a chart."

---

## 2. Principles

1. **Answer first.** Every page opens with the answer in one or two lines: the answer list (✅ ⏳ ⚠️ ❓). Detail comes after it, or behind a tap.
2. **One thing at a time.** Show what most people need. Put the rest under "More about this" sections that open on a tap.
3. **Plain words.** Everyday words first, the official term after it ("Paying debts (official term: debt service)"). Keep sentences under 25 words and paragraphs to 5 sentences or fewer.
4. **Numbers people can feel.**
   - Use digits, and write million, billion and trillion in full.
   - Always add what the amount means for one person, or "out of every ₦100".
   - Give percentages in everyday words too ("about half").
5. **Charts that say the answer.** The headline states the message. Bars start at zero, with 4 colours at most. Labels go on the chart. The numbers are always available as a table.
6. **Honest about gaps.** Every page says:
   - what we could not find;
   - how sure we are (official record, news reports, no public record, not listed yet);
   - when a person last checked it, or that it updates automatically.

   Missing proof is never presented as proof of wrongdoing.
7. **Proof one tap away.** Every statement and number has a Source button that opens exactly the documents behind it.
8. **Fast on any phone.** No web fonts, no frameworks, no tracking. The whole app must stay under 100 KB compressed; `npm run check` enforces this, and it is 42 KB today.
9. **Everyone can use it.**
   - Meet WCAG 2.2 AA.
   - Text contrast is at least 4.5:1 and graphics at least 3:1.
   - Never use colour alone; there is always a symbol or text as well.
   - Main buttons are at least 44px tall, and small inline buttons at least 28px.
   - Focus is always visible, and every theme has light and dark versions.

---

## 3. Writing rules

- Write for someone who never reads business news. Aim for a reading age of about 9.
- Put the important words first in headings, list items and buttons.
- Use "we" for KudiTrail and "you" for the reader, with active verbs.
- Unless a court has decided, use "reported", "alleged" or "under investigation". Describe projects, not people.
- Write dates as 17 April 2026, or 17 Apr 2026 where space is tight.
- Money: ₦68.32 trillion, $311.8 million.
  - Use ₦, never "N".
  - In body text, never use trn, bn or m. Source titles keep their original wording.
- Percentages: give the number and the words, for example "55%. That is about half." `plainShare()` produces the words.

| Do | Don't |
|---|---|
| Paying debts (official term: debt service) | Debt service |
| ₦68.32 trillion | ₦68.32trn, N68,320,000,000,000 |
| ₦5.08 trillion of the ₦9.22 trillion planned. That is about half. | 55.09% revenue performance against prorated projection |
| We found no public record of where this money went. | The money was diverted. (Only a court can say that.) |
| Almost half is planned for projects | Budget composition by economic classification |

**Glossary** (we say → official term), defined in `GLOSSARY` in `app.js`:
- Projects → capital expenditure
- Paying debts → debt service
- Running the government → recurrent (non-debt) expenditure
- Fixed shares set by law → statutory transfers
- The budget law → Appropriation Act
- Ministries and agencies → MDAs
- Released → cash release / warrant
- Paid out → disbursed
- Money collected → revenue
- The gap to borrow → deficit
- Extended → budget extension or rollover

---

## 4. Components

All components are plain functions in `public/app.js`. They return DOM nodes and never use `innerHTML` for data.

| Component | Use it for | Rules |
|---|---|---|
| `verdictList(items, 'big')` | The 3-second answer at the top of a page | 1–4 lines. Tone sets the symbol and colour: good ✅, progress ⏳, bad ⚠️, unknown ❓, neutral ℹ️. |
| `figure({label, value, context, note})` | One big number | The value is written in words. `context` says what it means for one person. |
| `per100(parts)` | Part of a whole ("out of every ₦100") | 4 parts at most. The 10 × 10 grid fills in list order. Shares always add up to exactly 100 (largest-remainder rounding). |
| `budgetTree(root, {onOpen, wide, open})` | Money split into parts | A real tree: the total on top, its parts below, joined by lines. Every box shows **Planned** and **Spent** (or **Came in**) as two labelled bars with amounts, plus its share of the box above. Only boxes that got less than half of their plan turn orange and get ⚠️. On phones it is one box per line, with the trunk down the left. The budget page shows only the main parts, and tapping one opens the explorer (`#/budget/tree`). There the whole tree sits on a canvas you drag and zoom, rows hold at most 4 boxes, tapping a box opens its parts underneath in a panel with a green line from the box, and the opened path is kept in the address. |
| `planBars(root, {chipFor, infoOf})` | The second version of the budget chart ("Bars" switch) | One bar row per part: grey is planned and dark is spent, on one scale. Kept so the two versions can be compared. Remove whichever loses. |
| `pva(rows)` | Plan against actual, or a ranking | Bars start at zero, and the text under each bar says it in words. |
| `chartBlock({headline, sub, visual, table})` | Any chart | The headline states the message, and "See the numbers as a table" is always there. |
| `sourceChip(evidence[], about)` | Proof for one statement | Labelled "Source" or "2 sources", at least 28px tall, and opens only those sources. |
| `stamp({auto, date})` | Freshness | "Checked by a person · last checked …" or "Updates automatically · last updated …". |
| `clarityTag`, `pill` | How sure we are; where it stands | Colour always comes with a text label. |
| Gap card (`.gaps li`) | Something we could not find | Says plainly what is missing, never what it implies. |
| Fund tree, steps list and flow diagram | The money trail | The Tree is the default: the money on top, each step below it, a Source button on every box, and a tap on an end box opens its details. A run of single steps goes straight down. The tree only branches, inside a panel, where the money splits. A step that got money from two places shows under each of them. |
| Steps list and flow diagram | The money trail, other views | Steps are a simple list; the diagram can be dragged and zoomed. When a step splits more than 2 ways, its cards drop the description (it is in the details panel). |

| `balance(rows)` | The "so what" at the top of a page | Reads like a bank statement: label on the left, amount on the right. The budget shows Budget, Came in, Spent and Left over. A fund shows The money, then (for World Bank loans) Paid out, Still to be paid out and Paid back, then "Where it ended up" by how sure we are. The home page shows all the money we follow, the same way. Rows can carry a Source button and a coloured dot that matches a bar elsewhere. Keep it to one screen on a phone. |
| `answerList(items)` | The short answer | Shows the most important line. The rest sit under "N more", one tap away. |

### Page shape: short answer, one chart, Go further

Every data page has the same three layers, so people always know where to look:

1. **The balance and the short answer.** `balance()` first, then one answer line, with the rest under "N more" (`answerList`). On a phone, the main picture must start on the first screen.
2. **One main chart**, with a headline that states the message. On the budget page this is `planBars`. On a fund page it is the money trail.
3. **Go further.** Everything else sits in closed sections that open on a tap: the whole-year plan, every number as a table, what we could not find, words used, sources and how to check it yourself.

Don't add switches that change what a chart shows (such as spent or planned). If two things need comparing, put them in the same chart. For now the budget page also has a Tree/Bars switch while we choose between the two versions.

Read-only data (budget, funds, settings) is kept in memory once loaded, and the API lets phones cache it for 5 minutes, so changing the year or going back doesn't need the network.

---

## 5. Foundations (tokens in `public/styles.css`)

**Colour**
- Meaning colours: `--tone-good`, `--tone-progress`, `--tone-bad`, `--tone-unknown`, `--tone-neutral`.
- Chart colours, in order: `--chart-1` #12436D, `--chart-2` #28A197, `--chart-3` #801650, `--chart-4` #F46A25. These are the Analysis Function's accessible categorical palette, with lighter versions for dark mode.
- Brand: `--brand` #0B6E4F.

**Type**
- System fonts only, so nothing downloads.
- Scale: `--fs-xs` .82rem, `--fs-sm` .92rem, `--fs-base` 1rem (16px, 1.55 line height), `--fs-md` 1.125rem, `--fs-lg` 1.35rem, `--fs-xl` 1.75rem, `--fs-2xl` page titles, `--fs-figure` big numbers.
- Line length is at most 68 characters (`--measure`).

**Space:** `--sp-1` to `--sp-7` = 4, 8, 12, 16, 24, 32 and 48px.

**Touch:** `--tap` is 44px and `--tap-min` is 28px.

---

## 6. How these ideas were implemented elsewhere

- **GOV.UK** turned its content rules into a published design system: components, patterns and a style guide that every department uses. The lesson is to write the rules down, ship them as code, and keep a live reference. That is our `#/design` page.
- **UK Government Analysis Function** ships its chart rules as a checklist and an R package (afcharts), so the rules are applied automatically. We do the same with `chartBlock`, `per100` and the audit.
- **USAspending.gov** shows plain-language definitions beside the official ones, and Treasury's design came from user research with more than 150 interviews. GAO later asked Treasury to make data limits more prominent. We show the official term in brackets and a "What we could not find" section on every page.
- **BudgIT Tracka** summarises the budget per community and has trained officers verify citizen reports before acting. Our citizen updates are moderated before publishing for the same reason.
- **Nigeria's Budget Office** has published a yearly Citizen's Guide since 2009, so our plain words map to its terms.
- **Microsoft Research's "perspectives"** work put numbers in human terms in news articles. Our per-person figures and "out of every ₦100" follow it.

---

## 7. Testing

**The one-minute test.** Give the page to 5 people on their own phones and ask:
1. Where did the money go?
2. What state is it in now?
3. How do we know?

If anyone can't answer within 60 seconds, change the page and test again.

Also check every page:
- on a slow 3G connection;
- in dark mode;
- with text made larger;
- with a screen reader (VoiceOver or TalkBack).

**Automatic checks** (`npm run check`):
- every step, timeline entry and budget figure has a source;
- budget splits add up to their totals;
- the app stays under 100 KB compressed.
