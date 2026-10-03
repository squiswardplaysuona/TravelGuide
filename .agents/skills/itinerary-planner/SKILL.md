---
name: itinerary-planner
description: Generates the day-by-day draft itinerary on user-confirmed POIs/dining only, honoring hard constraints from profile, weather, map-route and ticket data — time-window modeling, spatial clustering per day, dining slots, buffers and Plan B, load assessment. Does not validate (that is trip-validator), re-research, or make final picks for the user. 中文：TravelGuide 的最终行程规划 Skill：仅在用户确认的 POI/餐饮之上，依据 profile、weather、map-route、ticket-reservation 的硬约束生成 draft itinerary——负责时间窗建模、空间聚类排日、餐饮插槽、缓冲与 Plan B、负荷评估与冲突暴露；不验证行程合法性（trip-validator）、不替用户取舍、不重新调研任何事实。
---

# itinerary-planner — 最终行程生成与优化

## 1. Role

itinerary-planner 是 TravelGuide 的**最终行程生成与优化 Skill**。它第一次负责：把**用户已经选择**的候选地点和餐饮，按照全部约束排列成可执行的旅行日程。

它产出的是 `draft`（planner_feasible_candidate）——**Validator PASS 之前，任何行程都不可执行**。它不做最终验证，不宣布"绝对可行"。

```
用户确认的 POI + 用户确认的餐饮 + 全部上游资产
   → 时间窗建模 → 硬约束建模 → 空间聚类 → 每日活动
   → 餐饮插槽 → 交通转移 → 休息/缓冲 → Plan B
   → 行程草案 → itinerary.json（status=draft）→ 交 trip-validator
```

## 2. User Selection Contract（用户选择优先）

**Planner 不得自动把所有 candidates 当成已选择项目。** 输入必须包含：

```json
{ "selected_pois": [], "selected_food": [], "planner_preferences": {} }
```

- `selected_pois` 必须引用 candidates.json 中已有 POI；`selected_food` 引用 food-restaurant.json 已有餐饮候选；**不复制完整画像，只引用**。
- 缺少用户选择 → 返回 `selection_required`，不自行决定用户去哪。
- 用户只选了部分 → 未选中项只能作为 **optional / backup / alternative**，不得直接进入 itinerary。
- **不隐式删除用户选择**：用户明确说"我一定要去 A"——即使评论不好、交通远、步行多，也不能偷偷删除。正确做法是把 trade-off 显式展示（如"A：步行较高 → 建议打车；代价：时间+费用"），由用户决定。
- 用户选择很多导致超载 → 不直接拒绝：优先满足用户选择 + 暴露过载 + 给出 optional/remove 候选，让用户调整。

## 3. Input Contract

| 输入 | 用途 |
|---|---|
| profile.json | dates / origin / party / budget / pace / interests / hard_constraints / booked |
| candidates.json | 已选 POI 的 suggested_duration / region / walking_intensity / constraint_risk / priority / fit；未选者仅作备选 |
| review-analysis.json | regret_notes / crowd_patterns / audience_segments / review_adjustment_signal——用于**调整已选项目的安排风险**，不能因评论负面偷偷删除已选 POI |
| weather.json | forecast / climate_reference / poi_weather_impact / weather_risks / plan_b——天气约束必须参与安排 |
| map-route.json | **核心数据**：hotel anchor / gateway anchor / clusters / travel_time_matrix / cluster_connections / mobility_cost——**禁止重新估算交通时间** |
| food-restaurant.json | 已选餐饮的 meal_period / opening_hours / price / reservation / nearby_clusters / fit |
| ticket-reservation.json | **硬约束最高来源**：hard_constraints / opening / ticket / reservation / availability / booking_windows / conflicts——**优先级高于 candidates/food-restaurant 的 preliminary 信息** |

## 4. Hard / Soft Constraints（三层优先级）

Planner 按以下顺序满足，低层不得违反高层：

- **Level 1 不可违反**：日期闭馆（如 10-05 博物馆/御苑闭馆）、固定航班（成田 13:30 到达）、已确认票务时间、reservation time、opening hours、last entry、已订酒店 check-in/out、用户 hard_constraints（cannot_walk_long）。
- **Level 2 强约束**：用户选择、budget、pace（slow）、cannot_walk_long 的步行上限、餐饮营业时间。
- **Level 3 软偏好**：photography、scenic preference、popularity、review signal、可选 shopping。

**绝对不能违反 ticket-reservation**：`2026-10-05 closed` → 禁排 10-05。`reservation_required=true` 且 `availability=unknown` → 不能假设有票：标记风险 / 要求用户确认 / 安排其他可行项目——**不能把 unknown 当 available**。

## 5. Time Model

每个活动必须有 `start / end / duration`，并区分四类时间：

- **活动时间**：POI 实际游览时长（来自 suggested_duration）。
- **移动时间**：**只来自 map-route.json 矩阵**——严禁自己重新估算。
- **用餐时间**：餐饮属性 + planner_preferences（lunch_duration / dinner_duration）。
- **缓冲时间**：必须显式预留（buffer）。

