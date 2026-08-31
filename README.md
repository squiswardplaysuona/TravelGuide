# TravelGuide

一个由 **主 Agent（travel-guide）+ 11 个专业子 Skill** 构成的模块化旅游规划 Agent。
它把一次旅行从"一句话需求"推进到"经过验证的逐日行程"，并在旅途中持续做局部调整。

> TravelGuide 提供的是经过事实核验与约束检查的行程草案与决策支持——它不承诺"最佳旅行"，最终决策始终属于用户。

## 核心能力（Pipeline）

```
需求画像 → 目的地研究 → POI 候选 → 游客体验分析 → 天气
→ 空间/交通 → 餐饮 → 票务/预约 → 行程规划 → 行程验证 → 旅行中局部重规划
```

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
- 其余 11 个是专业子 Skill，各自单一职责；**子 Skill 之间不争夺最终决策权**。
- `itinerary-planner` 生成 **draft** 行程；`trip-validator` 独立验证（error=0 才算通过）；`travel-copilot` 只在旅行中做**局部**调整（Minimal Change Principle）。

## 数据流

运行时资产按以下顺序在 `plan/` 工作区中生成并逐级消费：

```
plan/profile.json
→ plan/research.json
→ plan/candidates.json
→ plan/review-analysis.json
→ plan/weather.json
→ plan/map-route.json
→ plan/food-restaurant.json
→ plan/ticket-reservation.json
→ plan/itinerary.json
→ plan/validation.json
→ plan/copilot.json
```

这些是**运行时/示例数据资产，而不是永久不变的数据库**——每次新旅行都会重新生成。

## Quick Start

本项目是**纯 Skill / Markdown 驱动**的：没有 Python / Node / npm / pip 依赖，也没有任何需要安装的服务。

运行要求：

1. 一个**能够发现并执行 `.agents/skills/` 下 `SKILL.md` 的兼容 Agent 平台**（已在 ZCode 上完成全部真实运行测试；其他平台可手动将 SKILL.md 作为系统/任务指令加载）。
2. 该平台具备**联网搜索/网页读取**能力（研究、票务、天气核验依赖它）。
3. 工作目录为 `<PROJECT_ROOT>`（即本仓库根目录）——Skill 以相对路径 `plan/*.json` 读写运行时资产。

然后，直接用自然语言发起旅行规划（例如："12 月初两个人从上海去京都 5 天，喜欢寺庙和摄影，帮我做个行程"）。主 Agent 会按需触发子 Skill，并在需要时向你确认关键信息。

## Skill 一览

| Skill | Role |
| ------------------ | --------- |
| travel-guide | 主编排 |
| travel-profile | 用户画像 |
| web-research | 目的地基础研究 |
| poi-attraction | 景点候选 |
| review-analysis | 游客体验画像 |
| weather | 天气与天气影响 |
| map-route | 空间与交通矩阵 |
| food-restaurant | 餐饮候选 |
| ticket-reservation | 票务/预约事实核验 |
| itinerary-planner | 行程草案 |
| trip-validator | 行程独立验证 |
| travel-copilot | 行中局部调整 |

## Tokyo Demo

[`examples/tokyo-demo/`](examples/tokyo-demo/) 是 **2026-08-30 生成的完整东京端到端演示快照**（11 份资产 + 说明），覆盖上表全部环节。

⚠️ 其中**天气、票价、营业时间、预约、评论、交通、availability 均具有时效性**——它不是"当前东京最新攻略"。用于真实旅行时，必须重新运行研究、天气、票务/预约等动态 Skill。

## 运行时 plan/

`plan/` 是**运行时工作区**：research、candidates、weather、itinerary、validation、copilot 等文件在运行过程中产生，默认**不提交 Git**（`.gitignore` 已忽略 `plan/*.json`）。已验证的示范快照保存在 `examples/` 中。

## 数据可信度

系统对每一条事实强制区分来源与状态，**未知就明确未知，不用猜测填满结果**：

- `FACT`（官方来源确认）与 `EXPERIENCE`（游客评论，永不写入事实字段）严格分离；
- 事实状态机：`preliminary`（仅第三方线索）/ `official_confirmed`（官方确认）/ `unverified` / `conflict` / `unavailable`；
- 用户偏好与系统默认值分开记录（`user_provided` / `assumed`），假设永远显式可纠正。

## Safety / Limitations

- TravelGuide **不是旅行保险/安全机构**；官方安全提醒与预警由用户自行判断，系统只传递事实。
- 远期天气只有历史气候参考意义，**不能当作确定预测**；逐日预报需临近刷新。
- 预约库存、票价、营业时间**实时变化**，快照不等于可用性。
- 游客评论**不是随机样本**，评论分析只描述体验模式。
- 第三方网站可能登录墙/反爬/不可访问——系统会降级并如实标注 `unverified`，而不是编造。
- 部分功能依赖 Agent 平台的联网能力；离线环境下调研类 Skill 无法工作。

## License

本项目代码采用 [MIT License](LICENSE)。

第三方网站内容、评论内容、商标及外部来源数据仍属于其各自权利人——本仓库对它们的引用仅为研究性引用，不意味着这些内容以 MIT 授权提供。
