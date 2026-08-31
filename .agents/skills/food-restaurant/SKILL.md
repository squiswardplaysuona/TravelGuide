---
name: food-restaurant
description: TravelGuide 的餐饮候选构建 Skill：以 profile.json + research.json + map-route.json 为主要输入（candidates.json 可选），在旅行区域与集群空间内发现并标准化餐厅、居酒屋、市场、美食街及特色饮食体验候选，分析价格口径、营业时间、预约线索、排队体验、用餐时段与用户适配；只产出候选池，不负责最终餐厅选择、完整评论分析与用餐时间表。
---

# food-restaurant — 餐饮与用餐候选构建

## 1. Role

food-restaurant 是 TravelGuide 的**餐饮与用餐候选构建 Skill**。它回答："这个用户旅行期间，有哪些适合的餐厅、市场、美食街与特色饮食体验？"它**不回答"今天中午到底去哪家"**——最终餐饮选择属于主 Agent + itinerary-planner。

与 poi-attraction 的分界必须明确：

| | poi-attraction | food-restaurant |
|---|---|---|
| 对象 | 景点、博物馆、历史建筑、自然景观、文化地点、摄影点 | 餐厅、居酒屋、咖啡馆、市场、美食街、特色小吃、饮食文化体验 |
| 本质 | 游览型 POI 候选 | 用餐型候选 |

两者不互相收录、不互相复制逻辑。

```
profile.json + research.json + map-route.json（+candidates.json 可选）
   → 餐饮发现 → 筛选 → 餐饮画像 → 价格/营业/预约/排队整理 → 餐饮候选池
```

## 2. Input Contract

- **profile.json**（必读）：destination / dates / party / budget（**特别关注 amount、currency、amount_basis**）/ pace / interests（food 标签）/ hard_constraints（dietary_restriction、cannot_walk_long）/ booked。
- **research.json**（必读）：travel_regions、accommodation_areas（住宿带周边餐饮）、local_transport、current_events（节假日/大型活动对排队的影响）、source_registry。
- **map-route.json**（必读）：hotel anchor、clusters、travel_time_matrix、mobility_cost——让餐饮候选与用户可能活动的区域形成**空间关联**。
- **candidates.json**（可选）：了解用户可能在哪些区域活动、餐饮候选是否适合与某些 POI 形成用餐节点；**不修改 candidates.json**。

缺失处理：map-route 缺失 → 无法做空间关联，nearby_* 置空并说明；profile 缺失 → 返回失败。

## 3. Food Discovery

研究方向（按 research 区域 + map-route clusters 优先，**这些是方向不是预设结论，必须真实来源支撑**）：

1. 当地特色料理与经典名店；2. 平价本地餐；3. 中档与高端餐饮；4. 小吃/街头食品；5. 市场/美食街；6. 咖啡/甜品；7. 用户兴趣对应的特色饮食体验（profile.interests 含 food 时的深度）；8. 与候选 POI 空间高度匹配的用餐节点。

区域研究方向示例（东京）：浅草·上野 → 寿司/天妇罗/鳗鱼/传统甜品；新宿 → 居酒屋/拉面/咖啡；涩谷·原宿 → 咖啡/洋食/话题餐饮。实际候选以来源为准。

**候选池规模**（继承主文件 §2 公式思想）：餐饮候选 ≈ 每天主要用餐槽位 × 天数 × 2（如 2 餐 × 5 天 × 2 ≈ 20）。**质量优先**：只有 12 个高质量候选时，不为凑 20 塞低质项。

## 4. Food Taxonomy

主 `type` 词表（可扩展）：`restaurant / izakaya / ramen / sushi / tempura / yakitori / cafe / dessert / market / food_street / street_food / bakery / local_specialty / fine_dining / other`。

一个候选 = 主 type + `tags[]`（如 local_specialty、family_friendly、photo_friendly）。**不为分类而制造不存在的菜系或业态。**

## 5. Price Model

价格必须机器可读，且**与用户预算口径严格分开**：

```json
{ "amount": null, "currency": "JPY",
  "basis": "per_person | per_dish | set | unknown",
  "level": "budget | medium | premium | luxury | unknown",
  "source_status": "preliminary | official_confirmed | unknown" }
```

- "人均 2,000 日元" ≠ "整桌 2,000"——basis 必须如实标注。
- 与 profile 预算比较时必须口径一致（budget.amount_basis=per_person 对 per_person）；**跨币种换算由主 Agent/Planner 处理**，本 Skill 记录原币价格，不自行引入汇率误差。
- level 是相对档位判断（budget/medium/premium/luxury），需结合目的地消费水平与来源，不确定标 unknown。
- source_status 沿用 preliminary 机制：第三方平台价格只能 preliminary，官方页面才 official_confirmed。

## 6. Meal Period