**禁止无缝衔接假设**：不能 09:00 景点 A 结束、09:00 景点 B 开始。交通、排队、找路、入场、厕所、休息——至少要有 buffer。

## 6. Spatial Planning

- 以 map-route clusters 为排日单元：**同 cluster 同日优先**；跨区每日最多一次大移动。
- **预约时间锚点**是硬 anchor：`reservation = 2026-10-03 10:00` → 围绕它安排（09:00 出发、10:00 入场……），而不是反过来调整预约。
- 空间就近原则同样适用于餐饮：不为吃某家餐厅跨区移动 60 分钟——除非用户明确选择并接受代价。
- **禁止输出 Day 1 / Day 2 式最终结论以外的"去哪"建议**——本文件产出的就是日程本身，但顺序必须由本文件内的约束推导，不得凭感觉。

## 7. Meal Scheduling

Planner 第一次负责把餐饮候选真正插进时间线：

- 午/晚餐槽位时间由 **opening_hours + reservation + 当天路线**计算，不是全程固定 12:00 / 18:00。
- 必须考虑：opening、reservation、nearby cluster（空间就近优先）、transport（来自矩阵）、queue、user pace。
- **breakfast 候选不足**时不强行生成餐厅：标注 `hotel_breakfast / free_time`——这是规划默认策略，不是发现了某家餐厅。
- 返程交通未提供 → 最后一天可生成 `free_time / undecided`，并明确"需要返程交通信息后才能完整排程"。
- **不得为了餐饮让用户跨城市移动 60 分钟**（除非用户明确选择并接受）。

## 8. Weather Integration

- 天气约束进入安排：rain → 高敏感 outdoor POI → 改时间或启动 rain_backup。
- 当前 weather.json 为 `historical` 档：**不能假装知道具体某天会下雨**——只保留 Plan B 备用结构，临近刷新时重新规划。
- Plan B 是**备用结构**（primary: 浅草寺 → backup: 东京国立博物馆），不是正式活动；触发启用后仍须过 opening / ticket / reservation 检查。

## 9. Ticket / Reservation Integration

- ticket-reservation.json 是硬约束最高来源；candidates/food-restaurant 的 preliminary 与之冲突时以其为准。
- **booking_windows 不是游览活动**——转换为 `booking_reminder`（提醒节点，见 §16）。
- reservation time 是 hard anchor（§6）。
- availability=unknown 的项目照常排入但打 risk_flags，不做"有票"假设。

## 10. Mobility / Pace

**cannot_walk_long（强制）**：优先低 walk 的 mobility_cost；控制连续步行；控制站内长距离；减少复杂换乘；安排休息；避免一天连续多个 high walking activity。**最终行程若因用户选择无法完全满足——必须显式暴露冲突，不能默默违反。**

**slow（强制）**：默认每日 1–2 个核心 POI，不是一天塞 5–8 个。用户明确选择很多时：优先满足 + 暴露过载 + 给 optional/remove 候选。

## 11. Hotel / Gateway Anchors

- **hotel（新宿）是每日空间起点/终点**；用户明确选择夜生活区域时允许不返回酒店——但必须考虑末班交通。
- **gateway（成田 13:30 到达）是首日时间锚点**：首日必须计入入境、取行李、机场→酒店、check-in、首日疲劳——**不能 13:30 落地 14:00 就排景点**。首日按"大交通日减负"排轻量活动（主文件 §7.1）。
- 返程航班未提供 → 不假设返程时间；最后一天 `free_time / undecided` + 明确待补。

## 12. Budget

- 可计算门票/餐饮/交通合计，但必须尊重 `profile.budget.amount_basis`（8000 CNY/person × 2 adults）。
- **汇率必须有明确来源**：当前系统没有汇率 Skill → 不静默使用汇率数字。处理方式：保留 JPY 原价 + 标注"预算匹配未完成"，或使用用户提供的汇率。

## 13. Daily Load

每日评估负荷模型：

```json
{ "walking_load": "low|medium|high", "transfer_load": "low|medium|high",
  "activity_load": "low|medium|high", "time_pressure": "low|medium|high",
  "overall_load": "acceptable | high" }
```

当前 slow + cannot_walk_long：任何 `overall_load=high` 必须产生 warning。每日必须有间隔（lunch/dinner/rest/toilet/free_time/buffer）——禁止 09:00 到 19:00 无空档的时钟填格。

## 14. Conflict Handling

用户选择无法在有限天数内完成时——**不悄悄删**。输出：

```json
{ "type": "constraint_conflict", "target": "", "reason": "",
  "impact": "", "requires_user_decision": true }
```

说明冲突对象、原因、哪个约束冲突、最小代价解决方式，交主 Agent 决定是否询问用户。

## 15. Output Contract

产物为 **itinerary.json**，落盘与否由主 Agent 决定。顶层：

