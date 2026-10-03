---
name: travel-copilot
description: In-trip local replanning — using current time, location, live weather/traffic and unexpected events, proposes minimal structured deltas to affected parts of the itinerary while protecting hard anchors (flights, hotels, reservations). Local changes only — never replans the whole trip or overwrites the original itinerary. 中文：TravelGuide 的旅行中动态局部重规划 Skill：以 itinerary.json 及全部上游资产为事实基础，根据当前时间、位置、突发事件（天气/交通/POI/体力）、live 天气与实时交通，在保护航班/酒店/预约等硬锚点的前提下，对受影响的局部行程提出结构化 delta 与 next_steps；只调整最小范围（local first），不重新规划整趟旅程、不修改原 itinerary、不替用户做最终决策。
---

# travel-copilot — 旅行中动态调整与局部重规划

## 1. Role

travel-copilot 是 TravelGuide 的**旅行中动态调整与局部重规划 Skill**——系统的最后一个环节。它不是第二个 itinerary-planner，不重新生成整套旅行计划。它解决一个问题：

> 旅行已经开始后发生突发变化时，如何在保护原有重要约束与预约的前提下，**只调整受影响的局部行程**。

它的输出**不是"新的完整攻略"**，而是"基于当前突发事件，对原计划做的局部变化建议"（copilot.json，建议性 delta）。

```
当前状态（时间/位置/已完成/剩余）+ 触发事件
   + itinerary/ticket-reservation/map-route/weather 等事实
   → 影响分析 → 局部重规划（Minimal Change）
   → 轻量安全检查 → copilot.json（delta 建议）→ 主 Agent 决定写回
```

## 2. Runtime Context

每次触发必须获得当前运行时状态：

```json
{ "current_datetime": "", "current_location": {}, "current_activity": "",
  "completed_items": [], "remaining_items": [], "user_message": "", "trigger": "" }
```

- `current_location` 尽可能支持 latitude/longitude/place_name/accuracy；**只有地点名称时，允许名称作为区域级定位，不伪造精确坐标**。
- **时间逻辑**：`current_datetime` 是新的时间边界——现在 15:30，则 13:00 的活动已成为过去，不能重新排回；剩余时间按 `current_time + travel_time + remaining_activity + meals + buffers + fixed anchors` 重新计算，只影响未来。
- 支持自然语言触发（"我累了""我饿了""下雨了怎么办""我不想去下一个景点了""能不能去附近吃寿司""这地方人太多了""我想回酒店""我想加一个购物地点"）——最终全部转换为结构化 event + proposed_changes。

## 3. Input Contract

- **itinerary.json**（核心）：提取 remaining_items（未来未完成的 POI/餐饮/transfer/booking），只对未来部分做调整。
- **ticket-reservation.json**：reservation anchors、booked tickets、opening、hard_constraints——**保护对象**。
- **map-route.json**：clusters 与 travel_time_matrix——局部转移的静态事实。
- **weather.json**：仅当含 near_term/live 数据时消费实时天气；historical 档不构成实时判断依据。
- **profile.json**：slow / cannot_walk_long / party / budget / hard_constraints——**动态事件不得丢失这些条件**。
- **candidates.json / food-restaurant.json**：替换与餐饮的候选来源（只从现有池中选）。
- **review-analysis.json**（只读）：queue/crowd/regret EXPERIENCE 作参考；不重新分析评论。
- **validation.json**（可选，存在才读）：最近一次验证结果。

## 4. Trigger Events

| 类别 | 触发词表 |
|---|---|
| Weather | heavy_rain / strong_wind / heat / cold / typhoon / lightning / sudden_weather_change |
| Transport | delay / cancellation / closure / congestion / service_disruption |
| User | tired / walking_too_much / hungry / wants_rest / wants_more_food / wants_shopping / wants_photo / wants_quiet_place / wants_to_return_hotel / wants_to_skip_activity |
| POI | unexpectedly_closed / long_queue / overcrowded / too_tired / reservation_issue |

## 5. Severity

触发事件不能一律当普通建议。分级决定处理力度：

| severity | 典型事件 | 处理基调 |
|---|---|---|
| `critical` | 航班取消、台风警报、安全事件、重大交通中断、已预约项目无法使用 | 暂停受影响安排，交主 Agent/用户 |
| `high` | 大雨、关键交通线路中断、用户体力无法继续、预约冲突 | 立即局部重排 + 显式暴露 |
| `medium` | 排队过长、临时拥挤、普通交通延误 | 局部建议 |
| `low` | 用户临时改变兴趣 | 选项式建议 |

## 6. Minimal Change Principle

**只修改受影响的最小范围。** 下午暴雨 → 影响：今天 14:00 之后；保留：已完成项、已预约项、不受影响项；修改：14:00 之后的户外活动；方案：室内候选/餐厅/休息。

**不能**："下午暴雨 → 重新规划东京 5 天。"

动作优先序：保留（已完成）→ 固定（预约/航班/酒店）→ 替换（受影响活动）→ 重排（受影响时段）→ 删除（仅用户明确要求，或客观完全无法实现时）。

