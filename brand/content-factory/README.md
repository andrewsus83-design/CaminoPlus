# Content Plan Factory

A repeatable system to plan, make and publish CaminoPlus social content every month, with the same quality whoever makes it (you, a freelancer, or an AI assistant).

```
 1. Monthly plan   →  2. Briefs   →  3. Produce   →  4. QA   →  5. Schedule   →  6. Review
 (pillars × cadence)   (1 per post)   (templates)    (checklist)  (Meta / TikTok)   (metrics → next month)
```

Platforms: **Instagram** (main), **TikTok**, **Facebook** (core), **Pinterest**, **YouTube Shorts**, **Threads** (growth, mostly reused content), **X**, **WhatsApp Channel** (optional). Playbook per platform: [`platforms.md`](platforms.md). Language: **English**.

---

## Step 1 · Monthly plan (1 to 2 hours, last week of the month)

1. Copy [`content-plan-template.csv`](content-plan-template.csv) to a new sheet named `plan-YYYY-MM`.
2. Check the calendar in [`pillars-and-formats.md`](pillars-and-formats.md#seasonality): what season is it on the Camino, which holidays and dates fall this month.
3. Fill the slots using the **weekly cadence** (same file). Each slot = one pillar + one format.
4. Keep the pillar mix: Inspire 30%, Guide 30%, Product 20%, Community 15%, Culture 5% (can move ±5%).
5. Pick 1 **hero topic** for the month (for example "Choosing your route" or "Galicia in the rain"). At least 4 posts support it.
6. For each slot write a working title and the hook in one line.

## Step 2 · Brief (5 minutes per post)

Fill the **Post brief** in [`templates.md`](templates.md#1-post-brief) in the sheet columns. A brief is ready when it has: goal, persona, pillar, format, hook, key message, CTA, visual source.

## Step 3 · Produce

- Captions: caption formulas in [`templates.md`](templates.md#3-caption-formulas).
- Video: script templates in [`templates.md`](templates.md#4-reel--tiktok-scripts).
- Carousels: slide template in [`templates.md`](templates.md#5-carousel-template).
- Images: real photo or UGC first; otherwise AI with the prompt builder in [`templates.md`](templates.md#6-ai-image-prompt-builder).
- Design: Canva (or Figma) with the brand kit: 4 fonts, 8 colours, logo files, the 5 series layouts from the [Brand Guideline](../BRAND_GUIDELINE.md#7-layout-for-social).

**Batching** saves the most time: one session to write all captions of the week, one to design, one to edit video.

**Repurpose every hero piece** (1 idea → 5 posts):

| From | Into |
|---|---|
| 1 Tip carousel (IG) | 1 TikTok "list" video · 1 FB post with the same list · 3 Stories (one tip each, with a poll) |
| 1 Reel | Same video on TikTok (re-upload without watermark) and FB Reels · cover frame as a Story |
| 1 Stage Card | Pin to a "Stages" Highlight · 2:3 Pinterest pin · reuse inside a "Route guide" carousel later |

Full map across all platforms: [`platforms.md`](platforms.md#repurpose-map-1-piece--many-platforms).

## Step 4 · QA

Every post passes [`qa-checklist.md`](qa-checklist.md). Set the sheet status to `ready` only after it passes.

## Step 5 · Schedule

- Instagram + Facebook: Meta Business Suite (free). TikTok: TikTok Studio scheduler (free). Pinterest and YouTube: their own schedulers (free). Threads/X: native scheduling. Or one paid tool for all (Buffer, Later, Metricool).
- Best first-guess times (test and adjust): 07:00 to 09:00 and 18:00 to 21:00 in the audience time zone. Main audiences: US/Canada, UK/Ireland, Germany, Spain, Australia, Korea. Start with Europe evening (19:00 CET) + US morning (09:00 ET), then use your own insights after 4 weeks.
- Status in sheet: `idea → brief → in production → ready → scheduled → published`.

## Step 6 · Review (30 minutes, every Monday + monthly)

Weekly: note the top 2 and bottom 2 posts in the sheet `notes` column.

Monthly, fill this table and change next month's plan:

| Metric | What it tells us | Target first 3 months |
|---|---|---|
| Saves per post (IG) | Usefulness | ≥ 2% of reach on Guide posts |
| Shares / sends | Word of mouth | ≥ 1% of reach |
| 3-second hold / avg watch % (Reels, TikTok) | Hook strength | ≥ 60% hold, ≥ 35% avg watch |
| Follower growth | Overall | +10 to 20% per month |
| Link clicks / "Notify me" sign-ups | Business result | Track weekly, grow month on month |

Rules of thumb: a format that wins 3 times gets more slots; a format that loses 3 times gets changed or dropped. Keep the pillar mix even if one pillar wins.

---

## Using an AI assistant as the factory

Paste this into Claude (or another assistant) with the brand guideline and templates attached:

```
You are the social media producer for CaminoPlus. Follow BRAND_GUIDELINE.md and the
templates in templates.md exactly. Plan [MONTH YEAR] for Instagram, TikTok and Facebook
using the weekly cadence and pillar mix in pillars-and-formats.md.
Hero topic: [TOPIC]. Key dates: [DATES]. App status: [pre-launch / live on iOS / ...].
Output a CSV with the columns of content-plan-template.csv, one row per post,
with a full caption, hashtags, on-image text and an AI image prompt (if no real photo).
Mark every distance with "~". Do not invent features, prices, reviews or statistics.
```

Then a human checks every row against the QA checklist. The AI drafts, a person approves.

---

## Content bank (always keep stocked)

Keep a shared folder `content-bank/` (Google Drive or the project files) with:

- `photos-real/` — own photos and permitted UGC (with permission screenshot)
- `photos-ai/` — approved AI images, file name ends with `-ai`
- `screens/` — app screens (copy from `web/assets/screens/`)
- `video-broll/` — clips: steps, arrows, rain, bells, cafés, credencial stamping
- `sounds/` — ambient recordings
- `ideas.md` — any idea, any time; review in Step 1
