---
name: travel-profile
description: Turns a free-form travel request into a structured traveler profile (profile.json): normalizes requirements, marks missing info as explicit assumptions, runs basic validity checks. Input normalization only — no search, weather, mapping, or planning. 中文：从用户旅行需求中提取、标准化并生成结构化旅行画像（profile.json），处理缺失信息、默认假设和基础合法性检查，为 TravelGuide 主 Agent 及后续子 Skill 提供统一输入。仅负责需求标准化：不做景点/攻略搜索、天气、地图、路线、票务与行程规划。当用户提出旅行计划或需要整理出行需求、或主 Agent travel-guide 启动规划流程建立旅行画像时使用。
---

# travel-profile — 旅行需求标准化

## 1. Role

travel-profile 是 TravelGuide 系统的第一个子 Skill，定位是**旅行需求标准化器**。它把用户的自然语言需求转换为一个稳定、结构化、带信息状态标记的旅行画像（profile.json），作为主 Agent travel-guide 及所有后续子 Skill 的统一输入。

它不是攻略生成器，不搜索任何信息，不生成任何路线。它只回答一个问题：**用户到底要去哪、什么时候去、和谁去、在什么约束下去。**

核心工作流：

```
用户自然语言需求 → 提取 → 识别缺失 →（必要时）一轮批量询问
                → 建立默认假设 → 合法性检查 → 输出 profile.json
```

## 2. Responsibilities

- 从用户输入中提取旅行信息：目的地、日期、出发地、人数、预算、节奏、兴趣、硬约束、已订资产。
- 识别缺失与模糊信息，区分"必须阻塞"与"可假设"。
- 需要补充时，只做**一轮批量询问**（§6），绝不挤牙膏式追问。
- 对用户未提供且不阻塞的可选信息，建立显式默认假设并逐条记录（§10）。
- 执行基础合法性检查：日期、已订交通、酒店覆盖（§8）——只查数据完整性，不做任何路线分析。
- 产出结构化 profile.json（§9）。

不负责的事情见 §12——边界与职责同等重要。

## 3. Input Contract

- **输入**：用户关于旅行的自然语言描述（口语化、可分多条、可有省略），以及主 Agent 传入的既有上下文（此前轮次中用户已确认的信息）。
- **不读取任何外部数据源**：不联网、不搜索、不调用其他 Travel Skill、不依赖天气/地图/评论/票务服务。
- **无状态**：每次调用应能仅凭"用户输入 + 传入上下文"重建完整画像；用户中途补充信息时按 §10 合并规则更新，而不是重新盘问。

## 4. Required Fields

### 4.0 信息状态标记（贯穿所有字段）

每个**对象型字段**必须携带 `status`，取值只有三种：

| status | 含义 |
|---|---|
| `user_provided` | 用户明确提供（含明确回答"无"） |
| `assumed` | 系统采用的默认值，必须同步写入 `assumptions` |
| `missing` | 用户未提供，且本 Skill 不对该字段做假设 |

**数组型字段**（interests / hard_constraints / assumptions）本身不带 status，信息状态由条目的 `source`（`user_provided` / `assumed`）表达；空数组表示缺失或无。

附加规则：

- 不允许出现第四种状态；**不允许把 assumed 伪装成 user_provided**。
- 每个 assumed 字段必须能在 `assumptions` 中找到对应条目，反之亦然。
- 所有对象型字段可含可选 `hint`（字符串或 null），记录用户原话、推断口径或保守归类说明，供主 Agent 与用户核对，不影响机器字段。

### 4.1 destination（阻塞字段）

`{ "country", "region", "city", "status", "hint"? }`

- 三者至少一个非空，否则 `status=missing` 并**阻塞**（§11）。
- 只做高确定性常识补全（如 东京→日本）；不确定的留空。大区表达（"欧洲""东南亚"）填入 region。
- 用户只给国家/大区时 city 可为空，`status=user_provided`，同时把"具体城市"列入批量问题。
- **destination 永远不允许 assumed**——没有用户输入就没有目的地。

### 4.2 dates（阻塞字段）

`{ "start", "end", "trip_days", "status", "hint"? }`