| 字段 | 内容 |
|---|---|
| trip_meta | 7 个上游 reference + generated_at + `status: "draft"` |
| days[] | 每日结构（见下） |
| booking_reminders[] | §16 |
| unresolved_conflicts[] | §14 |
| optional_items[] | §17 |
| global_warnings[] | 安全提醒继承 / 未完成预约 / 天气为远期历史模式 / 返程交通未提供 / availability unknown / budget currency mismatch / 用户选择导致过载 |
| quality_summary[] | §4 式七维初判（high/medium/low，无虚假百分比） |
| provenance_meta | `{checked_at, data_sources, degradation_notes[]}` |

days 结构：`{date, day_label, base, activities[], meals[], transfers[], buffers[], risks[], load, day_summary}`。

activity 结构（**不复制全部 POI 数据，只引用**）：

```json
{ "type": "poi | meal | transfer | rest | free_time", "name": "",
  "start": "", "end": "", "duration": "", "source_reference": "",
  "constraints_satisfied": [], "risk_flags": [] }
```

transfer 结构：`{from, to, travel_time, mode, walk_time, transfers, matrix_reference}`——交通时间必须引用 map-route 对应矩阵项，**严禁自己重新估计交通时间**。

quality_summary 七维：constraint_satisfaction / spatial_efficiency / pace_fit / walking_fit / weather_resilience / reservation_feasibility / overall_feasibility（high|medium|low）。Planner 只给**初步质量判断**，最终可行性由 Validator 决定。

## 16. Booking Reminders

ticket-reservation 的 booking_windows 转换为提醒节点，**不是行程活动**：

```json
{ "date": "2026-09-17", "target": "Shibuya Sky", "booking_type": "ticket",
  "action": "book_ticket", "source_reference": "plan/ticket-reservation.json#booking_windows" }
```

## 17. Optional Items

未选中的优质候选进入 optional（如雨天备用）：`{name, reason, best_fit_day, trigger}`。**optional_items 永远不自动变成 itinerary。**

## 18. Provenance

每个活动必须可溯源：`{source_type: candidate | food | matrix | ticket | weather, reference: "..."}`。不复制大段数据。

## 19. Failure Handling

**禁止创造事实**：Planner 不能自己猜营业时间、自己猜票价、自己猜交通时间、自己猜预约库存、自己猜天气、自己猜返程航班——**所有这些必须从已有资产读取**；资产里没有的（如返程交通、精确汇率、某 OD 耗时），如实暴露为缺口或 unverified，绝不编造补位。

| 场景 | 处理 |
|---|---|
| 无用户选择 | 返回 `selection_required` |
| 用户选择过载 | 满足+暴露+optional/remove，交用户 |
| 硬约束与用户选择冲突 | 暴露 constraint_conflict，交主 Agent |
| map-route 矩阵缺某 OD | 该转移标 unverified——**不自行估算**；提示 Planner 需补查 |
| ticket-reservation 缺失 | 硬约束来源缺失 → 返回失败（不能在无核验层的情况下产出"可行"行程） |
| 天气为 historical 档 | Plan B 备用 + 临近刷新标记，不做逐日天气决策 |
| 返程交通缺失 | 最后一天 free_time/undecided + global_warning |

## 20. Non-responsibilities

以下明确不属于本 Skill：

1. 景点/餐饮发现
2. 评论分析
3. 天气预报
4. 交通时间估算（必须读 map-route）
5. 票务/预约核验与执行
6. 行程合法性最终验证（trip-validator）
7. 行中动态调整（travel-copilot）
8. 用户最终选择
9. 自动删除用户选择
10. 自行宣布"绝对可行"

## 21. Integration

- **travel-profile**：dates/party/budget/pace/hard_constraints/booked → 约束与锚点；planner_preferences 是**本次行程偏好**，不修改 profile.json。
- **poi-attraction**：候选池与画像——只有用户选中的进入 itinerary，未选中进 optional/backup。
- **review-analysis**：体验风险调整已选项目安排；不能推翻用户选择。
- **weather**：historical 档 → Plan B 备用 + 临近刷新；plan_b 只作备用结构。
- **map-route**：交通时间**唯一来源**（矩阵引用，不重算）；clusters → 排日单元。
- **food-restaurant**：已选餐饮 → 餐饮插槽；空间就近优先。
- **ticket-reservation**：**硬约束最高来源**——closed/reservation/ticket/booking_windows 全部生效；冲突时覆盖上游 preliminary。
- **trip-validator**：草案的下一站。**Planner 构造最优草案，Validator 寻找违规**——不复制完整 validator 逻辑。fail 时由主 Agent 决定重新调用 Planner（主文件 §7.3 最多 2–3 轮），**不在 Planner 内部自己无限循环**。
- **主文件对齐**：实现主文件 §7.1 全部编排原则（聚类/锚点/窗口匹配/固定槽/节奏映射/大交通日减负）；§7.2 红线即本文件 Level 1；itinerary.json 已在主文件 §8.0 plan/ 清单中 ✓。
