<div align="center">

# TravelGuide

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-12-8A2BE2.svg)](.agents/skills)
[![Format](https://img.shields.io/badge/Format-SKILL.md-orange.svg)](https://agentskills.io)
[![Stars](https://img.shields.io/github/stars/squiswardplaysuona/TravelGuide?style=social)](https://github.com/squiswardplaysuona/TravelGuide/stargazers)

[English](README.md) | **简体中文**

一个由 **主 Agent（travel-guide）+ 11 个专业子 Skill** 构成的模块化旅游规划 Agent。
它把一次旅行从"一句话需求"推进到"经过验证的逐日行程"，并在旅途中持续做局部调整。

> TravelGuide 提供的是经过事实核验与约束检查的行程草案与决策支持——它不承诺"最佳旅行"，最终决策始终属于用户。

</div>

## 核心能力（Pipeline）

```
需求画像 → 目的地研究 → POI 候选 → 游客体验分析 → 天气
→ 空间/交通 → 餐饮 → 票务/预约 → 行程规划 → 行程验证 → 旅行中局部重规划
```

每个环节都是一个单一职责的独立 Skill，通过 `plan/` 中的结构化 JSON 资产衔接：

```
plan/profile.json → research.json → candidates.json → review-analysis.json
→ weather.json → map-route.json → food-restaurant.json → ticket-reservation.json
→ itinerary.json → validation.json → copilot.json
```

这些是**运行时资产，每次新旅行都会重新生成**，不是静态数据库。

## 架构

```
travel-guide（orchestrator，主编排器）
├── travel-profile        需求画像
├── web-research          目的地基础研究
├── poi-attraction        景点候选
├── review-analysis       游客体验画像
├── weather               天气与天气影响
├── map-route             空间与交通矩阵
├── food-restaurant       餐饮候选
├── ticket-reservation    票务/预约事实核验
├── itinerary-planner     行程草案
├── trip-validator        行程独立验证
└── travel-copilot        旅行中局部调整
```

- `travel-guide` 是总编排器：拆解任务、调度子 Skill、汇总核对、组织用户决策。
- `itinerary-planner` 生成 **draft** 行程；`trip-validator` 独立验证（**error=0 才允许交付**）；`travel-copilot` 只在旅行中做**局部**调整（最小变更原则）。

## Quick Start

纯 Skill / Markdown 驱动：没有 Python / Node / npm / pip 依赖，只需要一个能发现并执行 `SKILL.md` 的 Agent 平台，以及联网搜索能力。

```bash
# 1. 克隆仓库
git clone https://github.com/squiswardplaysuona/TravelGuide.git
cd TravelGuide

# 2. 在项目根目录打开你的 Agent，用自然语言直接发起，例如：
#    "12 月初两个人从上海去京都 5 天，喜欢寺庙和摄影，帮我做个行程"

# 可选：把 Skill 安装到平台级目录（Agent Skills / Claude Code 风格）
#   用户级：    cp -r .agents/skills/* ~/.claude/skills/
#   项目级：    cp -r .agents/skills/* .claude/skills/
```

已在 ZCode 上完成全部真实运行测试；任何能加载 `SKILL.md` 的平台（Claude Code、Codex 等）都可运行——把平台指向 `.agents/skills/`，或将 Skill 文件夹复制到对应 skills 目录。注意：Skill 以相对路径读写 `plan/*.json`，请从项目根目录运行。

## 数据可信度

系统对每一条事实强制区分来源与状态，**未知就明确未知，不用猜测填满结果**：

- `FACT`（官方来源确认）与 `EXPERIENCE`（游客评论，永不写入事实字段）严格分离；
- 事实状态机：`preliminary`（仅第三方线索）/ `official_confirmed`（官方确认）/ `unverified` / `conflict` / `unavailable`；
- 用户偏好与系统默认值分开记录（`user_provided` / `assumed`），假设永远显式可纠正。

## Tokyo Demo

[`examples/tokyo-demo/`](examples/tokyo-demo/) 是 **2026-08-30 生成的完整东京端到端演示快照**（11 份资产 + 说明），覆盖上述全部环节。

⚠️ 其中**天气、票价、营业时间、预约、评论、交通、availability 均具有时效性**——它不是"当前东京最新攻略"。用于真实旅行时，必须重新运行研究、天气、票务/预约等动态 Skill。

## Safety / Limitations

- TravelGuide **不是旅行保险/安全机构**；官方安全提醒与预警由用户自行判断，系统只传递事实。
- 远期天气只有历史气候参考意义，**不能当作确定预测**；逐日预报需临近刷新。
- 预约库存、票价、营业时间**实时变化**，快照不等于可用性。
- 游客评论**不是随机样本**，评论分析只描述体验模式。
- 第三方网站可能登录墙/反爬/不可访问——系统会降级并如实标注 `unverified`，而不是编造。
- 部分功能依赖 Agent 平台的联网能力；离线环境下调研类 Skill 无法工作。

## 参与/贡献

欢迎 Issue 与 PR，见 [CONTRIBUTING.md](CONTRIBUTING.md)。特别欢迎：新城市的端到端 demo 快照、Skill 描述的多语言化、各平台兼容性反馈。

## License

[MIT](LICENSE)。第三方网站内容、评论内容、商标及外部来源数据仍属于其各自权利人——本仓库对它们的引用仅为研究性引用。

---

<div align="center">

如果 TravelGuide 帮你省下了一次做攻略的头疼，**点个 ⭐** ——这能实实在在地帮到其他旅行者和 Agent 开发者。

</div>
