---
name: weather
description: Weather and weather-impact analysis by forecast horizon (historical climate / trend / near-term forecast / live) — climate baselines, clothing and gear strategy, per-POI weather sensitivity, and rain Plan-B constraints for the planner. Analysis only — no POI discovery, reviews, routing, tickets, or itinerary. 中文：TravelGuide 的天气与天气影响分析 Skill：以 profile.json + research.json + candidates.json 为输入，按预测时效分层（历史气候/趋势/临近预报/实时）输出天气依据、常年气候参考、穿衣与装备策略、逐 POI 天气敏感性与雨天 Plan B 约束，供 Planner 消费；不做 POI 发现、评论分析、地图路线、票务核验、最终行程与用户决策。
---

# weather — 天气与天气影响分析

## 1. Role

weather 是 TravelGuide 的**天气与天气影响分析 Skill**。它不是天气播报器。它必须回答七个问题：旅行期间天气如何、当前预测有多可信、穿什么、是否需要雨具、哪些类型的 POI 会受影响、天气是否应该影响安排、需要什么 Plan B。

核心原则：**天气结论的价值取决于时效诚实**——一条没有 `checked_at` 的"天气很好"，比没有数据更危险。

```
profile.json + research.json + candidates.json（+ review-analysis EXPERIENCE）
   → 天气数据 → 预测可信度分层 → 衣物/装备 → POI 天气敏感性
   → 风险识别 → 行程调整约束 → weather.json
```

## 2. Input Contract

必读三份：

- **profile.json**：destination / dates 决定研究窗口与时效档位（§3）；pace / interests / hard_constraints / party 决定影响评估的定向——`cannot_walk_long` 与 `slow` 是强制联动项（§8）。
- **research.json**：current_events（黄金周等客流背景）、travel_regions / accommodation_areas（空间背景）、warnings（重大风险继承，不得隐藏）、overview.climate_note（web-research 明确留给 weather 的口子）。
- **candidates.json**：**只消费已有 POI，不重新发现**——使用 rain_suitability / walking_intensity / constraint_risk / suggested_duration / type / candidate_category（含 rain_backup 池）。

可选输入：**review-analysis.json**——其 crowd_patterns / negative_themes 中的雨天、湿滑、排队类 EXPERIENCE 可被引用（须标注来源）；但本 Skill 不做评论分析。

缺失处理：dates 缺失（profile blocked）→ 无法定窗口，返回失败说明；candidates 缺失 → 只输出天气层（forecast / climate_reference / clothing / gear / weather_risks），poi_weather_impact 与 plan_b 置空并说明。

## 3. Forecast Horizon（预测时效分层）

按出行日距 checked_at 的距离**强制分层**，与主文件 §3 的时效原则一致。`forecast_horizon_class` 由日期计算得出，不由任何人的口吻决定：

| 档位 | 窗口 | 允许的数据 | 明确禁止 |
|---|---|---|---|
| `historical` | >10 天 | 仅历史气候 / 常年同期（climate_reference） | 任何逐日预测；把"常年 10 月初"说成"10 月 1 日会下雨/不下雨" |
| `trend` | 4–10 天 | 趋势参考 + climate_reference | 确定性措辞 |
| `near_term` | ≤3 天 | 较可信逐日预报（仍须 source / checked_at / forecast_window） | 无来源的断言 |
| `live` | 旅行进行中 | 实况 + 短时预报 | — |

- `historical` 与 `trend` 档 `needs_nearer_confirmation=true` 恒成立；逐日预报也要标"临近复核"。
- 示例：profile 为 2026-10-01~05、今天 2026-08-30（距出行 32 天）→ `historical` 档：`forecast=[]`，只输出 climate_reference + 衣物策略 + `needs_nearer_confirmation=true`。**不能因为用户要的是 10 月 1 日，就凭空给出"10 月 1 日 24℃ 小雨"。**

## 4. Data Sources

- **优先官方气象机构**（日本：气象厅 JMA；一般：国家气象部门、当地气象机构）；高质量天气服务为 A 层补充。
- 每条天气事实必须携带：`source + checked_at + forecast date/window + confidence`——三要素缺一不得输出。
- 不能因为一个天气网站预测下雨就当成确定事实；多源冲突时取保守口径并记录分歧。
- `source_tier`：`S` 官方气象 | `A` 高质量天气服务。评论与攻略不构成天气事实证据（review EXPERIENCE 只用于解读影响，见 §8）。

