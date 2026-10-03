---
name: review-analysis
description: Multi-platform tourist review analysis for candidate POIs — clusters reviews into keywords, positive/negative themes, pitfalls, crowd differences and congestion patterns to build an experience profile. Experience judgment only — never writes facts, no discovery, verification, weather, routing, or final decisions. 中文：基于候选 POI 的多源游客评论分析 Skill：以 profile.json + research.json + candidates.json 为输入，将多平台游客评论清洗、聚类为关键词、正负主题、踩雷点、人群差异、拥挤规律与体验信号，为主 Agent 提供"游客真实体验"评价画像；不负责景点发现、事实核验、天气、路线、餐厅推荐或最终决策，不覆盖 POI 的 verdict。
---

# review-analysis — 游客评论与体验画像分析

## 1. Role

review-analysis 是 TravelGuide 的**游客评论与体验画像分析 Skill**。它回答一个问题：**"游客的真实体验到底是什么样？"**——不是"评分多少"，而是：什么人喜欢它、什么人去了后悔、差评的真实原因是什么、拥挤与排队有什么规律、以及这些体验对**当前这位用户**有多重要。

```
candidates.json + 多源游客评论 → 评论发现 → 清洗 → 主题聚类 → 正负分离
   → 关键词提取 → 人群差异识别 → 踩雷点 → 拥挤/排队规律 → 景点评价画像
```

三条铁律先行，其余规则都是它们的展开：

1. **评论不是事实**——评论中出现的门票、营业时间、预约规则永远不进事实字段（§7 fact_claim_conflict）。
2. **共识不是单条**——一条高赞笔记不是游客共识，任何结论必须挂 evidence_strength（§11）。
3. **信号不是决策**——本 Skill 只产出 review_adjustment_signal，不覆盖 POI verdict，不做最终推荐（§16）。

## 2. Input Contract

必读三份，缺一降级处理：

- **candidates.json**：**本 Skill 的分析对象**。只分析其中已有的 POI，不自行扩大 POI 范围。POI 的 `reviews` 字段此时为空数组、`review_status="pending_review_analysis"`（poi-attraction 预留）——本 Skill 的产出就是填补这个位置。
- **profile.json**：interests / pace / hard_constraints / party——决定哪些评论主题对当前用户更重要（§9 定向）。缺失时只能产出通用画像并显式标注"未做用户定向"。
- **research.json**：目的地区域背景、source_registry、当前风险上下文（黄金周客流、安全提醒）——解读拥挤主题、限定分析窗口时必需。

主 Agent 可附加上下文（用户特别关心的点），但不得覆盖三份输入的事实。

## 3. Review Sources

允许研究的平台：小红书、大众点评、Google Reviews、Tripadvisor、Reddit、马蜂窝、穷游、携程等**有真实用户体验内容**的社区；其他平台按同一标准评估。

- 全部评论内容按主文件 §3 属 **B 层社区内容**；评论结论永远不能获得 verified_official（§11）。
- **平台生态差异必须尊重**：不同平台的筛选机制、用户群与表达文化不同（中文社区偏打卡视角、Tripadvisor 偏国际游客、Reddit 偏深度讨论）。不能把一个平台的一条高赞笔记当成"游客共识"；跨平台、多独立来源重复出现的模式才可能形成共识。
- 平台偏见本身要记录：写评论的人不是随机样本（自选择偏差），极端体验更容易被写出来。
- 官方网站的开放时间/票价说明**不是评论证据**——那是 ticket-reservation 的事实领地。

## 4. Review Cleaning

进入分析前过滤：

- 重复评论、同一内容转载
- 营销软文、明显广告
- AI 生成嫌疑评论——**仅按明显模式降权**（模板化措辞、无具体细节、批量相似特征）；不声称能准确检测所有 AI 评论
- 无实际体验内容、信息量过低（"太棒了！"不是证据）
- 极端单一观点（与大量独立评论相矛盾的孤例，降权但记录）

记录：`usable_review_count / filtered_count / filter_reasons[]`。诚实原则：只统计真正能确认的数量；"搜索到若干评论内容"不等于平台总评论量。

## 5. Theme Clustering

评论不能只做词频统计，必须聚成**主题**。主题词表（可扩展）：交通 / 拍照 / 历史氛围 / 拥挤 / 排队 / 商业化 / 服务 / 卫生 / 步行强度 / 性价比 / 餐饮 / 预约 / …

每个主题：

```json
{ "theme": "", "frequency": "frequent | common | occasional | rare",
  "sentiment": "positive | negative | mixed",
  "evidence_strength": "single_source | low | medium | high",
  "examples_count": 0 }
```

