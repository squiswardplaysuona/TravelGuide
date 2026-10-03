# TravelGuide — Promotion Submission Kit

Ready-to-paste materials for submitting TravelGuide to skill directories, marketplaces, and awesome lists.
Last updated: 2026-10-03 · Repo: https://github.com/squiswardplaysuona/TravelGuide

---

## 0. Core copy (paste everywhere)

**Name**: TravelGuide

**One-liner (EN)**:
> Modular AI travel agent — 1 orchestrator + 11 specialized skills that take you from a one-line request to a verified, day-by-day itinerary, and keep adjusting it while you travel.

**One-liner (中文)**:
> 模块化 AI 旅游规划 Agent：1 个主编排器 + 11 个专业 Skill，把一句话需求推进到经过事实核验、约束校验的逐日行程，旅途中持续做局部重规划。

**Short description (for forms, <300 chars)**:
> TravelGuide is a pure-Markdown agent skills suite (Agent Skills / SKILL.md format). An orchestrator coordinates 11 single-responsibility skills: request profiling, destination research, POI candidates, tourist-review analysis, weather impact, spatial/transport matrices, dining candidates, official ticket/reservation verification, day-by-day itinerary planning, independent read-only itinerary validation, and minimal-change in-trip replanning. Every fact is forced to declare source and status — unknown stays unknown, never guessed.

**Tags/keywords**: travel, itinerary, trip-planning, agent-skills, claude-code, travel-agent, markdown, validator

**Install (Claude Code plugin)**:
```bash
claude plugin marketplace add squiswardplaysuona/TravelGuide
claude plugin install travelguide@travelguide-marketplace
```

**Install (any Agent Skills platform)**:
```bash
git clone https://github.com/squiswardplaysuona/TravelGuide.git
cp -r TravelGuide/.agents/skills/* ~/.claude/skills/   # or point your platform at .agents/skills/
```

**License**: MIT

---

## 1. Anthropic community plugin marketplace (official, highest value)

- Form (individual authors): **https://platform.claude.com/plugins/submit** (also reachable via clau.de/plugin-directory-submission)
- The claude.ai form requires a Team/Enterprise org — use the Console form instead.
- **Do NOT open a PR to anthropics/claude-plugins-community** — that repo is a read-only mirror; PRs are auto-closed.
- Before submitting, validate locally (requires Claude Code CLI):
  ```bash
  claude plugin validate ./TravelGuide
  ```
  Expect `✔ Validation passed` (warnings are OK; `--strict` turns them into errors).
- After approval the plugin is pinned to a commit SHA and the public catalog syncs nightly — allow 1–2 days.
- Form fields: use the copy in §0. Category suggestion: **Productivity** or **Travel**.

---

## 2. Independent skill directories

All of these take a GitHub URL and do (semi-)automatic review. Submit in this order:

| Site | Submit URL | Notes |
|---|---|---|
| skillstore.io | https://skillstore.io/submit | Automated security analysis + admin review. Repo already has LICENSE + SKILL.md ✅ |
| SkillsMP | https://skillsmp.com | Large index; paste repo URL |
| ClaudeSkillsHub directory | https://claudeskills.info | Submission form on site; review 24–48 h; docs quality boosts ranking |
| Developers Digest Skills Marketplace | https://developersdigest.tech/submit | Lints SKILL.md frontmatter; median review < 24 h |

Tips: description field → §0 short description; tags → §0 keywords; make sure the repo's About description + topics are already set (done ✅).

---

## 3. Awesome lists (open PRs)

### 3a. hesreallyhim/awesome-claude-code

PR title: `Add TravelGuide — modular AI travel agent (12 agent skills)`

Find the appropriate category section (skills / tools) and append:

```markdown
| [TravelGuide](https://github.com/squiswardplaysuona/TravelGuide) | Modular AI travel agent: 1 orchestrator + 11 specialized skills — from a one-line request to a verified, day-by-day itinerary, with in-trip replanning. Pure SKILL.md, MIT. |
```

PR description (paste):

```markdown
## What is this?

TravelGuide is a pure-Markdown agent-skills suite (Agent Skills / SKILL.md format):
an orchestrator (`travel-guide`) coordinates 11 single-responsibility skills —
profile → research → POI candidates → review analysis → weather → routing →
dining → ticket verification → itinerary planning → validation → in-trip replanning.

- Format: standard SKILL.md (works with Claude Code, Codex, any Agent Skills loader)
- 12 skills, MIT, no runtime dependencies
- Install: `claude plugin marketplace add squiswardplaysuona/TravelGuide` or `cp -r .agents/skills/* ~/.claude/skills/`
- End-to-end demo snapshot: examples/tokyo-demo/

Checked the contribution guidelines; adding to the skills section. Happy to adjust placement/format.
```

### 3b. karanb192/awesome-claude-skills

PR title: `Add TravelGuide — travel planning skills suite (orchestrator + 11 skills)`

Add under an appropriate category (e.g. Business & Productivity, or create "Travel"):

```markdown
- [TravelGuide](https://github.com/squiswardplaysuona/TravelGuide) — Modular AI travel agent: 1 orchestrator + 11 specialized skills (research, POIs, reviews, weather, routing, dining, ticket verification, planning, validation, in-trip replanning). Pure SKILL.md, MIT.
```

Checklist per their CONTRIBUTING: working SKILL.md frontmatter ✅, clear docs ✅, actively maintained ✅, no malicious code ✅.

> Backup list if PRs stall: Chat2AnyLLM/awesome-claude-skills, lecole/awesome-claude-skills.

---

## 4. Before every submission — repo freshness check

- [ ] Latest commit pushed, Release tag current
- [ ] `skills/` in sync with `.agents/skills/` (`python scripts/sync-skills.py`)
- [ ] About description, topics, social preview all set (done 2026-10-03 ✅)

## 5. After approval

- Announce in the repo README ("Featured in …") + one social post per channel
- Watch Issues on directory sites for review feedback