- start/end 使用 ISO 8601（`YYYY-MM-DD`）；`trip_days = end − start + 1`（含头含尾），由本 Skill 计算，不以用户口述为准。
- **模糊日期表达（"国庆""黄金周""下个月"）只写入 hint 作为线索，绝不推算成具体日期填充 start/end**；此时 `status=missing`，并在批量问题中把确切日期标为必答。
- 年份省略时按"最近的未来"推断（如今年 10 月已过，"10 月 1 日"指明年），推断口径写入 hint。
- **dates 永远不允许 assumed。**

## 5. Optional Fields

以下字段缺失不阻塞规划，按各自默认规则处理。

### origin

`{ "country", "city", "status", "hint"? }`。缺失 → `status=missing`，不阻塞。**绝不允许凭空推断用户所在地**（不使用 IP、语言、时区等线索反推）；只允许从用户明说的城市做常识性国家补全。

### party

`{ "adults", "children", "seniors", "mobility_constraints", "status", "hint"? }`

默认（assumed）：`adults=2, children=0, seniors=0, mobility_constraints=[]`。
口径保守：仅当用户明示"老人/长辈"时计入 seniors，否则并入 adults（"带父母"只记 hint，不擅自归类）。

### budget

`{ "amount", "currency", "amount_basis", "level", "status", "hint"? }`

- `amount_basis` ∈ `per_person | total | unknown`：金额口径。仅凭用户明确表述判断（见 §7），未说明一律 `unknown`，**不允许凭空猜测口径**——下游 Planner / Validator 依赖它决定按人头还是按总额核算。
- `level` ∈ `economy | medium | luxury`。
- 默认（assumed）：`amount=null, currency=null, amount_basis="unknown", level="medium"`。
- 用户只给金额时填 amount / currency / amount_basis、**level 留空**——档位需结合目的地消费水平解读，那是主 Agent 的判断，本 Skill 不拍数字。

### pace

`{ "value", "status", "hint"? }`，`value ∈ fast | standard | slow`。默认（assumed）`standard`。口语映射见 §7。

### interests

数组，元素 `{ "tag", "source", "note"? }`。tag 用 snake_case 英文，参考词表（可扩展）：`history, culture, nature, food, photography, shopping, nightlife, architecture, museum, theme-park, hidden-gem, family`。

- 完全缺失 → 填入一组均衡默认标签（`source=assumed`，如 history/culture/nature/food），并写入 assumptions。
- 用户给过任何标签 → 系统不得再追加 assumed 标签。
- 映射不了的原话 → `tag="other"`，原句放 note。

### hard_constraints

数组，元素 `{ "type", "detail", "source" }`。参考词表（可扩展）：`wheelchair, elderly, child, cannot_walk_long, dietary_restriction, fixed_departure_time, fixed_hotel, fixed_ticket, none, other`。

- **硬约束只能来自用户**，本 Skill 永不自行添加或假设约束。
- 用户明确说"无特殊限制" → 记一条 `{"type":"none", "source":"user_provided"}`，避免"没说过"与"说没有"混淆。
- 硬约束与兴趣严格区分：兴趣影响推荐排序，**约束是主 Agent 校验环节的必查项**。

### booked

`{ "transport": [...], "hotel": [...], "status" }`。所有条目均为 `user_provided`。

transport 元素：

| 字段 | 说明 |
|---|---|
| type | `flight / train / high-speed-rail / bus / ferry / other`（可扩展） |
| departure / arrival | 出发地 / 到达地（城市或场站） |
| time | 出发时间（ISO 8601）；有到达时间时扩展 `arrive_time` |
| location（可选） | 航站楼、检票口等地点细节 |
| booking_status | `confirmed / pending / unknown` |

hotel 元素：`{ "name", "address"?, "city"?, "check_in", "check_out", "booking_status" }`。

已确认的交通与酒店是后续编排的**时间与空间锚点**。本 Skill 只做完整性检查（§8），不做地图与路线分析。

### assumptions

系统管理字段，结构见 §10。

## 6. Question Strategy

原则：**一轮批量询问**。已知信息先复述（"已记录：东京，10 月 1–5 日"），再一次性列出全部缺失项，格式如下，允许用户逐项作答，或整体回答"其他都默认"：

```
【必答】目的地 / 确切日期：（仅在缺失时出现）
出发城市：
人数与构成：
预算：
旅行节奏：
兴趣偏好：
酒店（如有）：
已订机票/车票（如有）：
特殊限制（如老人/幼儿/饮食禁忌）：
```

