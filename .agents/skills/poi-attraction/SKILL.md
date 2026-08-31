---
name: poi-attraction
description: TravelGuide 的景点/活动候选池构建 Skill：以结构化旅行画像（profile.json）与目的地研究（research.json）为输入，在 research 的区域结构内发现、筛选并建立标准化 POI 候选画像，产出 candidates.json，供主 Agent 向用户分类呈现"可选择的候选地点"。只做候选池构建：不做评论聚合分析（review-analysis）、天气预报（weather）、POI↔POI 交通矩阵（map-route）、逐景点票务官方核验（ticket-reservation）、餐厅推荐、行程规划，也不替用户做最终选择。
---

# poi-attraction — 景点与活动候选池构建

## 1. Role

poi-attraction 是 TravelGuide 的**景点/活动候选池构建 Skill**。它消费两份上游资产——profile.json（用户是谁、想要什么）与 research.json（目的地的空间认知与信息源地图）——产出一份标准化的 POI 候选画像集 candidates.json，供主 Agent 分类呈现给用户做选择。

一句话定位：它回答"这个目的地有哪些值得进入候选的地点、为什么可能适合这位用户"；不回答"按什么顺序去、要不要预约、最终去不去"。

```
profile.json + research.json → 区域优先的候选发现 → 画像化
   → 三阶段筛选/压缩 → candidates.json（候选，非决策）
```

## 2. Responsibilities

- 以 research.json 的 travel_regions 为优先搜索框架，按画像兴趣在区域内发现候选（§4）
- 三阶段候选池管理：发现 → 扩充 → 压缩（§4），规模受控（§11）
- 对每个候选做 Interest / Pace / Constraint 三维适配判断（§5），**必须显式记录 walking_intensity 与 constraint_risk**
- 建立标准化 POI 画像（§7），全程区分 FACT / EXPERIENCE（§8）
- 给出初步 verdict（§9）——它是候选优先级，不是用户决策
- 登记 provenance（§10），继承 S/A/B 来源体系与四种可信度
- 继承 research.json 的风险上下文到 warnings（§13），不隐藏、不擅自降权、不替用户决定

## 3. Input Contract

两份输入均为必读，缺一退回失败说明：

- **profile.json**（用户需求的唯一事实来源，travel-profile §13）：interests / hard_constraints / pace / budget / party 决定搜什么、筛什么；dates 决定候选池总量与季节性标注；booked.hotel 的住宿区域作为空间重心参考。
- **research.json**（目的地基础研究的唯一事实来源，web-research §15）：**travel_regions 是候选发现的优先框架**；entry_requirements / current_events / conflicts / warnings 作为上下文继承；source_registry 是检索起点。

规则：

- **区域优先**：research 表明"浅草·上野 = 历史文化密集区" → 就在该区域内找寺庙、神社、博物馆、历史建筑、摄影地点，而不是全城无差别搜索。
- 主 Agent 可附加上下文（额外关注点），但不得覆盖两份输入的事实。
- 复用 web-research 的结论与来源，不重复基础调研；超出 research 覆盖的新事实自行查证并登记来源。

## 4. Candidate Discovery

**先广后深，三阶段：**

**第一阶段·候选发现**：按 interests × travel_regions 交叉网格搜索。每个 research 区域至少覆盖其兴趣匹配方向；官方旅游信息、结构化平台、高质量旅游资料、社区内容均可使用，按 §8 分流。

**第二阶段·候选扩充**：保证以下六类都有代表，不允许池子被单一类型占满：

1. 经典必去（目的地代表性地标）
2. 兴趣强匹配
3. 小众（hidden-gem 方向）
4. 摄影价值突出
5. 雨天潜在备选（室内倾向）
6. 少步行友好

**第三阶段·压缩**：仅删除**明显不匹配**的地点（如与全部兴趣无关且无区域代表性）；边界项保留并降优先级，或标 `not_recommended` 并附原因（§9）。**不要随意删除用户画像可能感兴趣的地点**——存疑时保留，交给用户。

发现纪律：单一来源的孤立 POI 也可入池（如实标 single_source）；每入池一个即同步登记 provenance；发现阶段不做排序决策。

## 5. Candidate Filtering

每个候选必须判断并记录 `fit`：

- **Interest Fit**：与 interests 标签的对应关系，记录 `interests_matched[]`。
- **Pace Fit**：slow = 每日 1-2 个核心点（主文件 §7.1）。大而费时的目的地对 slow 是负担——`pace_fit ∈ good | ok | poor`。
- **Constraint Fit**：逐条检查 hard_constraints。对 `cannot_walk_long`：**不能把"历史建筑"默认视为适合用户**——面积巨大、步行距离长、坡度大、台阶多，必须显式记录 `walking_intensity` 与 `constraint_risk ∈ low | medium | high`；无障碍通道/接驳设施等信息如有来源一并记入 accessibility。

注意：`constraint_risk=high` 不等于自动剔除——保留候选，排序降权，并在 verdict.against 中说明代价，最终交用户取舍。