- frequency 用定性档位，**不制造虚假统计精度**——除非拥有可验证的统计样本，禁止"87.3% 的游客认为很好"式表述。
- examples_count 只写真实可追溯的条数，不估算。

## 6. Keyword Extraction

`keywords` **来自主题聚类结果**，不是原始词频堆砌：

```json
[ { "term": "雷门", "weight": 0.92, "sentiment": "positive" },
  { "term": "人多", "weight": 0.88, "sentiment": "negative" } ]
```

weight 代表相对频率/重要性（相对值），不伪装成绝对统计精度。

## 7. Positive / Negative Themes

`positive_themes` / `negative_themes`，每个主题附 frequency、evidence_strength、representative_notes。

representative_notes 允许**极短代表性片段或 paraphrase**；禁止输出大量原始评论、禁止编造评论原文——核心输出是主题、趋势、证据强度，不是评论数据库。

**评论不是事实核验**：评论里的门票、营业时间、预约规则、官方政策一律不写入事实字段、不覆盖 candidates.json 的 preliminary / official_confirmed 状态。评论写"门票 500 日元"只是游客说法。若评论中的关键事实主张与 candidates.json 现值冲突 → 记录 `fact_claim_conflict`（POI、主张、来源、与现值的差异），移交 ticket-reservation 重新核验；本 Skill 不裁决事实。

## 8. Regret / Red Flags

`regret_notes` 是本 Skill 的差异化能力：**哪些人最容易去了以后后悔？**

```json
{ "trigger": "以为只是拍照地标", "actual_experience": "需要较长步行",
  "affected_group": "cannot_walk_long", "evidence_strength": "medium" }
```

- 不编造具体评论，必须来源可追溯（§12）。
- 重点挖掘"预期与现实的落差"：交通耗时被低估、步行量被低估、商业化超出预期、预约失败、性价比不符。
- 踩雷点要与 audience_segments 联动：同一踩雷点对不同人群严重度不同。

## 9. Audience Segments

同一个景点，历史文化爱好者可能觉得很好，怕人群的人可能觉得很差。`audience_segments` 把体验按人群拆开：

```json
[ { "segment": "history_culture", "positive": [], "negative": [] },
  { "segment": "photography", "positive": [], "negative": [] },
  { "segment": "cannot_walk_long", "positive": [], "negative": [] } ]
```

段位词表（对齐 profile 词汇）：`history_culture / photography / food / cannot_walk_long / slow_pace / first_time_visitor / family / budget_sensitive / other`。

- 只描述**旅行体验差异**，不做任何医学或心理诊断。
- **profile 定向（重要）**：对当前用户的 hard_constraints——`cannot_walk_long` 用户视角下，评论中反复出现的"台阶/很大/要走很久/排队"类主题必须重点进入 `audience_segments.cannot_walk_long`，并在向主 Agent 呈现时提高其权重；interests/pace 同理定向。
- **但不因此把 POI 判为不可去**——最终决定仍然交给主 Agent。

## 10. Crowd Patterns

评论证据充分时可提取：`crowded_periods`（如"游客普遍反映上午 10-12 点人多"）、`queue_experience`、`recommended_time_windows`。

- 全部属于 **EXPERIENCE**：可以记录，但不是官方客流数据；不得表述成确定性事实。
- 与 research.json 的黄金周/事件上下文交叉解读（如"黄金周窗口内拥挤规律可能放大"）。
- 证据不足就留空数组，不猜测。

## 11. Evidence Strength

主题级 `evidence_strength`：

| 值 | 定义 |
|---|---|
| `high` | 多个平台、多条独立评论重复出现 |
| `medium` | 一个平台大量评论重复出现 |
| `low` | 少量评论或单个平台少量 |
| `single_source` | 仅单一来源支持，不得扩大成群体共识 |

POI 级共识等级 `consensus_level`：`high | medium | low`（按同口径聚合，进 evidence_summary）。

与主文件 §3 可信度体系的关系：**两套并行、维度不同**——本词表衡量"评论共识强度"，主文件衡量"事实可信度"。评论结论再高也只是体验，永远不能是 verified_official。

## 12. Provenance

每个主要主题尽可能可溯源：`{ "platform": "", "url": "", "checked_at": "" }`。

- 平台内容无法稳定直接引用时：记录**平台名称 + 研究时间 + evidence note**，不编造 URL、不伪造评论原文。
- 不堆砌搜索结果；来源服务于主题可追溯性，不是数量竞赛。
- 违反事实边界的主张（见 §7）不进入 provenance 的事实链。