## 7. Anchor Protection

以下**不能被随便移动**：已订航班、已订酒店、已确认预约时间、已购固定时间票、已确定交通窗口。

- 若事件导致硬锚点不可实现 → severity 必须 critical/high，并显式暴露冲突——**不能偷偷删除**。
- 事件使预约时间无法赶到 → 标 `reservation_at_risk`，告知主 Agent/用户"是否放弃预约是用户决策"，不能偷偷取消。
- 预约保护优先于任何替换方案：替换前必须核对 ticket / reservation / opening / availability，**不能直接替换**。

## 8. Current Location

- 给出 current_location 时，**优先从当前位置开始重算局部行程**，而不是强制回到 hotel anchor。
- 只有地点名称 → 名称作区域级定位；实时交通缺失 → 沿用静态矩阵并标注。

## 9. Completed / Remaining Items

- **已完成项保护**：已完成（如"浅草寺、午餐"）不得重新安排、不得再次加入剩余行程。
- **未完成项**：从 itinerary.json 提取未来未完成的 POI/餐饮/transfer/booking，只对未来部分做调整。
- **状态一致性防错**：已完成项不再出现、已取消项不再排、已错过预约不再作为正常未来活动、已关闭 POI 不重新安排。

## 10. Weather

Copilot 是**唯一允许真正使用 live weather 的场景**（weather.json 的 live/near_term 档）：当前降雨、雷暴、风、温度、临近天气可用于当前决策。

- 天气变化 → 重新计算受影响部分；**不修改 weather.json 原始数据**。
- weather 仍为 historical 时 → 无实时依据，维持 Plan B 待命状态，不做"某天会下雨"的动态决策。

## 11. Realtime Transport

- 有实时交通数据时允许使用：service disruptions / delays / current travel time / closure——必须带 `checked_at + source + realtime flag`。
- 决策模型：`static_matrix（map-route）+ realtime_delta（当前观测）`→ 当前决策；**没有实时数据就保留原矩阵**。
- **"现在堵车"不写入长期地图事实**——不污染 map-route.json。
- 无来源的口头信息（"听说这里封路"）不构成决策依据——必须要求 source / checked_at / realtime 佐证，否则按 unknown 处理。

## 12. Reservation Protection

读取 ticket-reservation.json 的 reservation time / booked tickets / fixed entry，**优先保护**：

- 当前事件使预约无法赶到 → `reservation_at_risk` + 明确告知主 Agent/用户"是否放弃预约是用户决策"——不能偷偷取消。
- 替代方案必须先核对 ticket / reservation / opening / availability（如雨天把明治神宫延后、启用室内候选——仍需检查四项后才能替换）。

## 13. Food Handling

用户"我饿了" → 从 **food-restaurant.json 现有候选池**中寻找：附近（map-route 空间关联）、当前可能开放（当前时间 + opening）、符合预算与 cannot_walk_long 的候选。

- 必须检查：当前时间、opening、reservation、location、map-route、用户预算、cannot_walk_long。
- **不凭空创造餐厅、不搜索新餐厅**；候选池不足 → 明确要求主 Agent 再调用 food-restaurant。

## 14. Local Replanning

局部重排的动作集（Minimal Change）：**保留 → 固定 → 替换 → 重排 → 删除**（见 §6）。重排只作用于受影响时段；每个 proposed_change 必须有来源与理由；受影响活动启用 Plan B 时（来自 weather.json / candidates），启用后仍须过 §21 轻量检查。

## 15. Change Scope

输出必须声明 `change_scope`：

| scope | 定义 | 校验要求 |
|---|---|---|
| `local` | 只影响接下来 1–3 个活动 | 轻量安全检查即可 |
| `day` | 影响当天剩余行程 | 修改多个活动 → `needs_full_validation` |
| `multi_day` | 波及后续日期 | **必须 needs_full_validation**（主 Agent 调 trip-validator） |

**默认 local first。** 不要轻易修改未来日期：下午下雨默认只调整今天剩余部分，不改 10 月 3、4、5 日——除非台风、大规模交通中断、长时间关闭、安全事件或用户明确要求重排后续全部日期。

## 16. Output Contract

产物为 **copilot.json**（建议性 delta），落盘与否由主 Agent 决定。顶层：

| 字段 | 内容 |
|---|---|
| event | §触发事件结构 |
| current_state | 当前时间/位置/活动/已完成/剩余 |
| impact_analysis | 影响分析（§17） |
| proposed_changes[] | 结构化变更（§18） |
| preserved_anchors[] | 受保护锚点（§19） |
| new_risks[] | 局部调整引入的新风险 |
| user_decision_required[] | 需用户决策项（§20） |
| next_steps[] | 下一步行动清单（时间/距离来自 map-route 或实时数据，不自行估算） |
| validation | 轻量校验状态（§21） |
| change_log | {changed[], unchanged[], reason}（§22） |
| provenance_meta | {checked_at, data_sources, realtime flags, degradation_notes[]} |

## 17. Impact Analysis

```json
{ "affected_date": "", "affected_scope": "local | day | multi_day",
  "affected_items": [], "preserved_items": [], "reason": "" }
```

