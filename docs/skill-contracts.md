# TravelGuide Skill 契约速查（Skill Contracts）

以各 SKILL.md 为准的浓缩契约表。**修改任何 SKILL.md 前请先阅读本文件并在 PR 中说明契约影响。**

图例：`联网` = 允许/需要访问外部网络；`只读` = 不修改任何上游资产；`阶段` = Pre-trip 研究 / Planning / In-trip。

---

## travel-guide（orchestrator）

- **Input**：用户自然语言需求 + runtime 触发（全量规划/局部查询/行程体检/行中调整）
- **Output**：任务调度 + 汇总呈现；不直接产出 plan 资产
- **Responsibility**：需求理解、任务拆解、子 Skill 调度、汇总核对、组织用户决策
- **Non-responsibility**：不亲自执行专业环节；不替用户取舍
- 联网：经子 Skill 间接 ｜ 上游修改：无 ｜ 阶段：全流程编排

## travel-profile

- **Input**：用户自然语言需求
- **Output**：`plan/profile.json`（含 user_provided/assumed/missing 状态与假设清单）
- **Responsibility**：需求提取、一轮批量询问、默认假设显式化、基础合法性检查
- **Non-responsibility**：不做任何调研；destination/dates 永不假设
- 联网：否 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## web-research

- **Input**：`plan/profile.json`
- **Output**：`plan/research.json`（7 模块研究 + source_registry）
- **Responsibility**：目的地概况/大交通/当地交通/签证/当前事件/区域/住宿带；S/A/B 分级
- **Non-responsibility**：不做景点画像、评论分析、天气、路线、行程
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## poi-attraction

- **Input**：`plan/profile.json` + `plan/research.json`
- **Output**：`plan/candidates.json`（12 类 POI 候选画像，含 preliminary/fit/verdict）
- **Responsibility**：区域优先候选发现、三维适配（兴趣/节奏/步行）、初步 verdict
- **Non-responsibility**：不核验票务事实（preliminary 为上限）、不排行程、不替用户选
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## review-analysis

- **Input**：`plan/profile.json` + `plan/candidates.json`（+ research 上下文）
- **Output**：`plan/review-analysis.json`（正负主题/踩雷点/人群差异/拥挤规律/adjustment signal）
- **Responsibility**：多源评论清洗、主题聚类、人群差异、evidence_strength 分级
- **Non-responsibility**：不修改 POI verdict、不做事实核验、不伪造评论共识
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## weather

- **Input**：`plan/profile.json` + `plan/research.json` + `plan/candidates.json`
- **Output**：`plan/weather.json`（时效分层/气候参考/穿衣装备/POI 天气敏感性/Plan B）
- **Responsibility**：forecast horizon 分层（historical/trend/near_term/live）、影响映射、风险
- **Non-responsibility**：不生成逐日行程、不做天气预报冒充、不替用户决策
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip（live 档供 In-trip）

## map-route

- **Input**：`plan/profile.json` + `plan/research.json` + `plan/candidates.json`（weather/review 可选背景）
- **Output**：`plan/map-route.json`（clusters/anchors/travel_time_matrix/mobility_cost/spatial_efficiency）
- **Responsibility**：区域聚类、交通时间矩阵、跨区成本、cannot_walk_long/slow 空间数据
- **Non-responsibility**：不估算交通时间、不输出 Day 1/Day 2、不做路线推荐
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## food-restaurant

- **Input**：`plan/profile.json` + `plan/research.json` + `plan/map-route.json`（candidates 可选）
- **Output**：`plan/food-restaurant.json`（餐饮候选画像/价格口径/排队 EXPERIENCE/区域餐饮模式）
- **Responsibility**：餐饮发现与标准化、meal_period 覆盖、用户适配 fit
- **Non-responsibility**：不搜索新餐厅于行中、不做完整评论分析、不排用餐时间表
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## ticket-reservation

- **Input**：`plan/profile.json` + `plan/research.json` + `plan/candidates.json` + `plan/food-restaurant.json`
- **Output**：`plan/ticket-reservation.json`（poi/food_constraints、booking_windows、conflicts、硬约束事实层）
- **Responsibility**：官方来源核验营业/票价/预约/开放窗口/可用性；规则与库存严格分离
- **Non-responsibility**：不执行订位购票、不替用户放弃预约、不修改上游
- 联网：是 ｜ 上游修改：无 ｜ 阶段：Pre-trip

## itinerary-planner

- **Input**：`selected_pois` + `selected_food`（用户确认）+ 全部上游资产（ticket 层最高优先）
- **Output**：`plan/itinerary.json`（days/activities/meals/transfers/buffers/load/quality_summary，status=draft）
- **Responsibility**：时间窗建模、硬约束三层优先级、空间排日、餐饮插槽、Plan B、负荷与冲突暴露
- **Non-responsibility**：不验证行程（Validator 职责）、不隐式删除用户选择、不内嵌循环、不造事实
- 联网：否（交通时间必须读 map-route） ｜ 上游修改：无 ｜ 阶段：Planning

## trip-validator

- **Input**：`plan/itinerary.json` + 全部上游资产（事实与约束依据）
- **Output**：`plan/validation.json`（issues: error/warning + repair_hint + coverage + quality + round）
- **Responsibility**：只读验证——时间重叠/矩阵引用/闭馆/预约/票务/选择完整性/负荷/空间效率
- **Non-responsibility**：不修复行程、不调用 Planner、不重新搜索事实、不负责循环计数
- 联网：否 ｜ 上游修改：无（绝对只读） ｜ 阶段：Planning correction

## travel-copilot

- **Input**：runtime context（时间/位置/已完成/剩余/事件）+ `plan/itinerary.json` + 全部上游资产
- **Output**：`plan/copilot.json`（impact_analysis/proposed_changes/preserved_anchors/user_decision/validation/change_log）
- **Responsibility**：Minimal Change 局部重规划、锚点保护、轻量八项自查、trade-off 暴露
- **Non-responsibility**：不重新规划整趟旅程、不修改原 itinerary、不执行订位退订、不替用户决策
- 联网：是（唯一允许 live weather / 实时交通的场景） ｜ 上游修改：无 ｜ 阶段：In-trip

---

## 全局不变量（所有 Skill 共同遵守）

1. **上游资产只读**：12 个 Skill 均不修改彼此的输出文件；产物仅写入自己的交付物。
2. **事实与体验分离**：评论/攻略（B 层）永不写入事实字段。
3. **不虚构**：无来源的时间/价格/坐标/库存一律标 unverified/unknown，绝不补位。
4. **用户拥有最终决策权**：任何 Skill 的 verdict/signal 都是建议，取舍归用户与主 Agent。
5. **契约变更需同步**：修改任何 Skill 的输入/输出结构时，必须更新本文件与 [architecture.md](architecture.md)。