每个候选标注适用的 `meal_period[]`：`breakfast / lunch / dinner / cafe / dessert / late_night`（可多选，以营业时间与业态为依据）。meal_period 是**候选属性**（"这家适合晚餐"），不是日程安排（"Day 2 19:00 去这家"属于 Planner，§21 边界）。

## 7. Opening Hours

`opening_hours` 记录来源与状态：第三方网站的营业时间一律 `preliminary`；官方页面（官网/官方账号）直接载明才可 `official_confirmed`；最终逐餐厅关键营业事实核验归 ticket-reservation 或后续核验环节。拿不到就 `unknown`，不编造。

## 8. Reservation

```json
{ "required": null, "status": "preliminary | official_confirmed | unknown", "channel": null, "advance": null }
```

- 只记录"是否可能需要预约、目前发现的预约信息"（如"发现官网支持在线预约"是发现，不是核验）。
- **不把本 Skill 做成 booking agent**：是否真需要预约、提前量、渠道可用性、是否售罄——最终核验归后续票务/预约环节。

## 9. Queue

```json
{ "queue_experience": "", "peak_periods": [], "expected_wait": "", "source_status": "experience | unknown" }
```

- 排队信息来自游客体验，属于 **EXPERIENCE**："游客普遍反映周五晚排队较长"可以记录。
- **禁止**无可靠实时数据支撑的伪精确表述（"每天 18:00 固定排队 42 分钟"）；expected_wait 只能是定性区间且标注 EXPERIENCE。

## 10. Dietary Constraints

对 profile 中存在的 dietary_restriction（vegetarian / vegan / halal / allergy / religious diet）逐条检查候选：

- 只记录**餐厅公开信息与来源**（如官网/菜单页明示素食选项）。
- **不做医学建议，不保证"100% 无过敏风险"**；无公开信息的字段标 unknown。
- 无 dietary_restriction 时此节不产出内容。

## 11. Party Fit

party 含 children / seniors 时分析：seating（座位形态）、family_friendliness、access、noise、waiting——只描述公开可得的客观特征，**不做医学或心理判断**。party 为纯成人时此节从简。

## 12. Mobility / Pace Fit

- **mobility_fit**（cannot_walk_long 联动）：消费 map-route.json 的空间与交通事实——离住宿锚点/活动 cluster 的距离、从主要交通点的步行段、大型市场内部步行量、排队是否站立。**不自行计算完整路线。**
- **pace_fit**（slow 联动）：不需要长距离绕路、用餐时长合理、预约时间灵活性、不会严重破坏当天节奏。**不排当天的午饭和晚饭**——那是 Planner 的事。

## 13. Fact / Experience

| FACT（来源：S/A 层） | EXPERIENCE（来源：B 层评论/社区） |
|---|---|
| 地址、geo、官方营业时间、官方价格、官方预约渠道 | 好不好吃、排队是否严重、氛围、服务、态度、"游客认为值得吗" |

- 评论永远不能覆盖官方事实；评论中的价格/时间与官方口径冲突时记录差异并移交核验（fact_claim_conflict，同 review-analysis 机制）。
- 本 Skill 可记录**少量游客体验线索与初步排队印象**，但完整的 keywords / positive_themes / negative_themes / regret_notes 分析属于 review-analysis——**未来可扩展 review-analysis 支持 restaurant 对象，本 Skill 现在不复制那套逻辑**。

## 14. Preliminary Verdict

```json
{ "recommend": "", "against": "", "overall": "high | medium | low" }
```

- verdict 是**候选优先级**，不是最终用户选择（主文件不变式 3）。
- recommend 必须具体到该用户（"适合想体验东京本地老铺、预算中等的用户"）；against 必须写实质代价（"晚餐高峰可能排队，且座位狭窄"）。禁止"非常值得去"式空话。
- **不把平台评分直接当推荐**——评分是参考输入，结论必须绑定 fit 与来源。

## 15. Provenance

```json
{ "sources": [ { "tier": "S | A | B", "site": "", "url": "", "date": "" } ],
  "updated": "", "credibility": "" }
```

- S 官方（餐厅官网/官方账号）| A 地图与结构化平台 | B 评论社区。
- URL 必须真实；credibility 沿用主文件 §3 四种可信度；第三方价格/时间一律降级为 preliminary。

## 16. Candidate Pool

- 规模公式见 §3；实际数量记入 `food_meta.pool_size`，目标记入 `candidate_target`。
- 结构要求：类型多样（正餐/小吃/市场/咖啡甜品）、价位覆盖 budget-medium、用餐时段覆盖 lunch/dinner 为主、空间上覆盖用户活动区域。
- 每入池一个同步登记 provenance；发现阶段不做排序决策。

## 17. Output Contract

产物为 **food-restaurant.json**，落盘与否由主 Agent 决定，本 Skill 只产出内容。顶层：