## 13. Output Contract

产物为 **review-analysis.json**，落盘与否由主 Agent 决定，本 Skill 只产出内容。顶层：

| 字段 | 内容 |
|---|---|
| analysis_meta | `{profile_reference, candidates_reference, research_reference, generated_at, analyzed_count, insufficient_count}` |
| pois[] | 每个 POI 一条分析（结构见下） |
| cross_poi_patterns[] | `{pattern, affected_pois[], evidence_strength, note}`——如"东京热门景点普遍拥挤""黄金周客流叠加"；**必须多个 POI 的证据支撑**，单 POI 现象不得跨池推广 |
| warnings[] | 继承 research 风险上下文（安全提醒等）+ 评论侧自身警告（平台自选择偏差、AI 评论无法完全排除、样本量有限） |
| provenance_meta | `{checked_at, platform_scope, language_scope, degradation_notes[]}` |

单个 POI 的分析结构：

```json
{
  "poi_name": "",
  "review_status": "analyzed | partial | insufficient_data",
  "review_volume": { "usable_reviews": 0, "platforms": [], "confidence": "high | medium | low" },
  "keywords": [],
  "positive_themes": [],
  "negative_themes": [],
  "regret_notes": [],
  "audience_segments": [],
  "crowd_patterns": [],
  "review_adjustment_signal": "positive | neutral | negative",
  "evidence_summary": { "consensus_level": "", "top_positive": "", "top_negative": "", "notes": "" },
  "sources": []
}
```

- `review_adjustment_signal` 表示评论证据对 poi-attraction 初步 verdict 的**支持方向**（评论印证 → neutral/positive；评论揭示 verdict 未覆盖的重大问题 → negative）。它是信号，不是新 verdict。
- **回写机制**：主 Agent 可将本结果写回 candidates.json 对应 POI 的 `reviews` 字段（keywords/positive_themes/negative_themes/regret_notes 由本结构提供），并把 `review_status` 从 `pending_review_analysis` 更新为 `analyzed / partial / insufficient_data`；**verdict 与事实字段一律不动**。

## 14. Failure / Insufficient Data

| 场景 | 处理 |
|---|---|
| 某 POI 评论极少 | `review_status="insufficient_data"`，注明"样本不足，不形成稳定结论"；keywords/themes 可为空；**不得强行制造共识** |
| 平台不可访问（登录墙、反爬、地域限制） | 降级为可访问平台 + provenance_meta.degradation_notes 说明；证据强度如实下调 |
| 评论与 POI 事实冲突 | 记录 fact_claim_conflict 移交核验（§7）——这不是分析失败 |
| 全部平台失败 | 整体 insufficient_data 说明，不产出伪分析 |
| candidates.json 无 POI | 返回失败说明，不做任何分析 |

## 15. Non-responsibilities

以下明确不属于本 Skill：

1. 景点发现
2. 最终 POI 推荐
3. 天气
4. 地图路线
5. 门票核验
6. 餐厅推荐
7. 最终行程
8. 用户最终选择
9. 安全/签证决策

一句话：本 Skill 只提供**"游客真实体验"画像与体验信号**。

## 16. Integration

- **travel-profile**：提供用户偏好（interests/pace/hard_constraints/party），驱动 §9 的定向权重；**严格禁止反向修改 profile.json**。
- **web-research**：提供目的地基础背景、source_registry 与风险上下文（黄金周、安全提醒）——用于解读拥挤主题、限定分析窗口；评论来源视为其 B 层体系的延伸。
- **poi-attraction**：提供候选 POI 及其初步 verdict 与 `pending_review_analysis` 预留位；本 Skill 在候选之上叠加"真实游客体验画像"；**禁止覆盖 POI 的 verdict 与事实字段**——只提供 review_adjustment_signal，最终综合判断由主 Agent 完成，避免多个 Skill 争夺决策权。
- **主 Agent**：消费 review_adjustment_signal + audience_segments（尤其 cannot_walk_long）+ regret_notes，在向用户呈现候选时并入体验画像；用户仍拥有最终选择权（主文件不变式 3）。
- 与主文件 §5.2 一致：评论画像不是词云——主题聚合、正负分离、人群差异、排雷点、拥挤时段。
- **待主文件补登（仅报告，未修改）**：`review_adjustment_signal`、`consensus_level`、`fact_claim_conflict` 为本 Skill 新增契约键；回写机制将 poi-attraction 的 `regret_notes: null` 细化为数组。建议未来修订主文件/上游时同步。
