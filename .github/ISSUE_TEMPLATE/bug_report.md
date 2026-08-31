---
name: Bug report
about: 报告 TravelGuide 的行为问题或资产缺陷
title: "[Bug] "
labels: bug
assignees: ''
---

**注意：不要在 Issue 中上传 API Key / token / cookies / 带真实身份的旅行信息。** 运行时 JSON 请先脱敏（移除个人信息，保留结构）。

## Description

简要描述问题。

## Reproduction

复现步骤（包含触发方式：全量规划 / 局部查询 / 行程体检 / 行中调整）。

## Expected behavior

期望行为。

## Actual behavior

实际行为。

## Environment

- Agent 平台：
- 是否联网：
- 工作目录是否为项目根：

## Skill involved

涉及的 Skill（如 itinerary-planner / trip-validator / travel-copilot），以及相关资产文件（如 `plan/itinerary.json`，脱敏后）。

## Relevant sanitized asset

脱敏后的相关 JSON 片段（可选）。

## Logs / errors

校验脚本输出（`node tests/validate_assets.mjs`）或错误信息。
