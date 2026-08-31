---
name: ticket-reservation
description: TravelGuide 的票务、预约、开放时间与可用性核验 Skill：以 profile.json + research.json + candidates.json + food-restaurant.json 为输入，以官方来源确认旅行窗口内的营业时间、票价、预约规则、预约开放窗口与可用性，产出可供 Planner 直接消费的硬约束与事实层；不负责最终行程、用户选择与订位执行。
---

# ticket-reservation — 票务、预约与可用性核验

## 1. Role

ticket-reservation 是 TravelGuide 的**票务、预约、开放时间与可用性核验 Skill**。它把上游各 Skill 产生的 preliminary / unknown / 预约线索 / 开放时间 / 票价，转换为**可供 Planner 使用的、带来源与时效的核验结果**。

它回答："这个 POI/餐饮候选在旅行窗口里什么时候可去、是否需要预约、是否需要购票、预约方式是什么、有哪些硬性限制？"

它**不回答**："要不要去？"（用户/主 Agent）也不回答："安排在哪一天？"（itinerary-planner）。

```
profile.json + research.json + candidates.json + food-restaurant.json
   + source_registry + 实际官方来源
   → 逐项事实核验 → 营业/门票/预约/放票窗口/日期特殊规则/可用性
   → 冲突处理 → 硬约束输出 → ticket-reservation.json
```

**事实层定位**：本 Skill 的产出是新的"事实真相层"——下游 Planner 优先消费本结果，而非 candidates/food-restaurant 中的 preliminary 值。本 Skill 不修改任何上游文件。

## 2. Input Contract

- **profile.json**：destination / **dates**（核验窗口）/ **party**（2 adults 等构成，决定票种适用）/ **booked**（已有票务与预约——避免重复核验）/ hard_constraints。
- **research.json**：**source_registry（官方核验入口，优先从这里出发，不重新搜索整个互联网）**、current_events（黄金周等特殊日期背景）、warnings、住宿与区域上下文。
- **candidates.json**：POI 的 open_hours / ticket / reservation / provenance / region / suggested_duration。**只核验候选池中的 POI，不得新增。**
- **food-restaurant.json**：餐饮候选的 opening_hours / reservation / price / provenance / meal_period——对餐饮候选做同样核验。

已知的优先核验目标（继承自 review-analysis 的 fact_claim_conflicts，未修改其文件）：①东京国立博物馆（官方 FAQ 称成人 1,000 日元、须事先网上预约 vs candidates 的 `reservation.required=false（preliminary）`）；②东京都厅展望室（南北展望室夜间开放与休室安排口径冲突）。

## 3. Source Priority

| 层级 | 来源 | 用途 |
|---|---|---|
| S 官方 | 景区/博物馆官网、官方票务页面、官方预约系统、政府机构、交通官方、官方活动页 | 关键事实与硬约束的**唯一最终依据** |
| A 结构化平台 | 可信票务/旅游平台 | 仅当官方不可用时替代，confidence 降级 |
| B 评论社区 | 攻略/点评 | **只能作为线索**，不得作为关键硬约束的最终依据 |

- 从 research.json 的 source_registry 出发（其中已登记景区官网、JR/京成/利木津、东京 Metro、GO TOKYO 等官方渠道）。
- 官方之间冲突 → 保守口径 + conflict 记录（§13）。

## 4. Fact Status

每个核验项必须落入六种状态之一，**下游据此区分可信度**（confirmed ≠ preliminary ≠ unknown ≠ sold_out）：

| 状态 | 定义 |
|---|---|
| `official_confirmed` | 由直接官方来源确认 |
| `preliminary` | 仅有第三方线索（从上游继承的 preliminary 若被官方确认则升级） |
| `unverified` | 无法确认 |
| `expired` | 来源或信息明显过时 |
| `conflict` | 来源之间存在未解决冲突 |
| `unavailable` | 明确无法预约、已售罄或在目标日期不可用 |

每项核验结果必须携带：**状态 + 来源 + checked_at**，缺一不得输出为结论。

## 5. Opening Hours

核验并记录：`open / close / regular_closed_days / special_closed_days / holiday_schedule / last_entry`。