| 字段 | 内容 |
|---|---|
| destination | `{country, region, city}` 回显 |
| food_meta | `{profile_reference, research_reference, map_reference, generated_at, candidate_target, pool_size}` |
| restaurants[] | 餐饮候选画像（见下） |
| regional_food_patterns[] | §18 |
| meal_period_coverage | `{breakfast, lunch, dinner, cafe, dessert, late_night}`——**由 restaurants 实际统计得出，不得手填不一致的数字** |
| warnings[] | 数据源限制、preliminary 状态汇总、排队证据不足、继承 research.json 重大风险（不得隐藏） |
| provenance_meta | `{checked_at, data_sources, degradation_notes[]}` |

restaurants 单项结构：

```json
{ "name": "", "type": "", "tags": [], "cuisine": [], "region": "",
  "address": "", "geo": null,
  "price": { "amount": null, "currency": "", "basis": "", "level": "", "source_status": "" },
  "meal_period": [], "opening_hours": "",
  "reservation": { "required": null, "status": "", "channel": null, "advance": null },
  "queue": { "queue_experience": "", "peak_periods": [], "expected_wait": "", "source_status": "" },
  "signature_items": [ { "name": "", "source": "" } ],
  "experience": { "atmosphere": "", "locality": "", "tourist_popularity": "" },
  "nearby_clusters": [], "nearby_pois": [],
  "fit": { "interest_fit": [], "party_fit": "", "mobility_fit": "", "pace_fit": "" },
  "verdict": { "recommend": "", "against": "", "overall": "high | medium | low" },
  "provenance": {} }
```

- `experience` 只放 B 层体验摘录（atmosphere/locality/tourist_popularity），不做主题聚类分析。
- `nearby_clusters / nearby_pois` **必须来源于 map-route.json 的空间数据**（cluster 归属 + 矩阵邻近性），不凭名称猜测距离。

## 18. Regional Food Patterns

"某区域主要吃什么"的结构化总结：`{region, patterns[], evidence[]}`。

- 必须有来源（research 区域结论 + 实际候选证据）；不做百科式罗列。
- 这是"研究方向的依据说明"，不是菜单大全。

## 19. Failure Handling

| 场景 | 处理 |
|---|---|
| 餐厅地址无法确认 | address/geo 标 `unverified` |
| 价格不确定 | price.source_status = preliminary / unknown |
| 评论很少 | experience 不形成强结论，标注证据薄弱 |
| 餐饮平台无法访问（登录墙/反爬） | 换来源 + provenance_meta.degradation_notes |
| 只有大量评分没有内容 | 不把评分当体验分析（score≠experience） |
| map-route 缺失 | nearby_* 置空、mobility_fit 标不可评估 |

## 20. Non-responsibilities

以下明确不属于本 Skill：

1. 景点发现（poi-attraction）
2. 完整评论分析（review-analysis，含 keywords/themes/regret 结构）
3. 天气（weather）
4. 地图路线计算（map-route）
5. 逐餐厅票务/预约的最终核验（ticket-reservation）
6. 最终餐厅选择
7. 用餐时间表 / Day 1 / Day 2（itinerary-planner）
8. Validator
9. Travel Copilot
10. 订位代理（booking agent）

一句话：food-restaurant 只提供**餐饮候选池 + 画像**；用户未确认的餐饮候选永远只是候选。

## 21. Integration

- **travel-profile**：budget（amount/currency/amount_basis）、interests（food）、hard_constraints（dietary_restriction、cannot_walk_long）、party、pace → 筛选与 fit 的依据；不反向修改。
- **research.json**：travel_regions / accommodation_areas / current_events（节假日排队放大）/ source_registry → 发现范围与排队解读。
- **map-route.json**：hotel anchor / clusters / matrix / mobility_cost → nearby_* 空间关联与 mobility_fit；不反向修改。
- **candidates.json**（只读）：用餐节点与 POI 活动区域的空间衔接参考。
- **review-analysis**：本 Skill 只记录体验线索；完整的餐饮评论画像可由 review-analysis 未来扩展支持（restaurant 对象），届时本 Skill 的 experience 字段作为其输入。
- **ticket-reservation**：消费 preliminary 的营业/预约线索做官方核验；本 Skill 不做核验。
- **itinerary-planner**：最终消费餐饮候选池，把用餐槽位落入日程；本 Skill 不排餐。
- **主文件对齐**：实现主文件 §2 表 food-restaurant 行（餐饮画像，复用 POI 结构的餐饮变体）；候选/决策边界遵循主文件 §6 与不变式 3。
- **待主文件补登（仅报告，未修改）**：`food-restaurant.json` 未列入主文件 §8.0 的 plan/ 落盘清单（同 research/weather/map-route 先例）。
