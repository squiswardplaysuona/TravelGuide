# Security Policy

## 支持的范围

本仓库是一个**纯 Skill / Markdown + JSON** 的旅游规划 Agent 项目，不包含可执行应用程序、服务器或 API 服务。安全政策覆盖：

- 仓库中的 Skill 定义（`.agents/skills/*/SKILL.md`）与文档
- 示例与运行时 JSON 资产的结构与内容处理方式
- Skill 在 Agent 平台上执行时的数据处理行为（联网搜索、网页读取、本地文件读写）

## 提交前须知（对所有贡献者）

**不要提交以下内容**（Issue / PR / 任何文件均适用）：

- API Key、token、cookies、Authorization 头
- 个人旅行信息（真实姓名、证件、行程中的身份信息）
- 带真实身份的 `profile.json`（示例请使用匿名画像）
- 内部/私有系统的 URL 与凭据

运行 `plan/` 工作区产生的 JSON 属于个人运行时数据，默认已被 `.gitignore` 排除——请保持排除状态。

## 报告安全问题

如果你发现本仓库 Skill 定义或文档中的安全问题（例如：诱导泄露凭据的指令、不安全的数据处理建议）：

1. **请通过 GitHub repository 的 Private Vulnerability Reporting / Security Advisory 渠道提交**（仓库页 → Security → Report a vulnerability）。
2. 如果仓库尚未启用该渠道，请提醒维护者在 GitHub Settings → Code security 中开启 Private vulnerability reporting。
3. 不要在公开 Issue 中暴露敏感细节。

（本项目为纯文档/Skill 仓库，无邮箱安全联络渠道，不虚构联系方式。）

## 处理范围说明

- 本项目**不执行 booking、不存储凭据、不代理任何第三方 API key**——Skill 通过 Agent 平台的通用联网能力读取公开网页。
- 旅行安全（目的地治安、天气灾害、政局）属于**用户决策范畴**：系统只传递官方来源的事实与提醒，不替用户决定是否出行。此类问题请参考官方渠道（如外交/气象部门），不属于本仓库的安全漏洞。