- **旅行窗口内的特殊日期必须逐日检查**（如 2026-10-05 为周一）：若 POI 周一闭馆，直接生成 hard_constraint（`{type: closed, date: 2026-10-05, reason: 周一休园}`），供 Planner 直接消费。
- 法定节假日（含日本方面与黄金周特别开放安排）、临时闭馆、展览期特殊时间、检修公告逐项核验。
- 第三方口径 → preliminary；官方载明 → official_confirmed；无法确认 → unknown，**不猜**。

## 6. Ticket

机器可读票价，**按年龄层分别记录，不自行计算总价**：

```json
{ "amount": null, "currency": "JPY",
  "basis": "per_person | per_group | per_entry | unknown",
  "category": "adult | child | senior | other",
  "status": "official_confirmed | preliminary | unknown" }
```

- 官方存在 adult/child/senior 等票种时分别登记适用关系；**不改变 profile.party**，只记录"2 adults 适用 adult 票 ×2"这类映射。
- 优惠（学生/老人/套票）有官方来源才记录。
- 第三方代售价格 ≠ 官方票价——只能 preliminary。

## 7. Reservation

尽可能核验：是否必须预约 / 是否仅推荐预约 / 预约渠道 / 提前量 / **放票时间** / 是否实名 / 是否需要证件 / 是否可现场购买。**只在来源明确时记录**，没有来源就 unknown。

- 核心区分：**"需要预约"是规则，不等于"现在有票"**——reservation 规则与 availability（§9）必须分开输出，绝不能因"需要预约"推断"现在一定有票"。
- 不做 booking agent：本 Skill 只核验与记录，不执行任何预约操作。

## 8. Booking Window（预约开放窗口）

关键字段——**旅行日期到了 ≠ 现在已经可以买票**：

```json
{ "opens_at": "", "rule": "", "timezone": "", "source": {} }
```

- 相对于 checked_at（如 2026-08-30）标注预约状态：`尚未开放预约 / 即将开放 / 已开放 / 当前可预约 / 无法确认`。
- booking_windows[] 统一汇总即将发生的预约节点（如"9 月 X 日起开放 10 月 1 日时段预约"），供 Planner 设置用户提醒。
- 官方未公布放票规则 → status=无法确认，不推算。

## 9. Availability

```json
{ "status": "available | limited | sold_out | unknown | not_open_for_booking",
  "checked_at": "", "valid_for": "", "source": {} }
```

- **规则 ≠ 库存**：`reservation_required=true` 与 `availability=unknown` 可以同时成立。
- `sold_out` 只能由**直接可靠的官方预约系统或票务来源**得出；第三方"暂时没看到票"最多 `unknown`。
- 库存随时变化——availability 必须带 checked_at，且 valid_for 标明适用的日期/时段。
- 官方系统无法显示余票 → `unknown`，不写 `available`。

## 10. Date Constraints

必须检查旅行窗口（如 2026-10-01~05）内的：周一闭馆、法定节假日（日本方面与中国黄金周特别安排）、临时闭馆、展览期间特殊时间、黄金周特别开放、活动日特殊规则。所有发现转换为结构化日期约束，供 Planner 逐日对照。

## 11. Party Constraints

- 按 profile.party（如 2 adults）映射官方票种：adult 票 ×2、儿童/老人票仅在有对应成员时适用。
- 实名制/证件要求按官方口径记录。
- **不自行改变 party 构成**，不做总价计算（数量 × 单价由 Planner 在预算环节处理）。

## 12. Hard Constraints

每个候选最终形成 Planner 可直接消费的结构：

```json
{ "poi_name": "", "date_constraints": [], "time_constraints": [],
  "reservation_constraints": [], "ticket_constraints": [],
  "availability": {}, "hard_constraints": [] }
```

hard_constraints 示例：`{type: closed, date: 2026-10-05, reason: 周一休园}`——Planner 排日时逐条对照，违反即 Validator 失败。

## 13. Conflict Resolution

- 承接上游 fact_claim_conflicts（如东京国立博物馆、都厅展望室）与本次核验中新发现的冲突。
- 处理顺序：官方优先 → 官方间冲突取保守口径 → 无法裁决则保留 `conflict` + needs_recheck=true，**不能猜**。
- 输出结构：`{target, topic, positions: [{source, claim}], adopted, needs_recheck}`。
- 已知待核验项必须在结果中显式闭环或显式保留 conflict，不得静默消失。

## 14. Provenance

```json
{ "source": "", "url": "", "source_tier": "S | A", "checked_at": "", "confidence": "" }
```

