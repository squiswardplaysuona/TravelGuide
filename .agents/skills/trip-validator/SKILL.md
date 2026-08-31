---
name: trip-validator
description: TravelGuide 的只读行程验证 Skill：以 itinerary.json 为核心输入，对时间冲突、交通引用、营业时间、票务、预约、用户约束、天气语义和每日负荷进行独立验证，输出 error/warning、repair_hint 与 pass/pass_with_warnings/fail 结论；绝对只读，不修改行程、不重新规划、不调用 Planner。
---

# trip-validator — 行程合法性与可执行性验证

## 1. Role

trip-validator 是 TravelGuide 的**行程合法性与可执行性验证 Skill**。它的核心职责只有一个：**寻找 Planner 行程中的错误**。它不是第二个 Planner。

它不负责：重新排路线、推荐新景点、重新选择餐厅、搜索新 POI、修改 itinerary、替用户做取舍。

```
itinerary.json + 全部上游资产（事实与约束依据）
   → 逐项规则验证（Level 1 → Level 2 → Level 3）
   → error / warning 逐项列出 + repair_hint
   → validation.json（status: pass | pass_with_warnings | fail）
```

## 2. Validation Philosophy

**宁可发现问题，也不要为了让行程"通过"而替 Planner 隐藏问题。**

- 绝对只读：不修改 itinerary、不删除活动、不改交通时间、不改营业时间、不改预约状态、不修改用户选择、不修改任何上游文件与 SKILL.md。
- 不调用 Planner：只输出 `FAIL/WARN + repair_hint`，由主 Agent 决定下一步——保持 `Planner → Validator` 单向。
- 不重新搜索事实：所有判断依据来自已有资产；资产没有的（如某 OD 耗时）只能引用其 unverified 状态，不能补数。
- warning 不能隐藏成 pass：`availability=unknown` 之类问题允许 `pass_with_warnings`，但不允许为了 status=pass 而忽略。

## 3. Input Contract

核心输入：**itinerary.json**（验证对象，status 必须为 draft——非 draft 的行程不进入验证流程）。

事实与约束依据（全部只读）：profile.json（dates/party/pace/hard_constraints/budget/booked）、candidates.json（suggested_duration/rain_suitability/walking_intensity）、review-analysis.json（crowd/queue EXPERIENCE）、weather.json（forecast_horizon_class/plan_b/warnings）、map-route.json（travel_time_matrix/mobility_cost/clusters——交通事实唯一来源）、food-restaurant.json（opening/price/reservation/queue）、ticket-reservation.json（**硬约束最高来源**：hard_constraints/opening/ticket/reservation/availability/booking_windows）。

## 4. Severity Model

| severity | 定义 | 典型项 |
|---|---|---|
| `error` | 硬约束违反，必须修复 | 闭馆仍安排、时间区间重叠、缺失必要 transfer、matrix_reference 不存在、activity 超出 opening、confirmed sold_out、用户选择被静默删除 |
| `warning` | 存在风险，但 draft 可保留 | availability unknown、return transport missing、historical weather、high daily load、user-selected high-walk trade-off、空间效率偏低 |

Validator 不自行修复——只输出 issue + repair_hint。

## 5. Level 1 Hard Constraints（绝对不能违反）

- **日期**：活动日期位于旅行窗口内；不存在不存在的日期。
- **固定交通**：已订航班/车票时间不被违反；首日活动不早于"到达时间 + 入境/行李缓冲 + 机场→酒店 + check-in"链（如 13:30 成田到达 → 14:00 排景点 = error 或严重 warning）。
- **酒店**：活动不与 check-in/check-out 冲突。
- **营业时间**：不落在 closed 日期（如 10-05 博物馆/御苑闭馆仍被安排 = **FAIL 硬错误**）；不超出 opening；不晚于 last_entry。
- **预约**：reservation time 不冲突；须预约项目无任何风险标记 → error；不把 availability=unknown 当 confirmed。
- **票务**：ticket_required 被忽略 → error；已知不可用日期被排程 → error。
- **地图交通**：每个 transfer 有 matrix_reference；引用的矩阵项真实存在；travel_time/mode/transfers 与矩阵一致。Validator **不允许自己估算**。

## 6. Time Conflict（最基本能力）

同一天任意两个占时段落的 `[start, end]` 重叠 → **FAIL**。transfer、buffer、meal 同样占用时间。零时长无缝衔接（POI A 11:00 结束、Transfer 11:00-11:00、POI B 11:00 开始）→ **FAIL**：必须存在合理 transfer/buffer。

## 7. Transport Validation

每个 `type=transfer` 核验：matrix_reference 存在于 map-route.json、from/to 对应、travel_time 一致、mode 一致、transfers 一致、不超过矩阵信息上限。矩阵项为 unverified → 引用它的 transfer 标 warning（数据缺口），**Validator 不替它补数**。

## 8. Opening / Ticket / Reservation

- **Opening**（语义注意）：`last_entry` 是**截止进入时间**，不是截止离开时间——按 ticket-reservation 的语义判断，活动 start ≤ last_entry、end ≤ close。
- **Ticket**：ticket_required 项目必须出现且有票务安排或风险标记。
- **Reservation**：`reservation_required=true` 且 `availability=unknown` → **WARN**（draft 可保留，不得 PASS as confirmed）；`availability=sold_out` → **FAIL**；`booking_open_window=not_open_for_booking` 且 itinerary 已把它当确定行程 → **WARN/FAIL**（取决于是否给了替代说明）。

## 9. User Selection