## 6. POI Taxonomy

主类型词表（可扩展）：`historical / cultural / museum / religious / nature / viewpoint / architecture / shopping / entertainment / theme_park / photo_spot / park / neighborhood / other`。

一个 POI = 主 `type` + `tags[]`。tags 沿用 travel-profile 的 interests 词表（history/culture/photography/food/...），使兴趣匹配可机器判断。

## 7. POI Profile

每个 POI 的画像结构（对齐主文件 §8.1 并细化）：

- **基础**：`name / type / tags / region / address / geo / suggested_duration`
- **事实字段**：`open_hours / ticket / reservation` —— 必须带初步/官方状态（§8），最终核验归 ticket-reservation
- **profile（体验画像）**：`culture_history / photo_value / internet_fame / crowd（含高峰时段）/ walking_intensity / rain_suitability / suitable_for / not_suitable_for`（主文件 §8.1 原有）；可选增补 `food_value / family_fit / elderly_fit / accessibility / seasonality` 与 `constraint_risk`——不堆无证据字段
- **reviews（评论画像，结构保留）**：`keywords / positive_themes / negative_themes / regret_notes` —— 默认空数组，配 `review_status="pending_review_analysis"`（§8）
- **verdict**：§9
- **provenance**：§10
- **候选管理**：`candidate_category`（classic / interest_match / hidden_gem / photo / low_walk / rain_backup / not_recommended，可多标）、`priority`（high / medium / low）、`fit`（§5）

## 8. Fact / Experience Rules

继承主文件 §3 与 web-research §6，并做本 Skill 的关键细化：

- S/A/B 三层来源，层级判定看发布者；B 层内容只进体验字段，永不进事实字段。
- **preliminary_fact 机制**：地址、geo、营业时间、门票、预约——若来源**不是能直接确认该事实的官方页面**，一律记为 `preliminary`（初步信息），字段值内标注来源等级与日期。即便第三方旅游网站给出了票价或开放时间，也只能是 preliminary，**最终以 ticket-reservation 的官方核验为准**（主文件 §5.5）。仅当来源是能直接确认该事实的官方来源时，才可标 `official_confirmed`。
- **reviews 字段默认空** + `review_status="pending_review_analysis"`：本 Skill 不做评论聚合与主题分析，不伪装成 review-analysis。检索中顺带看到的评论印象，只能以 B 层 experience 形式进入体验字段并注明，不得写入 reviews 结构冒充分析结果。

## 9. Preliminary Verdict

- verdict 是**基于 profile + 当前候选信息的初步判断**，用于候选排序与向用户呈现，不是用户决策（主文件不变式 3：用户拥有最终选择权）。
- 结构：`{ recommend, against, overall }`，`overall ∈ high | medium | low`（对应主文件 §8.1 的"高/中/低"）。不使用 0-100 分，不使用星级。
- **recommend 必须具体到该用户**：绑定其 interests / pace / hard_constraints / research 区域上下文；禁止"非常值得一去"式无证据空话；不因网上评分高就判"必去"。
- **against 必须写实质代价**：步行强度、拥挤时段、耗时、与住宿带的空间割裂等。
- **low / not_recommended 必须附原因**：与用户兴趣弱相关 / 步行量明显过高 / 与当前住宿带空间割裂 / 对当前节奏不友好。**不得仅因网上评分低而判定。**

## 10. Provenance

每个 POI 必须有：

```json
{
  "provenance": {
    "sources": [ { "tier": "S", "site": "", "url": "", "date": "" } ],
    "updated": "",
    "credibility": "verified_official | multi_source_consistent | single_source | unverified"
  }
}
```

- URL 必须来自实际检索到的真实内容页，不伪造、不堆无关搜索结果。
- 事实未经核验时 credibility 如实降级，宁低勿高。
- 整个候选池的运行情况（检索范围、时间、降级说明）记录在顶层 `provenance_meta`。

## 11. Candidate Pool Size

继承主文件 §2 公式：**候选池 ≈ 日均核心 POI 数 × 天数 × 2**。

示例：slow 节奏 ≈ 每日 1-2 个核心点 × 5 天 × 2 → 约 15-20 个候选。

必须保证池内结构：主流候选、兴趣强匹配、小众、备选（含雨天与少步行）都有代表。宁缺毋滥，不无限抓取；实际数量记入 `candidate_meta.pool_size`，目标记入 `candidate_target`。

## 12. Output Contract

产物为 **candidates.json**，落盘与否由主 Agent 决定（主文件 §8.0 已列入 plan/ 约定），本 Skill 只产出内容。顶层结构：

| 字段 | 内容 |
|---|---|
| destination | `{country, region, city}` 回显 profile |
| candidate_meta | `{profile_reference, research_reference, candidate_target, generated_at, pool_size}` |
| pois[] | 完整 POI 画像（§7） |
| regions_covered[] | 实际覆盖的 research 区域（对齐 travel_regions 命名） |
| selection_summary | `{classic_count, interest_match_count, hidden_gem_count, photo_count, low_walk_count, rain_backup_count}` —— 由 pois 统计得出，**不在这里替用户选** |
| warnings[] | 继承 research 风险上下文 + 本 Skill 自身警告（§13） |
| provenance_meta | `{checked_at, search_scope, source_registry_ref, degradation_notes[]}` |

