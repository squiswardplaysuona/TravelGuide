---
name: map-route
description: TravelGuide 的空间分析与交通矩阵 Skill：以 profile.json + research.json + candidates.json 为主要输入（weather/review-analysis 为可选背景），建立区域聚类、酒店与大交通锚点、POI↔POI 及锚点交通时间矩阵、mobility_cost 与跨区移动成本；输出空间事实与交通成本，不负责最终路线排序、行程规划与景点取舍。
---

# map-route — 空间分析与交通矩阵

## 1. Role

map-route 是 TravelGuide 的**空间分析与交通矩阵 Skill**。它回答：这些 POI 在空间上如何分布、哪些地点天然属于同一个区域、从酒店/交通枢纽到 POI 怎么移动、POI 之间的大致交通成本是多少、哪些跨区移动代价很高。

它**不回答"今天到底先去哪里"**——那属于 itinerary-planner。

最重要的边界（§30）：本 Skill 输出**空间事实 + 交通成本**，而不是旅游路线建议。

- 允许："浅草寺 → 东京国立博物馆约 15-20 分钟。"
- 禁止："所以 Day 2 上午先去浅草寺，再去博物馆。"

```
profile.json + research.json + candidates.json（+ weather/review-analysis 背景）
   → 地理定位 → 区域聚类 → 锚点 → 交通时间矩阵 → mobility_cost
   → 跨区移动成本 → 空间建议 → map-route.json
```

## 2. Input Contract

- **profile.json**（必读）：dates、pace、hard_constraints（cannot_walk_long 定向）、`booked.hotel`（→ hotel_anchor）、`booked.transport`（→ gateway_anchor）。
- **research.json**（必读）：travel_regions（聚类优先框架）、gateway_transport（大交通事实基础——**不重做基础机场研究**）、local_transport（当地交通方式背景）、accommodation_areas（住宿带空间背景）。
- **candidates.json**（必读）：全部 POI 的 geo / address / region / suggested_duration / walking_intensity / constraint_risk。**只消费已有 POI，不重新发现。**
- **weather.json**（可选）：只读 poi_weather_impact 与 weather_risks 中与**移动**相关的结论（雨天湿滑、转场成本上升）→ 记入 weather_mobility_notes；**不能反向修改地图事实**。
- **review-analysis.json**（可选）：步行、拥挤、排队类 EXPERIENCE 作体验补充；**不能覆盖实际地图距离**（主文件 §5.4：评论不能推翻地理事实）。

缺失处理：candidates 缺失 → 失败返回；booked.hotel / booked.transport 缺失 → 对应 anchor 置空并在 warnings 说明；POI geo 缺失 → 走地址定位（§12）。

## 3. Spatial Clustering

- **优先沿用 research.json 已定义的 travel_regions** 命名与划分；新增 cluster 必须有地理依据。
- 聚类依据：geo + region + research 区域结构。**不强行把距离很远的 POI 塞进同一个 cluster**——当 research 命名与实际地理距离冲突时，以 geo/地址为准并记录分歧。
- cluster 结构：

```json
{ "cluster_id": "", "name": "", "pois": [], "center": {},
  "character": "", "internal_walkability": "", "recommended_for": [] }
```

- `center` 使用区域中心近似即可。
- `internal_walkability` 是**空间描述**（内部步行距离与密度），不是用户体验评分。
- `recommended_for` 是空间适配描述（如"适合 slow：内部移动距离短、折返少"），不是行程推荐。

## 4. Anchors

- **hotel_anchor**：`profile.booked.hotel` 存在时必须建立：`{name, address, city, geo}`（anchor_type=hotel）。酒店是每天行程的空间原点——酒店 ↔ 各 POI / 各 cluster 的交通数据必须优先覆盖。
- **gateway_anchor**：`profile.booked.transport`（如成田机场到达）保留为：`{type: airport | railway | other, name, geo}`。gateway 的基础交通信息**优先使用 research.json 的 gateway_transport**，不重新做基础机场研究；需补充具体衔接路线时查地图/交通数据并记录来源。
- geo 不可得 → 使用地址文本定位（geocoding）；定位失败标 `unverified`，不猜坐标。