- 阻塞项（destination、dates）必须置顶并标注"必答"；其余均为选答。
- 只问缺失项，已有假设作为预填值展示，让用户可以直接确认或逐项覆盖。
- 问过这一轮之后**不再重复追问**；用户回答"其他都默认"后，本 Skill 对该用户不再就可选字段发问。
- 用户中途主动补充信息属于"回答"，纳入 §10 合并流程，不算新一轮提问。

## 7. Normalization Rules

- **语言**：机器字段值用英文词汇表（tag、level、pace、type 等），面向用户的呈现用中文。
- **日期**：见 §4.2——模糊表达只进 hint，年份按最近的未来推断。
- **目的地**：只做高确定性常识映射（东京→日本）；"欧洲"等大区表达填 region。
- **预算**："1.2 万" → 12000；口径 amount_basis："人均 / 每人" → per_person，"总预算 / 一共" → total，未说明 → unknown（不凭空猜测）；币种仅在有明确符号/表述时填写（¥/元 → CNY）。
- **节奏**：特种兵/暴走 → fast；慢节奏/躺平/轻松 → slow；正常/随便/默认 → standard。
- **兴趣**：自然语言映射到词表标签，原句保留在 note；映射不了的进 other。
- **人数**："一家三口" → adults=2, children=1；保守原则见 §5 party。
- 所有推断性归一化（年份、常识映射、口语映射）一律在 hint 中留痕。

## 8. Validation Rules

只做数据完整性检查。每项检查产出 `pass / warn / fail` 三级结论，随 profile 一并返回：

**日期检查**

- 格式：start/end 必须是合法 ISO 8601 日期 → 违反 = fail。
- 顺序：start ≤ end → 违反 = fail；**不自动交换**，交用户确认。
- trip_days：按 `end − start + 1` 计算；与用户口述天数不符（说"5 天"实为 4 天）→ warn。
- 合理性：start 早于今天 → warn（疑似笔误，请用户确认）；trip_days > 30 → warn；trip_days > 365 → fail。

**已订交通检查**（存在 booked.transport 时）

- 出发时间应落在旅行窗口附近：不晚于 end、不早于 start 前一天（兼容红眼航班与时差）→ 超出 = warn（票务与日期可能不匹配）。
- 到达时间晚于 end → warn。
- 缺 time 或缺出发/到达地 → warn（锚点不完整，后续编排无法使用该票务）。

**酒店检查**（存在 booked.hotel 时）

- check_in ≤ check_out → 违反 = fail。
- 覆盖性：check_in 晚于 start，或 check_out 早于 end → warn（存在未覆盖的晚上）。
- 交叉检查：交通到达日期晚于 check_in 日期 → warn（首晚住宿可能缺口）。

**fail 不阻塞 profile 输出**——带 fail 项的画像照样返回，但必须在状态摘要中标明，由主 Agent 决定是否先向用户确认。

## 9. Output Contract

产物只有一个：**profile.json**。落盘由主 Agent 负责（约定 `plan/profile.json`），本 Skill 产出内容。完整示例（三种状态混用）：

```json
{
  "destination": {
    "country": "日本",
    "region": null,
    "city": "东京",
    "status": "user_provided",
    "hint": null
  },
  "dates": {
    "start": "2026-10-01",
    "end": "2026-10-05",
    "trip_days": 5,
    "status": "user_provided",
    "hint": "用户原话：10月1日到5日；年份按最近的未来推断"
  },
  "origin": {
    "country": "中国",
    "city": "上海",
    "status": "user_provided",
    "hint": null
  },
  "party": {
    "adults": 2,
    "children": 0,
    "seniors": 0,
    "mobility_constraints": [],
    "status": "assumed",
    "hint": null
  },
  "budget": {
    "amount": 12000,
    "currency": "CNY",
    "amount_basis": "per_person",
    "level": null,
    "status": "user_provided",
    "hint": "用户原话：人均 1.2 万"
  },
  "pace": {
    "value": "standard",
    "status": "assumed",
    "hint": null
  },
  "interests": [
    { "tag": "history", "source": "user_provided", "note": "想看古寺庙" },
    { "tag": "photography", "source": "user_provided", "note": "喜欢拍照" }
  ],
  "hard_constraints": [],
  "assumptions": [
    { "field": "party", "value": "adults=2, children=0, seniors=0",
      "reason": "用户未提供人数", "impact": "影响房型、票种与包车判断" },
    { "field": "pace", "value": "standard", "reason": "用户未指定旅行节奏" }
  ],
  "booked": {
    "transport": [
      {
        "type": "flight",
        "departure": "上海浦东",
        "arrival": "东京成田",
        "time": "2026-10-01 09:00",
        "arrive_time": "2026-10-01 13:30",
        "location": null,
        "booking_status": "confirmed"
      }
    ],
    "hotel": [
      {
        "name": "新宿××酒店",
        "address": "东京都新宿区××",
        "city": "东京",
        "check_in": "2026-10-01",
        "check_out": "2026-10-05",
        "booking_status": "confirmed"
      }
    ],
    "status": "user_provided"
  }
}
```