## 5. Climate Reference（历史/常年同期参考）

`historical` 档的核心产物：

```json
{ "period": "early_october", "typical_high": null, "typical_low": null,
  "rainfall_character": "", "humidity_character": "", "seasonal_notes": "",
  "source": {}, "confidence": "" }
```

- 允许字段：typical_high / typical_low / rainfall_character / humidity_character / seasonal_notes。
- **所有数字必须有来源**；拿不到就置 null，不编造。
- 措辞必须使用"常年同期 / 历史平均"，并显式声明：**这是历史参考，不是旅行日期的确定天气预测**。
- seasonal_notes 覆盖结构性信息：雨季与台风季尾巴、昼夜温差、日照时长、对人体感受的修正（湿度）等。

## 6. Clothing

```json
{ "base": [], "layer": [], "outer": [], "footwear": [], "notes": [] }
```

- 目标只有三个：舒适、温度适应、降雨适应。不是时尚推荐。
- `historical` / `trend` 档给**策略型建议**（分层逻辑），不绑定具体某天；`near_term` / `live` 档才按逐日预报细化。
- footwear 必须联动 hard_constraints：`cannot_walk_long` → 防滑、缓震、忌新鞋硬底。
- notes 记录依据（如"基于常年同期温度区间的分层策略，临近刷新"）。

## 7. Gear

```json
{ "umbrella": "recommended | optional | not_needed | unknown",
  "raincoat": "同上", "sun_protection": "同上", "other": [] }
```

- `historical` / `trend` 档无法确定某天是否下雨 → 用 `unknown` 或 `optional`，并注明依据（如"rainfall_character 显示该季节存在降雨可能"）。
- **禁止假装知道"某一天一定需要雨伞"**。
- sun_protection 联动季节与 UV 情况；other（折迭伞、防水袋等）须有 climate/forecast 依据，不堆清单。

## 8. POI Weather Sensitivity（天气影响模型）

本 Skill 最重要的能力。对 candidates.json 的每个 POI 评估：

```json
{ "poi_name": "", "weather_sensitivity": "low | medium | high",
  "rain_impact": "", "wind_impact": "", "temperature_impact": "",
  "recommended_action": "", "rain_backup": "", "source_basis": [] }
```

敏感性参考基线（**不要机械按 type 判断**，结合 POI 实际特性综合）：

- `low`：室内为主——博物馆、美术馆、室内展览。
- `medium`：部分室内部分户外——寺庙、商业街、城市摄影。
- `high`：高度依赖天气——山景、徒步、露天展望、游船、公园、长距离步行。

规则：

- 输入依据 = candidates 的 rain_suitability / walking_intensity / constraint_risk / type / suggested_duration + research 区域背景 + review-analysis 的雨天湿滑 EXPERIENCE（标注来源）。poi-attraction 的 rain_suitability 是 **POI 属性**，weather_sensitivity 是本 Skill 的**影响评估**——相关但不等同，不做机械拷贝。
- rain_impact / wind_impact / temperature_impact：**没有对应风险就留空或省略，不机械填满**。
- **cannot_walk_long 联动（强制）**：雨天湿滑、长距离步行、排队站立、大型开放空间、露天转场是核心放大因子——必须体现在相关 POI 的 recommended_action 中（如"雨天缩短户外段、优先有顶棚动线"）；但**不修改 candidates.json 与 POI verdict**，只提供 weather_impact 与 recommended_action。
- **slow 联动（强制）**：暴雨降低移动效率、恶劣天气放大户外耗时、雨天转场时间增加、室外活动不宜过密——作为约束写进 recommended_action；**不在本 Skill 内生成日程**。

## 9. Weather Risks

风险词表（**仅在有证据时输出**）：`heavy_rain / strong_wind / heat / cold / lightning / typhoon / slippery_surface / visibility`。

- 台风等极端天气：有官方预警时记录 `{hazard, severity, area, valid_time, source, checked_at, confidence}`。
- **不自行为用户决定取消旅行**——只提供风险输入；重大安全决策归主 Agent。research.json 的重大风险上下文必须继承且不得隐藏。
- 季节性风险（如夏末秋初的台风尾巴）可依据权威气候资料输出为结构性提示，但必须标注"季节性背景，非当前预警"。

