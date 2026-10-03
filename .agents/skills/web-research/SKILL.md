---
name: web-research
description: Multi-source web research on the destination: overview, inter-city transport, local transit, visa/documents, current events affecting the trip, sightseeing areas, accommodation zones. Produces research.json plus a reusable registry of official sources. Research only — no POI picks, reviews, weather, routing, or itinerary. 中文：TravelGuide 的目的地综合信息研究 Skill：以结构化旅行画像（profile.json）为输入做多源联网研究，建立目的地基础认知——概况、大交通衔接、当地交通、证件签证、影响行程的当前事件、游览区域、住宿带——产出结构化 research.json 与可复用的官方信息源清单 source_registry，供主 Agent 及 POI/餐饮/票务/行程等后续 Skill 使用。只做"目的地基础研究 + 信息源"：不做景点推荐与画像、评论分析、天气预报、景点间交通矩阵、路线规划、餐厅推荐、逐景点票务核验与行程规划。
---

# web-research — 目的地综合信息研究

## 1. Role

web-research 是 TravelGuide 的**目的地综合信息研究 Skill**。输入一份结构化旅行画像（profile.json），输出一份结构化目的地研究（research.json）加一份可复用的官方信息源清单（source_registry）。它为主 Agent 与后续所有专业子 Skill 提供两样公共资产：**目的地的基础认知**与**到哪里核实事实的地图**。

一句话定位：它回答"这个目的地长什么样、游客怎么进出与移动、出行窗口内有什么必须知道的"；不回答"去哪玩、怎么排、要不要预约"。

```
profile.json → 多源联网研究（先广后深）→ 事实/体验分流 → 冲突处理
            → research.json + source_registry
```

## 2. Responsibilities

- 按 §4 的七个模块开展研究，研究深度按用户画像与出行远近伸缩（§7、§8）。
- 建立并维护结构化 source_registry（§11），明确供 ticket-reservation 等后续环节复用。
- 全程区分 FACT / EXPERIENCE（§6），每条事实带来源层级与置信度（§12）。
- 交叉验证高风险事实并按既定顺序处理冲突（§9）。
- 产出结构化 research.json（§10）。
- 搜索受限或失败时按 §13 降级处理，**任何情况下不编造信息、来源或 URL**。

## 3. Input Contract

**唯一需求输入是 profile.json**（travel-profile 产出），十个核心字段全部读取，各自用途：

| 字段 | 在本研究中的用途 |
|---|---|
| destination | 研究对象与范围 |
| dates | 研究时效分级（§7）与 current_events 的扫描窗口 |
| origin + destination + party | entry_requirements 的适用性判断（国籍组合、人群构成） |
| party / budget / pace / interests / hard_constraints | 各模块的研究深度与侧重点 |
| booked | 已确认的大交通/住宿锚点（如已订成田机票，则 gateway_transport 聚焦成田→市区衔接） |

- 主 Agent 可附加上下文（额外关注点、已确认信息），但附加内容不得与 profile 事实冲突，更不能取代 profile。
- **不得依赖用户原始自然语言作为数据源**——profile.json 是用户需求的结构化事实来源（travel-profile §13 的唯一事实来源原则）。
- profile 状态为 blocked 时的降级：destination 缺失 → 无研究对象，直接返回失败说明，不产出 research.json；仅 dates 缺失 → 可做结构性研究，但时效分级与 current_events 不可用，写入 research_meta.limitations。

## 4. Research Scope

七个独立模块，各自边界与禁做事项同样重要。

### 4.1 destination_overview

研究国家/地区基本信息、城市定位、核心旅游特点，以及**对本次画像最相关**的旅行特征（结合 interests / hard_constraints / pace）。不写百科全书——只收与实际旅行决策有关的信息。远期行程可附一句常年气候概述（结构性信息、非预报，标 `needs_recheck`，临近时由 weather Skill 细化）。

### 4.2 gateway_transport

主要机场与铁路/高铁/火车站；结合 booked 与 origin 判断本次可能使用的主要入口；入口 → 主要城市区域的常见交通方式与大致耗时；是否存在明显的夜间/末班交通限制。

边界：这是**目的地研究层面的交通概况**——不是 POI↔POI 交通矩阵（map-route），不是详细路线规划，不是最终行程。

### 4.3 local_transport

地铁、城市铁路、公交、出租车、网约车、渡轮、步行环境，以及交通卡/票制等对游客重要的信息。核心问题只有一个："游客在这个目的地通常怎么移动？"不做任何景点之间的路线计算。

### 4.4 entry_requirements