## 5. Travel Time Matrix（核心输出）

覆盖优先级（**不要求全排列、不无限计算**）：

1. hotel ↔ POI（每天出发/返回的空间原点）
2. 同区 POI ↔ POI
3. 相邻区域 POI ↔ POI
4. gateway → hotel（落地衔接）
5. 高频跨区连接

矩阵项结构：

```json
{ "from": "", "to": "", "distance": "", "walk_time": "", "transit_time": "",
  "recommended_mode": "", "transfers": 0, "mobility_cost": {},
  "notes": "", "source": {}, "confidence": "" }
```

- **路线不能只写一个数字**——尽可能分解为"交通方式 + 步行 + 换乘 + 总耗时"（例：步行 8min + 地铁 22min + 换乘步行 6min ≈ 36min）。所有实际数值必须有来源。
- 无来源的数字不写；查不到 → `confidence=unverified`，不拍脑袋估算。
- **cannot_walk_long 定向**：矩阵项必须显式暴露步行时间、换乘次数、长距离站内步行、上下楼（有可靠数据才写）、末班交通——供 Planner/Validator 判断，不由本 Skill 判定 POI 去留。
- **slow 定向**：标注哪些连接"少折返、少换乘、站内步行短"。

## 6. Transport Modes

支持词表：`walking / metro / railway / bus / taxi / rideshare / ferry / mixed`。

- 实际没有的数据不编造；mode 无法确认 → 标 `unknown` 并在 notes 说明。
- `recommended_mode` 是"该 OD 对通常最适合的模式"（空间事实），仍不是行程指令。

## 7. Mobility Cost

每条矩阵项附加三维度复杂度——供 Planner / Validator 消费，**不是推荐**：

```json
{ "walk": "low | medium | high", "transfers": "low | medium | high", "complexity": "low | medium | high" }
```

- `walk=high` 的触发：步行时间过长、站内长通道、上下楼多（有可靠数据才具体化）。
- `transfers=high`：换乘次数多或跨公司线路换乘。
- `complexity=high`：复杂枢纽、易迷路站体（review EXPERIENCE 可佐证，但定级需结构数据支撑）。
- **最快路线 ≠ 最佳路线**：用户 pace=slow 且 cannot_walk_long 时，Planner 需要用这三个维度而非总耗时做取舍——本 Skill 只保证维度数据可得。

## 8. Cross-region Connections

cluster_connections（只列主要连接，不做 N² 全覆盖）：

```json
{ "from_cluster": "", "to_cluster": "", "recommended_modes": [],
  "approx_time": "", "complexity": "", "notes": "", "source": {} }
```

跨区成本分级：

- `low`：同一片区内部（浅草 ↔ 上野）。
- `medium`：相邻片区。
- `high`：远距离跨区（浅草 ↔ 涩谷）——必须与相邻区明显区分。

## 9. Weather Mobility Notes

只读 weather.json 的 poi_weather_impact.recommended_action 与 weather_risks 中与**移动**相关的结论：

```json
{ "cluster": "浅草·上野", "note": "户外连接段受雨影响，步行成本上升", "source": "weather.json" }
```

- 记录为背景注释；**不修改原始天气数据，不改动地图事实**。
- Plan B 本身仍来自 weather.json 与 candidates.json——本 Skill 只帮助判断两个候选是否空间上靠近。

## 10. Provenance

每条矩阵项 / 连接尽可能记录：`{source, url, source_tier: S | A, checked_at, confidence}`。