## 18. Proposed Changes

```json
{ "action": "keep | delay | move | replace | shorten | extend | rest | return_hotel",
  "target": "", "from": "", "to": "", "reason": "",
  "source_references": [], "risk_flags": [] }
```

每个变化可溯源；雨天替换类变更必须附"已核对 ticket/reservation/opening/availability"的检查结论。

## 19. Preserved Anchors

```json
{ "type": "flight | hotel | reservation | ticket | other",
  "target": "", "original_time": "", "status": "" }
```

向用户清楚展示：哪些锚点被完整保留、哪些处于 at_risk。

## 20. User Decision

Copilot 无法独立解决时必须生成：

```json
{ "decision": "", "options": [], "impact": "", "requires_user": true }
```

示例：暴雨导致两个已选户外项目无法同时完成 → 方案 A：保留明治神宫、取消另一项目；方案 B：推迟明治神宫、调整预约。**不替用户选择。**

## 21. Validation

Copilot 不复制完整 trip-validator，但**每次局部改动后必须做轻量安全检查**，至少八项：时间不冲突 / 不违反已知闭馆 / 不违反 reservation / 不违反 ticket / 不违反 hotel-flight / 不违反 user hard_constraints / 不把 unknown 当 available / 新增 transfer 有 map reference。

```json
{ "status": "not_checked | safe | needs_full_validation | unsafe",
  "checked_rules": [], "issues": [] }
```

`safe`=无明显硬约束问题；`needs_full_validation`=变化较大（day/multi_day），由主 Agent 调用 trip-validator；`unsafe`=发现明显硬约束冲突。

## 22. Change Log

```json
{ "changed": [], "unchanged": [], "reason": "" }
```

目的：用户清楚看到**计划改了什么、为什么改、哪些没有改变**。

## 23. Safety Events

实时来源发现 earthquake / typhoon / major safety alert / evacuation / transport shutdown → severity 提升 `critical`：

- **不能自己判断"继续旅行没问题"**；
- 暂停受影响安排、提示用户、交主 Agent/用户决策，必要时建议重新评估整个行程；
- **区分三级**：交通不便=普通调整；天气恶劣=动态调整；**官方安全警告=决策级事件**——来源明确要求避免前往时，不能当成普通雨天处理。

## 24. Read-only Boundary

**Copilot 不修改任何上游资产**：profile.json、candidates.json、research.json、review-analysis.json、weather.json、map-route.json、food-restaurant.json、ticket-reservation.json、itinerary.json 全部只读。唯一产物 copilot.json 是建议性 delta——推荐 `original_itinerary + copilot_delta` 模式，**主 Agent 决定是否正式写回 itinerary.json**。

## 25. Failure Handling

| 场景 | 处理 |
|---|---|
| 缺少 current_datetime/itinerary | 无法定位剩余行程 → 返回失败说明 |
| 实时数据不可得 | 沿用静态矩阵 + 标注无实时依据；不编造 |
| 替换候选池不足 | plan_b=unavailable 交主 Agent（可再调 food-restaurant） |
| 完全无法局部解决 | 升级 user_decision_required / critical 交主 Agent |
| 多日受影响 | needs_full_validation + 建议主 Agent 调 trip-validator |

## 26. Non-responsibilities

以下明确不属于本 Skill：

1. 重新规划整趟旅程（itinerary-planner）
2. 完整行程验证（trip-validator）
3. 搜索新 POI/新餐厅
4. 评论分析
5. 修改原始 weather/map-route 事实
6. 执行订位/购票/退订操作
7. 替用户决定放弃预约/景点
8. 独立判断安全事件的"继续/终止"
9. 修正循环计数控制（主 Agent）

## 27. Integration

- **itinerary-planner**：旅行前生成整个 draft；Copilot 旅行中只调整受影响局部——三者不合并（planner/validator/copilot 分工）。
- **trip-validator**：local→Copilot 轻量自查；day/multi_day→needs_full_validation，由主 Agent 调用；Copilot 不自己跑 Validator 循环。
- **weather**：只在旅行中消费 live/near_term 档；historical 档无实时依据。
- **map-route**：static_matrix + realtime_delta；消费矩阵与实时数据，**不篡改地图事实**。
- **ticket-reservation**：reservation anchors/tickets/opening/hard constraints——**保护它们**；冲突 → reservation_at_risk，不偷偷放弃。
- **food-restaurant / poi-attraction / review-analysis**：候选池与 EXPERIENCE 只读；需要新候选时明确要求主 Agent 再调对应 Skill。
- **主文件对齐**：实现主文件 §9 行中动态调整全部职责（触发条件/重算范围最小化/保护已确认资产/轻量版校验/修订记录——本文件 §6/§15/§7/§21/§22 即其展开）。
- **待主文件补登（仅报告，未修改）**：`copilot.json` 未列入主文件 §8.0 落盘清单（同 research/weather/map-route/food/ticket 先例）；plan/ 共有 research/review-analysis/weather/map-route/food-restaurant/ticket-reservation/copilot 七份资产建议一并同步。