根据 origin → destination 组合与 party 构成，研究签证、免签、入境证件及其他可能影响行程的官方要求。**必须区分两种状态**：当前确认的官方规则（`confirmed_current`）与需临近确认的政策（`needs_nearer_confirmation`）。不得把过时页面当作现行政策——核对页面发布日期与官方发布记录。

### 4.5 current_events

以**用户旅行日期为扫描窗口**，研究节假日、大型展会、演唱会、体育赛事、城市庆典、交通管制、临时封路、安全提醒等明显影响客流或交通的事件。每条记录：`event / date / location / expected_impact / source / source_tier / confidence`（外加 checked_at）。规则：窗口外的旧活动不收录；**日期无法确认的不得伪造成确定事件**——date 置 null 并用 date_note 说明。

### 4.6 travel_regions

研究主要游客区域、历史文化区域、商业区域、夜生活区域、自然景观方向及适合不同偏好的区域。目标是建立**目的地的空间认知**——例如"区域 A：历史文化密集；区域 B：购物/商业；区域 C：夜生活；区域 D：自然景观"。不是景点清单：具体 POI 属于 poi-attraction，本模块最多做区域级描述。

### 4.7 accommodation_areas

研究主要住宿带、各区域特点、与机场/铁路/主要旅游区域的关系、适合什么类型的游客（结合预算档位与节奏）。**只研究区域，不做具体酒店推荐**——那是主 Agent 结合后续环节的决策。

## 5. Source Hierarchy

继承主文件 §3 的三级来源体系，适配到本研究场景：

| 层级 | 来源示例 | 允许承担 |
|---|---|---|
| S 官方 | 政府与文旅部门、移民局、外交/领事机构、机场/铁路/交通机构官方、景区官方、官方活动网站 | 签证与入境政策、交通规则、官方公告、当前事件、官方开放信息 |
| A 结构化平台 | 地图平台、官方/大型交通平台、结构化旅游平台 | 地理关系、大致交通方式与耗时、区域与位置结构 |
| B 社区/旅游内容 | 攻略、游记、社区帖子 | 仅旅行体验、区域感受、游客视角建议 |

- 层级判定看**谁发布**，不看页面载体：官方机构发布在社区平台的内容仍是 S 层（以原始发布者为准）。
- source_registry 优先登记 S 层来源（§11）。
- 不把任何一个网站作为唯一来源；每类信息保持至少一个备选来源。

## 6. Fact / Experience Separation

这是本 Skill 最重要的规则。每条研究结论必须标注 FACT 或 EXPERIENCE：

- **FACT**：可由来源验证的陈述（"成田机场有轨道交通进入市区"）。事实字段必须携带 source_tier + confidence + checked_at。
- **EXPERIENCE**：体验性判断（"游客普遍认为住新宿出行方便"）。只能来自 B 层（或 B 为主的多源），写入各模块的 `experience_note` / `tourist_tips` 等体验字段，**永不进入事实字段**。

红线示例：某篇旅游攻略写"地铁末班车 23:30"。若末班车对本次行程关键（如夜间到达），必须找交通机构官方核验；找不到 → `confidence=unverified` 并写入 warnings。**绝不能因为攻略这么写就把它当事实，更不能编造。**

关键事实（签证政策、机场衔接、大型活动日期、交通限制）执行 §9 的双源规则。

## 7. Time Sensitivity

按出行日距今的远近分两档（如 >30 天按远期、≤30 天加强当前扫描——约定值，主 Agent 可按行程调整）：

- **远期**：聚焦结构性、长期有效信息（签证框架、交通体系、区域结构、官方渠道清单）。即时活动、价格、排期一律标 `needs_recheck=true`（需临近确认）。
- **临近**：在远期基础上增加当前公告、活动、临时交通信息、最新政策扫描。

所有时间敏感内容逐条携带 `source_date`（来源发布时间）与 `checked_at`（查证时间）；发布时间无法确定的标 `source_date=null`。

## 8. Search Strategy

**先广后深，三层封顶**，不无限搜索：

1. **第一层·全貌**：快速建立目的地整体认知，覆盖 §4 全部模块。
2. **第二层·画像深挖**：围绕 interests / hard_constraints / party / booked 深挖相关模块（如亲子出行 → 区域安全与交通便利性；已订某机场 → 该机场进市区细节）。
3. **第三层·验证**：仅对关键、不确定或存在冲突的信息做进一步交叉验证（§9）。

规则：目标是有质量、与本次旅行相关、可验证的信息集合，**不是链接数量**；单模块搜索命中即收口；搜索语言兼顾中文与目的地官方语言/英语；边研究边登记 source_registry。