- 用户明确选定的 POI 必须存在于正式行程中：被偷偷删除 → **error**；被偷偷降级为 optional → **error**。
- 因评论不好/步行多/交通远而删除 → 绝对禁止；只能 `WARN: user_selected_poi_conflict`，要求主 Agent 暴露 trade-off。

## 10. Weather

weather 为 `historical` 档时：不验证逐日天气（无此数据）；检查 Planner 未把 historical 数据当成具体 forecast、未伪造逐日天气、Plan B 结构合理（见 §20 单独规则）、weather warnings 被保留。仅当临近刷新为 `near_term` 后，才检查逐日天气冲突。

## 11. Meal Validation

检查：meal 槽位与 opening_hours 不冲突、reservation 线索状态如实（`reservation_required + unknown` → WARN）、meal_period 匹配、nearby cluster 来自 map-route、往返 transfer 有矩阵引用。不验证味道、不重新评论、不重新搜索餐厅。

## 12. Budget

系统无汇率 Skill：可以检查 JPY 费用是否被记录；**不可以做 CNY↔JPY 换算**。Planner 输出无汇率来源的 CNY 总预算 → **WARN**（不自行计算替代）。

## 13. Daily Load

验证 Planner 声明的 walking/transfer/activity_load、time_pressure、overall_load 是否与活动构成一致。`overall_load=high` → 至少 **WARN**；若同时 slow + cannot_walk_long 且存在连续 high walking/high transfer → 可升级 **FAIL**。

## 14. Spatial Efficiency

检查：同 cluster 同日、每日大跨区 ≤1、无明显来回折返、酒店起点/终点结构、餐饮是否造成无意义绕路。**不机械把所有跨区判错**——依据 map-route 实际成本分级（相邻级多次 ≠ 大跨区违规）。此类多为 WARN。

## 15. Validation Issue

每个问题：

```json
{ "severity": "error | warning", "rule": "", "date": "", "target": "",
  "message": "", "evidence": [], "source_references": [], "repair_hint": "" }
```

- `repair_hint` 允许给出修正方向（如"将博物馆从 10 月 5 日移动到其他开放日"），但**不能真的修改 itinerary.json**——这是给 Planner 的修正指令。

## 16. Validation Summary

```json
{ "status": "pass | pass_with_warnings | fail", "round": 1,
  "error_count": 0, "warning_count": 0, "checked_at": "",
  "issues": [], "constraint_coverage": {}, "quality_summary": {},
  "provenance_meta": {} }
```

最终状态原则：**error_count=0 才允许 pass / pass_with_warnings；error_count>0 必须 fail**。warning 不隐藏成 pass。

## 17. Constraint Coverage

七类检查计数——**由实际检查项自动统计，不得手填**：

```json
{ "hard_constraints_checked": 0, "time_constraints_checked": 0,
  "opening_constraints_checked": 0, "reservation_constraints_checked": 0,
  "ticket_constraints_checked": 0, "transport_constraints_checked": 0,
  "user_constraints_checked": 0 }
```

## 18. Quality Summary

七维验证结论（high|medium|low）：`time_feasibility / transport_feasibility / reservation_feasibility / walking_fit / pace_fit / weather_resilience / overall`。

这是**验证结果**，不是 Planner 的主观评分——与 itinerary.json 的 quality_summary 同键不同义，二者不一致本身就是信息（以 Validator 为准）。

## 19. Convergence / Round

- `validation.json` 必须含 `round` 字段（1, 2, 3…），供主 Agent 追踪 Planner→Validator 修正循环。
- 与主文件 §7.3 一致：**最多 2–3 轮**；每轮必须至少减少一个 error。
- 连续一轮没有任何改善 → `FAIL + no_convergence`，交主 Agent/用户决策。Validator 不负责计数控制之外的事，也不自行再次调用 Planner。

## 20. Read-only Boundary

**绝对只读**。不得修改：itinerary.json、profile.json、candidates.json、food-restaurant.json、ticket-reservation.json、weather.json、map-route.json、research.json、review-analysis.json——也不得修改任何 SKILL.md。Validator 的唯一产物是 validation.json。

## 21. Non-responsibilities

以下明确不属于本 Skill：

1. 重新排路线 / 修复行程（repair_hint 只是建议）
2. 推荐新景点 / 新餐厅
3. 搜索新事实
4. 天气预报
5. 修改任何上游数据
6. 调用 Planner
7. 执行预订
8. 用户最终选择
9. 行中动态调整（travel-copilot）
10. 计数控制修正循环（主 Agent 职责）

## 22. Integration

- **itinerary-planner**：唯一验证对象；其 status 必须为 draft；其 quality_summary 与本 Skill 的 quality_summary 同键不同义——不一致即信息。
- **ticket-reservation**：硬约束最高来源（closed/reservation_required/ticket_required/booking_window/availability 全部落入 Level 1 检查）。
- **map-route**：交通验证的唯一事实来源（matrix_reference 核验）。
- **travel-profile**：用户约束（dates/party/pace/hard_constraints/budget）验证依据。
- **poi-attraction / food-restaurant / review-analysis / weather**：画像、体验、天气语义与 Plan B 的验证依据。
- **主 Agent**：接收 status + issues + repair_hint，决定是否重调 Planner 或交用户决策。
- **主文件对齐**：实现主文件 §7.2 全部校验清单（本文件 §5/§6/§8/§13/§14 即其展开）与 §7.3 修正循环边界。
- **主文件 §8.0**：validation.json 已在 plan/ 落盘清单中 ✓（无需补登）。
