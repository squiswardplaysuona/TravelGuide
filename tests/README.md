# tests/

## validate_assets.mjs

TravelGuide 资产结构校验脚本：检查 12 个 Skill 的完整性与命名一致、`examples/tokyo-demo/` 示范资产的解析与基本不变量（itinerary 的 draft 状态与日期、validation 的计数规则、copilot 的模拟事件标识）、`.gitignore` 规则覆盖，以及 `plan/` 下 JSON 的可解析性。

只使用 **Node.js 标准库**（`node:fs` / `node:path` / `node:child_process`），无任何第三方依赖；脚本**纯只读**，不修改任何文件。

## 执行

```bash
node tests/validate_assets.mjs
```

- 通过：输出 `TravelGuide asset validation: PASS`，exit code 0
- 失败：输出 `TravelGuide asset validation: FAIL` 与具体失败项，exit code 1
- 环境无 Git 时，`.gitignore` 的 check-ignore 核验自动跳过（不导致失败）

## 这是什么测试

**结构 / 不变量测试**：验证仓库资产的形态、命名、引用与统计一致性（例如 validation 的 error/warning 计数与 issues 实际数量一致、itinerary 处于 draft 状态、transfer 带有 matrix_reference）。

## 这不是什么测试

**不是实时旅游信息验证**：脚本不检查票价/营业时间/库存/天气/评论是否"仍然正确"——这些具有时效性，属于动态信息。用于真实旅行时，必须重新运行相应的 Agent Skill（web-research / weather / ticket-reservation 等），而不是依赖 examples 中的快照。
