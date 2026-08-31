# TravelGuide 东京端到端示范数据（Tokyo Demo）

这是 **TravelGuide** 系统的一次完整端到端示范运行产物：从用户画像到行程草案、验证结果，再到行中动态调整，共 11 份 JSON 资产，完整展示了 12 个 Skill 的协作链路。

## 数据生成 / 验证时间

**2026-08-30**（全部资产的 `checked_at` / `generated_at`）

## 文件清单

| 文件 | 生成 Skill | 内容 |
|---|---|---|
| `profile.json` | travel-profile | 结构化旅行画像：东京 / 2026-10-01~05 / 2 成人 / 预算 8,000 CNY 人均 / slow / 4 项兴趣 / cannot_walk_long / 成田+新宿锚点 |
| `research.json` | web-research | 目的地研究：概况、大交通衔接、当地交通、签证、当前事件（含赴日安全提醒）、区域结构、住宿带、17 条官方来源清单 |
| `candidates.json` | poi-attraction | 12 个 POI 候选画像（6 区域），含 preliminary/official_confirmed 事实状态与三维 fit |
| `review-analysis.json` | review-analysis | 12 个 POI 的多平台评论体验画像：正负主题、踩雷点、人群差异、拥挤规律（18 条 warning） |
| `weather.json` | weather | historical 档气候参考（无逐日预测）、穿衣/装备策略、12 个 POI 天气敏感性、5 组雨天 Plan B |
| `map-route.json` | map-route | 空间聚类（6 cluster）、新宿锚点与成田 gateway、22 条交通时间矩阵、mobility_cost |
| `food-restaurant.json` | food-restaurant | 8 个餐饮候选（含东京拉面街官方来源）、价格口径、排队 EXPERIENCE、区域餐饮模式 |
| `ticket-reservation.json` | ticket-reservation | 硬约束事实层：营业/票价/预约/开放窗口/可用性（含 2 项上游冲突闭环）、4 条 booking_reminders |
| `itinerary.json` | itinerary-planner | 5 天 draft 行程（revision_round=2）：8 POI 全保留、每日负荷、Plan B、6 条未解决冲突 |
| `validation.json` | trip-validator | round=2 验证：0 error / 18 warning → pass_with_warnings（收敛 5→0） |
| `copilot.json` | travel-copilot | 行中模拟事件 delta：10-03 暴雨下的局部重规划（Shibuya Sky 锚点保护） |

## 链路顺序

```
profile → research → candidates → review-analysis → weather
        → map-route → food-restaurant → ticket-reservation
        → itinerary(draft) → validation → copilot(行中)
```

## ⚠️ 重要：时效性声明

**这些 JSON 是 2026-08-30 的测试/示范快照，不代表当前实时旅游信息。**

其中以下内容具有时效性，用于真实旅行时**必须重新运行相应 Skill**：

- **天气**：`weather.json` 为 historical 档（常年气候参考），无逐日预测——出发前 ≤3 天必须刷新
- **票务/预约**：`ticket-reservation.json` 中的营业时间、票价、预约规则、库存均为快照（Shibuya Sky 等 10-03 场次需在 2026-09-19 后重新购票）
- **营业时间**：`food-restaurant.json` 与部分 POI 的营业时间均为 preliminary
- **交通**：`map-route.json` 为结构性口径，实时路况/班次需临近查询
- **评论分析**：`review-analysis.json` 基于快照时点的评论
- **安全提醒**：`research.json` 中的赴日安全提醒状态需临近复核

## 使用方式

1. 将本目录 11 份 JSON 复制到 `plan/`（或直接在 `plan/` 运行后对照）
2. 按上述链路顺序调用对应 Skill，即可复现或修改本次示范
3. 各资产的 `provenance_meta.degradation_notes` 记录了当时的数据缺口与降级情况——它们本身也是 Skill 行为的示范

## 隐私说明

画像为匿名测试数据（2 adults，无姓名/联系方式/证件号），不含任何凭据。