## 9. Conflict Resolution

**高风险事实清单**（每项至少 1 个官方来源 + 1 个独立辅助来源）：签证与入境政策、机场/车站衔接方式、大型活动日期、交通管制与限制。

多来源冲突时按此顺序处理：

1. 官方（S）优先于 A/B；
2. 官方之间仍冲突 → 取**更保守口径**（对旅行者约束更大的那个：更严格的签证条件、更早的末班车）；
3. 冲突本身写入 `conflicts[]`（主题、各方来源与主张、采用的口径）；
4. 标 `needs_recheck=true`，临近出行时复核。

**绝不静默选择一个来源然后假装没有冲突。**

## 10. Output Contract

产物为 **research.json**，落盘与否由主 Agent 决定，本 Skill 只产出内容。顶层结构：

| 字段 | 内容 |
|---|---|
| destination | 研究对象 `{country, region, city}`（回显 profile，供下游绑定） |
| overview | `{basics, positioning, key_features[], climate_note?, profile_relevant[]}` |
| gateway_transport[] | `{name, type: airport\|railway, relevant, to_city: [{mode, approx_time, source_tier, confidence}], night_limit}` |
| local_transport[] | `{mode, summary, tourist_tips[], source_tier, confidence}`，mode ∈ metro/rail/bus/taxi/rideshare/ferry/walking/transit_card |
| entry_requirements[] | `{subject, rule, applies_to, status: confirmed_current\|needs_nearer_confirmation, source_tier, confidence, checked_at}` |
| current_events[] | `{event, date\|null, date_note?, location, expected_impact, source, source_tier, confidence, checked_at}` |
| travel_regions[] | `{region, character[], fits_interests[], experience_note?, confidence}` |
| accommodation_areas[] | `{area, character, access, fits, confidence}` |
| source_registry[] | 见 §11 |
| conflicts[] | `{topic, positions: [{source, claim}], adopted, needs_recheck}` |
| warnings[] | `{topic, note}` |
| research_meta | `{researched_for: {destination, start, end}, checked_at, coverage, limitations[]}` |

紧凑示例（每个数组只展示一条，说明形态而非完整结果）：

```json
{
  "destination": { "country": "日本", "region": null, "city": "东京" },
  "overview": {
    "basics": "东京都，日本首都圈核心城市",
    "positioning": "都市型目的地：商业、历史、美食密度高",
    "key_features": ["轨道交通高度发达", "区域功能分化明显"],
    "climate_note": "10 月上旬常年温和少雨（结构性概述，非预报，临近以 weather 为准）",
    "profile_relevant": ["历史文化资源集中于山手线沿线东侧"]
  },
  "gateway_transport": [
    { "name": "成田国际机场", "type": "airport", "relevant": true,
      "to_city": [
        { "mode": "机场轨道交通", "approx_time": "约 40-60 分钟", "source_tier": "S", "confidence": "verified_official" },
        { "mode": "机场巴士", "approx_time": "约 60-90 分钟", "source_tier": "A", "confidence": "single_source" }
      ],
      "night_limit": "轨道有末班限制，具体时刻需临近确认" }
  ],
  "local_transport": [
    { "mode": "metro", "summary": "地铁+都营+私铁网络密集",
      "tourist_tips": ["交通卡通用范围广"], "source_tier": "A", "confidence": "multi_source_consistent" }
  ],
  "entry_requirements": [
    { "subject": "visa", "rule": "中国普通护照需提前取得签证（示例口径，以官方为准）",
      "applies_to": "origin=中国, party=2 adults", "status": "needs_nearer_confirmation",
      "source_tier": "S", "confidence": "verified_official", "checked_at": "2026-08-30" }
  ],
  "current_events": [],
  "travel_regions": [
    { "region": "上野·浅草一带", "character": ["历史文化"], "fits_interests": ["history", "culture"],
      "experience_note": "游客普遍反映白天热闹、适合步行游览", "confidence": "multi_source_consistent" }
  ],
  "accommodation_areas": [
    { "area": "新宿", "character": "交通枢纽型住宿带",
      "access": "多条轨道交汇，有机场直达轨道", "fits": "首访、重视交通效率的游客",
      "confidence": "multi_source_consistent" }
  ],
  "source_registry": [
    { "name": "东京都交通局", "url": "https://www.kotsu.metro.tokyo.jp/", "tier": "S",
      "topic": "local_transport", "checked_at": "2026-08-30", "reliability": "primary_official" }
  ],
  "conflicts": [],
  "warnings": [],
  "research_meta": {
    "researched_for": { "destination": "日本/东京", "start": "2026-10-01", "end": "2026-10-05" },
    "checked_at": "2026-08-30",
    "coverage": "7/7 模块完成；gateway 聚焦成田（依据 booked 机票锚点）",
    "limitations": ["酒店名称未定，accommodation_areas 按区域研究", "current_events 需临近复查"]
  }
}
```

