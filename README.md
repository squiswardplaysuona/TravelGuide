<div align="center">

# TravelGuide

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-12-8A2BE2.svg)](.agents/skills)
[![Format](https://img.shields.io/badge/Format-SKILL.md-orange.svg)](https://agentskills.io)
[![Stars](https://img.shields.io/github/stars/squiswardplaysuona/TravelGuide?style=social)](https://github.com/squiswardplaysuona/TravelGuide/stargazers)

**English** | [简体中文](README.zh-CN.md)

A modular AI travel agent: **1 orchestrator + 11 specialized skills** that take you from a one-line request to a **verified, day-by-day itinerary** — and keep adjusting it while you travel.

> TravelGuide provides fact-checked, constraint-validated itinerary drafts and decision support — it never promises "the best trip". The final decision is always yours.

</div>

## How it works

```
request profile → destination research → POI candidates → review analysis → weather
→ spatial/transport → dining → tickets/reservations → itinerary planning
→ itinerary validation → in-trip local replanning
```

Each stage is a standalone skill with a single responsibility, connected through structured JSON assets in `plan/`:

```
plan/profile.json → research.json → candidates.json → review-analysis.json
→ weather.json → map-route.json → food-restaurant.json → ticket-reservation.json
→ itinerary.json → validation.json → copilot.json
```

These are **runtime assets regenerated for every trip**, not a static database.

## Architecture

```
travel-guide (orchestrator)
├── travel-profile        request normalization → traveler profile
├── web-research          destination research + official source registry
├── poi-attraction        attraction/activity candidate pool
├── review-analysis       tourist review & experience profiling
├── weather               weather & weather-impact analysis
├── map-route             spatial clustering & transport time matrices
├── food-restaurant       dining candidate pool
├── ticket-reservation    official verification of hours/prices/booking rules
├── itinerary-planner     day-by-day draft itinerary
├── trip-validator        independent read-only itinerary validation
└── travel-copilot        minimal-change in-trip replanning
```

- `travel-guide` is the orchestrator: it decomposes the task, dispatches sub-skills, cross-checks results, and organizes user decisions.
- `itinerary-planner` produces a **draft**; `trip-validator` independently validates it (**error = 0 or it doesn't ship**); `travel-copilot` makes only **local** adjustments mid-trip (Minimal Change Principle).

## Quick Start

No Python / Node / npm / pip. **Pure Markdown skills** — you only need an agent platform that can discover and execute `SKILL.md` files and browse the web.

```bash
# 1. Clone the repo
git clone https://github.com/squiswardplaysuona/TravelGuide.git
cd TravelGuide

# 2. Open your agent in this project root and just ask in natural language, e.g.:
#    "Two of us, early December, 5 days in Kyoto from Shanghai, we love temples
#     and photography — build the itinerary."

# Optional: install the skills for your platform (Agent Skills / Claude Code style)
#   per-user:    cp -r .agents/skills/* ~/.claude/skills/
#   per-project: cp -r .agents/skills/* .claude/skills/
```

Tested end-to-end on ZCode; any platform that loads `SKILL.md` files (Claude Code, Codex, etc.) can run them — point it at `.agents/skills/` or copy the folders into your platform's skills directory. Note: the skills read/write `plan/*.json` relative to the working directory, so run from a project root.

## What you get

Every fact in the output is forced to declare its source and status — **unknown stays unknown, never guessed**:

- `FACT` (official-source confirmed) is strictly separated from `EXPERIENCE` (tourist reviews, never written into fact fields);
- fact states: `preliminary` → `official_confirmed` / `unverified` / `conflict` / `unavailable`;
- user preferences vs. system defaults are recorded separately (`user_provided` / `assumed`), and assumptions are always explicit and correctable.

## Tokyo Demo

[`examples/tokyo-demo/`](examples/tokyo-demo/) is a **complete end-to-end Tokyo snapshot** (2026-08-30, 11 assets + notes) covering every stage above.

⚠️ Weather, prices, opening hours, reservations, reviews, transport and availability in the snapshot are **time-sensitive** — it is not "current Tokyo advice". For a real trip, re-run the dynamic skills (research, weather, tickets).

## Safety / Limitations

- TravelGuide is **not a travel-insurance or safety authority**; it only relays official advisories, judgment stays with you.
- Long-range weather is historical-climate reference, **not a forecast**; refresh near-term forecasts close to the trip.
- Availability, prices and opening hours change in real time — a snapshot is not availability.
- Tourist reviews are **not a random sample**; review analysis describes experience patterns only.
- Third-party sites may be login-walled or anti-crawled — the system degrades and honestly marks `unverified` instead of inventing data.
- Research skills need a networked agent platform; offline they can't work.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Particularly useful: new end-to-end demo snapshots (different cities/platforms), i18n of skill descriptions, and platform-compatibility reports.

## License

[MIT](LICENSE). Third-party website content, reviews, trademarks and external data remain the property of their respective owners — references here are for research purposes only.

---

<div align="center">

If TravelGuide saved you a trip-planning headache, **drop a ⭐** — it genuinely helps other travelers and agent developers find it.

</div>
