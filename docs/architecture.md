# TravelGuide 架构（Architecture）

本文描述 TravelGuide 当前的实际架构——以仓库中 12 个 SKILL.md 为准，不引入尚未实现的设计。

## 1. 系统定位

TravelGuide 是一个**主 Agent + 11 个专业子 Skill** 构成的模块化旅游规划 Agent：

- `travel-guide` 是**总编排器（orchestrator）**：理解需求、拆解任务、调度子 Skill、汇总核对、组织用户决策。
- 11 个子 Skill 各自单一职责，通过 `plan/` 下的结构化 JSON 资产衔接。
- **子 Skill 之间不争夺最终决策权**：Planner 只生成 draft，Validator 独立验证，Copilot 只做局部调整，最终取舍始终属于用户。

## 2. Skill 依赖图

```
travel-guide（orchestrator）
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

子 Skill 之间同样存在数据依赖（如 poi-attraction 消费 web-research 的区域结构、itinerary-planner 消费全部上游资产），完整契约见 [skill-contracts.md](skill-contracts.md)。

## 3. 数据流

运行时资产在 `plan/` 工作区按以下顺序生成并逐级消费：

```
profile.json
→ research.json
→ candidates.json
→ review-analysis.json
→ weather.json
→ map-route.json
→ food-restaurant.json
→ ticket-reservation.json
→ itinerary.json
→ validation.json
→ copilot.json（旅行中）
```

## 4. 职责边界

| 层 | Skill | 职责一句话 |
|---|---|---|
| Orchestrator | travel-guide | 需求理解、任务拆解、调度、汇总、组织用户决策 |
| Research | web-research | 目的地基础研究 + 官方信息源清单 |
| Candidate | poi-attraction / food-restaurant | 景点与餐饮候选池构建与画像 |
| Experience | review-analysis | 多源游客评论的体验画像（非事实） |
| Weather | weather | 天气时效分层、气候参考、POI 天气敏感性 |
| Spatial | map-route | 空间聚类、锚点、交通时间矩阵、mobility_cost |
| Reservation | ticket-reservation | 营业/票价/预约/可用性的官方事实核验（事实层） |
| Planner | itinerary-planner | 在用户选择 + 全部约束上生成 draft 行程 |
| Validator | trip-validator | 只读验证 draft，输出 error/warning + repair_hint |
| Copilot | travel-copilot | 旅行中对受影响局部提出结构化调整 delta |

## 5. 三个核心运行阶段

### Pre-trip（旅行前）

```
Research（profile → research → candidates → review → weather → map → food → ticket）
→ Planner（itinerary draft）
→ Validator（validation）
```

error=0 时行程进入可执行状态（pass / pass_with_warnings）；error>0 时由主 Agent 决定是否重新调用 Planner。

### Planning correction（规划修正循环）

```
Planner → Validator →（repair_hint）→ Planner → Validator …
```

最多 2–3 轮（主文件 §7.3）；每轮必须至少减少一个 error，连续无改善则 `FAIL + no_convergence` 交用户决策。Validator 不自行调用 Planner。

### In-trip（旅行中）

```
Copilot（局部 delta，Minimal Change）
→ 轻量安全检查（八项）
→ local：safe 即可；day/multi_day：needs_full_validation → 主 Agent 调用 trip-validator
```

## 6. 核心数据原则

每条信息强制携带**来源与状态**，未知就明确未知，不用猜测填满结果：

| 状态 | 含义 |
|---|---|
| `FACT` / `official_confirmed` | 官方来源直接确认的事实 |
| `EXPERIENCE` | 游客评论/社区体验——**永不写入事实字段** |
| `ASSUMPTION` | 系统默认值，显式记录、可被用户纠正（`user_provided` 与之严格分离） |
| `UNKNOWN` | 尚无数据（如库存未展示）——不得当 available |
| `UNVERIFIED` | 无法核验——如实标注并进入 warnings |
| `PRELIMINARY` | 仅第三方线索——最终以官方核验为准 |

配套机制：`fact_claim_conflict`（评论主张与事实层冲突时移交核验）、多源保守口径、`checked_at` 时效标记。

## 7. 数据资产

- **`plan/` = runtime workspace**：每次旅行重新生成的运行时资产，默认不提交 Git（`.gitignore: plan/*.json`）。
- **`examples/tokyo-demo/` = versioned example snapshot**：2026-08-30 完成的东京端到端示范（11 份资产 + README 时效声明），用于展示全链路形态；**不代表实时旅游信息**。

## 8. 重要约束（跨 Skill 不变量）

- **map-route 是交通事实唯一来源**：任何 Skill 不得自行估算交通时间；实时数据只能作为 delta 注释，不污染矩阵。
- **ticket-reservation 是硬约束事实层**：闭馆、票价、预约规则、booking window 以它为准，优先级高于上游 preliminary 值。
- **Planner 只能生成 draft**：`itinerary.json.status` 在 Validator PASS 前恒为 draft；Planner 不内嵌完整验证逻辑、不自行循环。
- **Validator 独立只读验证**：不修改任何资产、不调用 Planner，只输出 error/warning + repair_hint。
- **Copilot 只做局部变化**：Minimal Change Principle——只调整受影响的最小范围，保护航班/酒店/预约等硬锚点，输出 delta 而非新计划。
- **用户拥有最终决策权**：任何 Skill 都不得静默删除用户选择、替用户放弃预约或决定取消旅行。