## 10. Plan B

- **只允许引用 candidates.json 中已有的候选**（candidate_category 含 rain_backup，或 rain_suitability 高的室内项）：

```json
{ "for": "户外景点", "trigger": "rain", "swap_to": "室内博物馆", "reason": "室内、雨天适应度高" }
```

- candidates 中没有合适 Plan B → 该项标 `plan_b = "unavailable"`，交 Planner / POI 后续处理。
- 不修改 candidates.json，不搜索新 POI。

## 11. Output Contract

产物为 **weather.json**，落盘与否由主 Agent 决定，本 Skill 只产出内容。顶层：

| 字段 | 内容 |
|---|---|
| destination | `{country, region, city}` 回显 profile |
| travel_window | `{start, end, days, forecast_horizon_class, needs_nearer_confirmation}` |
| forecast[] | 逐日数据：date / temperature_min / temperature_max / condition / precipitation_probability / precipitation_amount / wind / humidity / uv_index / source / checked_at / confidence——**无法可靠获得的字段不编造；historical 档为空数组** |
| climate_reference | §5 结构 |
| clothing / gear | §6 / §7 |
| poi_weather_impact[] | §8 |
| weather_risks[] | §9 |
| plan_b[] | §10 |
| warnings[] | 远期预测不可靠 / 需临近刷新 / 数据源限制 / 极端天气风险 / 某 POI 敏感性证据不足 + 继承 research.json 重大风险（不得隐藏） |
| provenance_meta | `{checked_at, data_sources, degradation_notes[]}` |

## 12. Provenance

每条天气事实尽可能记录：

```json
{ "source": "", "url": "", "source_tier": "S | A", "checked_at": "", "confidence": "" }
```

- 优先 S 官方气象来源；URL 必须真实可访问，不伪造、不用搜索结果页充数。
- 确定性拿不准就标 `unknown`；"天气很好"这类结论若说不出什么时候查的，不得输出。

## 13. Failure Handling

| 场景 | 处理 |
|---|---|
| 官方气象源不可达 | 降级 A 层天气服务，confidence 相应下调，写入 degradation_notes |
| 远期且无可靠气候数据 | climate_reference 相应字段置 null + warnings 说明，不编造 |
| candidates 缺失或为空 | 只输出天气层；poi_weather_impact / plan_b 置空并说明 |
| dates 缺失（profile blocked） | 返回失败说明——无窗口则无法分析 |
| 极端天气预警无法核验 | 标 unknown + needs_nearer_confirmation=true，不渲染确定性风险 |
| 多源预报冲突 | 取保守口径 + 记录分歧 + 标临近复核 |

## 14. Non-responsibilities

以下明确不属于本 Skill：

1. POI 发现
2. 评论分析
3. POI 推荐排序
4. 地图路线
5. 餐厅推荐
6. 门票核验
7. 最终行程
8. Planner
9. Validator
10. 用户最终决策（含"是否因天气取消/改期旅行"）

一句话：weather 只提供**天气依据、影响评估与约束**，天气之下的行程决定权在 Planner 与用户。

## 15. Integration

- **travel-profile**：提供日期、目的地、节奏、硬约束、人群——窗口与定向联动的来源；不反向修改。
- **web-research**：提供目的地基础气候背景口子（其 overview.climate_note 明确声明"由 weather 临近确认"）、区域与当前事件、warnings 继承。
- **poi-attraction**：提供 rain_suitability / walking_intensity / constraint_risk / suggested_duration / candidate_category(rain_backup)——敏感性与 Plan B 的输入；不反向修改 candidates.json。
- **review-analysis**：可引用其雨天/湿滑/排队类 EXPERIENCE 作为 source_basis（标注来源）；不做评论分析。
- **itinerary-planner**：weather.json 的最终消费者——决定哪一天安排什么、哪个时段安排什么、启用哪个 Plan B；weather 只给约束不给日程。
- **主文件对齐**：§3 实现 §3 的时效三档原则（historical/trend/near_term + 面向行中 Copilot 的 live 档）；§5–§10 实现主文件 §5.3 的三层输出（确定性分层 → 影响映射 → 对策清单），穿衣建议按主文件定位作为副产品。
- **待主文件补登（仅报告，未修改）**：`weather.json` 未列入主文件 §8.0 的 plan/ 落盘清单（同 research.json 先例），建议未来修订时同步。