除 profile.json 外，同时返回一个**简短状态摘要**（不写入文件）：

- `status`：`complete`（destination/dates 就绪，且无待用户回答的问题）/ `partial`（就绪，但存在待确认的 warn/fail 或未回答的批量问题）/ `blocked`（destination 或 dates 缺失）。
- warn / fail 清单（§8）。
- 若非 complete：§6 的批量问题集。

## 10. Assumption Rules

- 假设条目结构：`{ "field", "value", "reason", "impact"? }`。`impact` 仅在缺失会直接影响关键决策时填写（如 party 影响房型与包车、budget 影响酒店档位），用于提醒主 Agent。
- **假设只允许出现在 §5 列出的可选字段**；destination、dates、origin、hard_constraints 永不假设。
- 每个 assumed 字段必须能在 assumptions 中找到对应条目；assumptions 中不允许出现与 user_provided 字段冲突的条目。
- **合并规则**（用户补充信息时）：user_provided 永远覆盖 assumed；被覆盖的假设条目从 assumptions 中移除；已确认的 user_provided 字段不被新假设污染。
- 假设不是事实：后续任何 Skill 读取 profile 时必须能仅凭 status/source 区分两者——这是本 Skill 存在的理由。

## 11. Failure Handling

| 场景 | 处理 |
|---|---|
| destination 缺失（含"随便去哪"） | `status=blocked`；**不替用户挑目的地**（候选方向需要调研，属主 Agent 职责）；返回批量问题集，目的地标必答 |
| dates 缺失或仅有模糊表达 | `status=blocked`；模糊表达存入 hint，请求确切日期 |
| start > end | 不自动交换；记 fail，把更正请求并入批量问题 |
| 用户拒绝回答（"其他都默认"） | 可选字段全部按 §5 默认值处理并记录假设，`status=complete`，此后不再追问 |
| 用户输入与已订票务矛盾（日期对不上但用户坚持） | 保留用户口径，记 warn，交主 Agent 向用户提示 |
| 输入与旅行无关 | 返回 `status=blocked` 与简要说明；不产出画像、不猜测意图 |

## 12. Non-responsibilities

以下事项明确不属于本 Skill，属于其他子 Skill 或主 Agent：

1. 搜索旅游景点、攻略，抓取点评平台内容
2. 评论分析
3. 天气查询
4. 地图查询
5. 路线规划
6. 餐厅推荐
7. 门票 / 预约规则查询
8. 行程生成
9. 行程校验
10. 旅行中的动态规划
11. 目的地候选建议（需要调研支撑，由主 Agent 提供）

本 Skill 的全部产出只来自两处：**用户说的话 + 本文件定义的默认规则**。

## 13. Integration with travel-guide

- 调用方是主 Agent travel-guide，对应其流程中的"需求画像"环节（主文件 §4）；本 Skill 是主文件 §2 契约表中 travel-profile 的实现。
- 核心字段集与主文件 §4 的画像定义完全一致（destination、dates、origin、party、budget、pace、interests、hard_constraints、assumptions、booked），本文件只做细化，不改契约。
- `user_provided / assumed / missing` 的区分直接支撑主 Agent"假设显式化、用户可随时纠正"的要求（主文件 §4）；`hint` 字段呼应其信息源留痕精神（主文件 §3）。
- `blocked` 返回后，主 Agent 负责把批量问题转达用户并把回答回传本 Skill 更新画像；候选目的地方向由主 Agent 提供并让用户选择。
- **本 Skill 不调用任何其他 Travel Skill。** 后续所有子 Skill（research / poi / planner / validator / copilot）只应依赖 profile.json，不应各自重新解读用户原话——profile.json 是用户需求的唯一事实来源。