## 11. Source Registry

每条来源的结构：

```json
{ "name": "", "url": "", "tier": "S", "topic": "", "checked_at": "", "reliability": "" }
```

- `topic` 词表（可扩展）：`visa / airport / railway / local_transport / tourism / events / safety / customs`。
- `reliability` ∈ `primary_official | high | medium | unknown`：该来源在其 topic 上的权威度评级。
- 规则：只登记**实际支撑结论或供后续核验**的来源，不堆搜索引擎结果页；URL 必须是实际内容页；S 层优先；随研究增量维护。
- **本清单明确设计为 ticket-reservation 的复用输入**：后续逐景点核验从这里出发，而不是重新搜索。

## 12. Confidence

与主文件 §3 的四种可信度一一对应，JSON 内使用英文值：

| 值 | 对应主文件术语 | 判定条件 |
|---|---|---|
| `verified_official` | 已核验官方 | S 层来源直接确认 |
| `multi_source_consistent` | 多源一致 | ≥2 个独立来源相互印证 |
| `single_source` | 单一来源 | 仅 1 个来源支撑 |
| `unverified` | 未核实 | 找不到可靠来源，或冲突未决 |

- 事实条目必须携带 confidence + source_tier + checked_at。
- **EXPERIENCE 类结论永远不能标 `verified_official`**——体验的共识再高也只是体验。

## 13. Failure Handling

| 场景 | 处理 |
|---|---|
| 搜索失败 / 无结果 | 换关键词、换来源、换语言重试；非关键项降低覆盖程度并写入 limitations；**不编造** |
| 官方网站无法访问 | 允许高质量替代来源暂代，但 confidence 相应降级、标 needs_recheck，且 source_tier **如实标注替代来源层级，不得伪装成官方** |
| 信息完全无法确认 | `confidence=unverified` + 写入 warnings；后续环节不得基于该信息下确定性结论 |
| profile 整体 blocked（destination 缺失） | 返回失败说明，不产出 research.json |
| profile 仅缺 dates | 可做结构性研究，时效分级与 current_events 标记不可用，写入 research_meta.limitations |
| 某模块整体无法覆盖 | 对应键置空数组 + limitations 说明；**不留空洞或编造内容** |

## 14. Non-responsibilities

以下明确不属于本 Skill：

1. 最终景点推荐与排序
2. 景点详细画像
3. 评论词云 / 评论主题分析
4. 天气预报与天气影响分析（属 weather；§4.1 的常年气候概述是结构性信息，不是预报）
5. 景点之间交通矩阵（属 map-route）
6. 详细路线规划
7. 餐厅推荐
8. 逐景点门票/预约核验（属 ticket-reservation）
9. 最终逐日行程
10. 行程校验
11. 行中动态调整
12. 具体酒店推荐（只做住宿带研究）

一句话：web-research 只提供**目的地基础研究 + 信息源**。

## 15. Integration with travel-guide

- 本 Skill 实现主文件 §2 契约表中 web-research 行（交付物：调研纪要 + 信息源清单 → research.json + source_registry），研究范围覆盖主文件 §5.1 的全部条目；住宿带在此细化为独立模块（4.7），与主文件"最佳游览区域与住宿带建议"一致。
- 来源层级对齐主文件 §3；置信度术语按 §12 映射保持一致；远期规则落实主文件 §5.1 的"结构性事实 vs 需临近确认"条款。
- 下游消费者：travel-guide（区域认知用于排日）、poi-attraction / food-restaurant（区域与交通概况缩小搜索面）、ticket-reservation（source_registry 直接复用）、itinerary-planner（大交通衔接、当地交通与事件约束）。本 Skill **不调用**其中任何一个，也不调用主 Agent——`web-research → 下游` 严格单向。
- research.json 是目的地基础研究的唯一事实来源；后续 Skill 在其上深化，不重复基础调研。
- **上游待补登（仅报告，未修改）**：主文件 §8.0 的 plan/ 落盘清单列有 profile / candidates / itinerary / validation 四个文件，未包含 research.json。建议未来修订主文件时补登 `research.json`；在此之前按"由主 Agent 决定是否落盘"执行。
