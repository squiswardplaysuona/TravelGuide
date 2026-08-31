# Contributing to TravelGuide

感谢关注 TravelGuide！这是一个由 **主 Agent + 11 个专业子 Skill** 构成的纯 Skill/Markdown 旅游规划 Agent——没有传统代码，"实现"即 Skill 契约与结构化资产。

## Getting Started

1. Clone 本仓库：
   ```bash
   git clone <repository-url>
   cd TravelGuide
   ```
2. **从项目根目录工作**：所有 Skill 以相对路径 `plan/*.json` 读写运行时资产。
3. Skill 位于 `.agents/skills/<skill-name>/SKILL.md`（每个目录一个 Skill，`name` 必须与目录名一致）。
4. `plan/` 是**运行时工作区**：其中的 JSON 由 Skill 产生，默认不提交 Git（见 `.gitignore`）。
5. `examples/tokyo-demo/` 是已验证的端到端示范快照——阅读它是理解系统行为的最快方式。

运行结构校验：

```bash
node tests/validate_assets.mjs
```

## Skill Contribution Rules

贡献新 Skill 或修改现有 Skill 时：

- **单一职责**：一个 Skill 只做一件事；与现有 Skill 职责重叠的提案请先开 Issue 讨论。
- **明确 Input Contract**：声明读取哪些资产、哪些字段，缺输入时的降级行为。
- **明确 Output Contract**：声明产出文件、顶层结构与字段语义。
- **明确 Non-responsibilities**：明确列出不做的事情，避免与相邻 Skill 越权。
- **不偷偷修改其他 Skill 的资产**：所有上游资产只读；跨 Skill 冲突交主 Agent/用户。
- **不虚构事实**：无来源的时间/价格/坐标/库存一律标 `unverified` / `unknown`，绝不补位。
- **区分信息状态**：FACT / EXPERIENCE / ASSUMPTION / UNKNOWN / UNVERIFIED / PRELIMINARY 必须可被机器区分。
- **frontmatter 规范**：`name` 与目录名一致（小写 kebab-case）、`description` ≤ 1024 字符。
- **新增 Skill 需同步**：`docs/skill-contracts.md`、`docs/architecture.md`、主 Skill（travel-guide）的契约表与 §8.0 资产清单。

## Testing

提交前请运行：

```bash
node tests/validate_assets.mjs
```

并确认输出 `TravelGuide asset validation: PASS`（exit code 0）。该测试覆盖资产结构与基本不变量；涉及新字段/新不变量的改动请在测试中补充对应检查。

## Pull Request

PR 请包含：

- **目的**：解决什么问题 / 提供什么能力
- **修改范围**：涉及哪些 Skill 与资产
- **契约影响**：是否改变某个 Skill 的 Input/Output/Non-responsibilities
- **JSON schema 影响**：是否新增/修改字段（如 `fact_status`、`availability` 等）
- **测试结果**：`node tests/validate_assets.mjs` 的输出

## 行为准则

保持讨论聚焦于旅行规划系统本身；尊重内容来源（引用外部站点请遵守其条款）；不发布真实个人信息。