POI 条目示例（说明形态；日期/URL 以实际检索为准，事实字段均为 preliminary 演示）：

```json
{
  "name": "浅草寺",
  "type": "religious",
  "tags": ["history", "culture", "photo_spot"],
  "region": "浅草·上野",
  "address": "东京都台东区浅草（preliminary）",
  "geo": null,
  "suggested_duration": "1-1.5 小时",
  "open_hours": "境内常时开放（preliminary，待 ticket-reservation 核验）",
  "ticket": "免费参观（preliminary）",
  "reservation": { "required": false, "status": "preliminary" },
  "profile": {
    "culture_history": "高", "photo_value": "高", "internet_fame": "高",
    "crowd": "全天偏旺，清晨相对缓和（B 层口径）",
    "walking_intensity": "medium（境内平地为主，雷门—本堂间为步行段）",
    "rain_suitability": "中（户外为主，雨天体验下降）",
    "suitable_for": ["历史文化兴趣者", "首次到访者"],
    "not_suitable_for": []
  },
  "reviews": { "keywords": [], "positive_themes": [], "negative_themes": [], "regret_notes": null },
  "verdict": {
    "recommend": "与 history/culture/photography 直接匹配，且位于 research 确认的历史文化密集区；免费、耗时短，适配 slow 节奏",
    "against": "人流大；参拜线路含中等步行量，cannot_walk_long 用户需控制活动范围",
    "overall": "high"
  },
  "provenance": {
    "sources": [
      { "tier": "S", "site": "浅草寺官网", "url": "https://www.senso-ji.jp/", "date": "2026-08-30（示例）" }
    ],
    "updated": "2026-08-30（示例）",
    "credibility": "multi_source_consistent（事实字段为 preliminary）"
  },
  "candidate_category": ["classic", "interest_match", "photo"],
  "priority": "high",
  "fit": { "interests_matched": ["history", "culture", "photography"], "pace_fit": "good", "constraint_fit": "ok" },
  "review_status": "pending_review_analysis"
}
```

## 13. Warning Handling

**research 风险上下文继承**：research.json 中未解除的赴日安全提醒等重大事项，必须作为 `research_context` 摘要带入 candidates.json 的 warnings[]，并注明出处指向 research.json。

行为红线：

- **不得**替用户决定取消旅行——安全提醒是决策输入，不是本 Skill 的决策权；
- **不得**因安全提醒偷偷删除全部候选；
- **不得**隐藏或弱化提醒；
- 正确行为：保留候选研究 + 完整继承风险上下文 + 由主 Agent 做用户决策闸门（主文件不变式 3）。

本 Skill 自身产生的警告（步行强度风险、票务 preliminary、季节性等）同样写入 warnings[]。

## 14. Non-responsibilities

以下明确不属于本 Skill：

1. 评论聚合与评论主题分析（review-analysis）
2. 天气预报（weather）
3. POI↔POI 交通矩阵（map-route）
4. 最终路线规划
5. 最终每日行程
6. 逐景点门票/预约的官方核验（ticket-reservation）
7. 餐厅推荐（food-restaurant）
8. 行中动态调整（travel-copilot）
9. **替用户决定去哪些地方**

一句话：本 Skill 只提供"候选池 + 画像"。**用户未确认的 POI 永远只是候选**，不得进入 itinerary（与主文件 §6 一致）。

## 15. Integration with travel-guide / web-research / travel-profile

- **travel-guide**：实现主文件 §2 契约表中 poi-attraction 行（交付物：POI 画像集 → candidates.json，主文件 §8.0 落盘约定已包含该文件）；画像结构对齐主文件 §8.1 并细化；池规模沿用主文件 §2 公式；候选/决策边界遵循主文件 §6 与不变式 3。
- **web-research**：直接上游。区域优先框架取自其 travel_regions；source_registry 作为检索起点复用；其 current_events/conflicts/warnings 作为 research_context 继承。在其结论之上深化，不重复基础调研。
- **travel-profile**：profile.json 是唯一需求事实来源；interests 词表与 POI tags 对齐以便机器匹配；注意词汇区分——POI 的 `preliminary` 是**事实核验状态**，与 profile 的 `user_provided/assumed/missing`（需求状态）不是同一体系，不混用。
- **扩展字段待主文件同步（仅报告，未修改上游）**：`region / tags / constraint_risk / fit / candidate_category / priority / review_status` 为对主文件 §8.1 的细化扩展；`preliminary | official_confirmed` 是对主文件 §3/§5.5 事实核验流程的中间状态细化（与"核验结果回写画像"条款一致，非冲突）。建议未来修订主文件时补登。