- 每项核验结果必须带 source + source_tier + checked_at + confidence。
- 库存类信息 checked_at 为强制项（随时变化）。
- URL 必须真实可访问；不用搜索结果页充数。

## 15. Output Contract

产物为 **ticket-reservation.json**，落盘与否由主 Agent 决定，本 Skill 只产出内容。顶层：

| 字段 | 内容 |
|---|---|
| destination | `{country, region, city}` 回显 |
| checked_at | 全局核验时间 |
| poi_constraints[] | POI 核验结果：`{poi_name, fact_status, opening{regular, special_dates[], last_entry, status}, ticket[], reservation{required, recommended, channel, advance, booking_open_window, status}, availability, hard_constraints[], sources[]}` |
| food_constraints[] | 餐饮核验结果（结构类似）：`{name, opening, price, reservation, availability, special_dates[], hard_constraints[], sources[]}` |
| booking_windows[] | `{target, booking_type: ticket\|reservation, opens_at, for_date, source, status}` |
| availability_summary | 按状态自动统计（official_confirmed / preliminary / unknown / sold_out / limited / not_open_for_booking / unavailable）——**由实际条目计算，不得手填** |
| conflicts[] | §13 结构 |
| warnings[] | 库存实时变化 / 尚未开放预约 / 来源暂不可访问 / 官方页面冲突 / 特殊日期需复核 / 继承 research.json 风险上下文（安全提醒不得隐藏） |
| provenance_meta | `{checked_at, data_sources, coverage, degradation_notes[]}` |

## 16. Failure Handling

| 场景 | 处理 |
|---|---|
| 官方页面不可访问 | 换官方镜像/其他官方渠道；仍失败 → 降级 A 层并降 confidence + degradation_notes |
| 官方系统不显示余票 | availability=unknown（不写 available） |
| 放票规则未公布 | booking_open_window=null + 状态"无法确认" |
| 来源信息明显过时 | status=expired，寻找新来源 |
| 上游 preliminary 被官方推翻 | 以官方为准升级/修正，并在 conflicts 记录原始差异（不修改上游文件） |
| 完全无法核验 | status=unverified + warnings，交 Planner 标注风险 |

## 17. Non-responsibilities

以下明确不属于本 Skill：

1. 景点发现
2. 评论分析
3. 天气
4. 地图路线
5. 餐厅口味推荐
6. 最终行程（itinerary-planner）
7. 校验行程合法性（trip-validator）
8. 行中动态调整（travel-copilot）
9. 执行订位/购票操作（booking agent）
10. 用户最终决策（含"难抢就放弃/换景点"）

## 18. Integration

- **travel-profile**：dates/party/booked/hard_constraints → 核验窗口与票种映射；不反向修改。
- **web-research**：source_registry 为官方核验入口；current_events 提供黄金周等特殊日期背景。
- **poi-attraction**：candidates 的 preliminary/unknown 事实字段是核验对象；核验结果**不回写** candidates.json，而是作为独立事实层（见下）。
- **review-analysis**：fact_claim_conflicts 是优先核验队列。
- **food-restaurant**：餐饮 preliminary 线索（预约渠道/价格）按同规则核验。
- **itinerary-planner**：**优先消费 ticket-reservation.json 的硬约束与预约锚点**（高于上游 preliminary 值）；booking_windows 供 Planner 设置用户提醒节点。
- **trip-validator**：校验行程是否违反本 Skill 输出的硬约束（date/time/reservation/ticket 四类）。
- **主文件对齐**：实现主文件 §5.5 的核验职责（营业/门票/预约/放票时间/闭馆公告/节假日安排）；预约锚点清单即主文件 §7.1 排日骨架的数据源。
- **与主文件 §5.5"核验回写画像"的差异（仅报告，未修改）**：本 Skill 采用独立事实层模式——不回写 candidates/food-restaurant， Planner 优先消费 ticket-reservation.json；回写可由主 Agent 在汇总时选择性执行。
- **不修改边界全量声明**：本 Skill 不修改 plan/ 下任何资产——candidates.json、food-restaurant.json、review-analysis.json、research.json、weather.json、map-route.json、profile.json 一律只读；weather/map-route 虽非本 Skill 输入，同样在只读保护范围内。
- **待主文件补登（仅报告，未修改）**：`ticket-reservation.json` 未列入主文件 §8.0 的 plan/ 落盘清单（同 research/weather/map-route/food 先例）。