- `S` 官方交通机构与运营方（JR/地铁/机场官方）；`A` 地图与结构化交通平台。
- **实时数据规则**：若使用当前时刻的交通信息，必须标 checked_at 并注明"实时/当前时刻数据"；**旅行日期较远时（如 32 天），不得把今天的交通状况描述成 10 月 1 日一定如此**——结构性班次与耗时可以引用，实时路况不可迁移。
- 不伪造路线数据；查不到就 `unverified`。

## 11. Output Contract

产物为 **map-route.json**，落盘与否由主 Agent 决定，本 Skill 只产出内容。顶层：

| 字段 | 内容 |
|---|---|
| destination | `{country, region, city}` 回显 profile |
| anchors | `{hotel: [{name, address, city, geo}], gateway: [{type, name, geo}]}` |
| clusters[] | §3 结构 |
| travel_time_matrix[] | §5 结构（含 mobility_cost） |
| cluster_connections[] | §8 结构 |
| spatial_efficiency[] | `{cluster, internal_efficiency: high\|medium\|low, reason}`——空间效率描述，**不是推荐行程** |
| weather_mobility_notes[] | §9 结构 |
| warnings[] | geo 缺失项、unverified 矩阵项、anchor 缺失、数据源降级 + 继承 research.json 重大风险上下文（不得隐藏） |
| provenance_meta | `{checked_at, data_sources, matrix_coverage, degradation_notes[]}` |

- 待主文件补登（仅报告）：`map-route.json` 未列入主文件 §8.0 的 plan/ 落盘清单（同 research / weather 先例）。

## 12. Failure Handling

| 场景 | 处理 |
|---|---|
| POI geo 缺失 | 地址文本定位（geocoding）；仍失败 → 该项标 `unverified`，不猜坐标 |
| 路线不可确认 | `confidence=unverified`，不拍脑袋给数字 |
| 交通平台不可访问 | 换可信来源（官方运营方优先）+ degradation_notes 记录 |
| 跨区矩阵过大 | 按 §5 优先级裁剪：酒店↔POI > 同区 > 相邻 > 高频跨区 |
| review / weather 与地图事实冲突 | 地图事实为准；体验与天气内容仅作注释并记录差异 |
| 实时数据与结构性数据冲突 | 结构性班次为准；实时数据单独标注 checked_at 与"当前时刻"属性 |

## 13. Non-responsibilities

以下明确不属于本 Skill：

1. 景点发现
2. 评论分析
3. 天气预报
4. 餐厅推荐
5. 票务核验
6. 最终行程
7. Planner
8. Validator
9. Travel Copilot
10. 最终"去哪"的排序

一句话：map-route 输出**空间事实 + 交通成本**；"先去哪、后去哪"永远不在这里发生。

## 14. Integration

- **travel-profile**：dates / pace / hard_constraints / booked.hotel / booked.transport → 锚点与定向（cannot_walk_long、slow）。
- **web-research**：travel_regions / gateway_transport / local_transport / accommodation_areas → 聚类框架与大交通事实；map-route 在其上做具体矩阵，不重复基础研究。
- **poi-attraction**：候选 POI 的 geo / address / region / walking_intensity / constraint_risk → 聚类与矩阵对象；不反向修改 candidates.json。
- **weather**：poi_weather_impact → weather_mobility_notes（只读背景）；不反向修改 weather.json。
- **review-analysis**：步行/拥挤 EXPERIENCE → 注释佐证；不能覆盖地理事实。
- **itinerary-planner**：map-route.json 的最终消费者——依据矩阵与 mobility_cost 排日；本 Skill 不输出 Day 1 / Day 2。
- **trip-validator**：主文件 §7.2 校验"交通时间来自真实矩阵"——本 Skill 的产物即该数据源。
- **主文件对齐**：实现主文件 §2 表 map-route 行（交付物：分区结果 + 交通时间矩阵）与 §5.4 全部规则（聚类为排日基础、矩阵覆盖优先级、空间数据只回答空间问题）。
- **待主文件补登（仅报告，未修改）**：`map-route.json` 落盘清单同步（同 research / weather 先例）。
