# Agents

多智能体终端平台 — 在命令行中与 AI 协作。支持 DeepSeek V4、MiMo V2.5 等 OpenAI 兼容提供商。

> 本项目 100% 由 AI 生成。请通过 AI 工具进行后续修改，手动编辑不予维护。

## 特性

- **多范式智能体**：ReAct / CodeAct / Ensemble 三种范式
- **全功能 TUI**：流式输出、思考链折叠、模型切换、面板管理
- **后台任务**：bash 命令 60s 前台 / 600s 后台，流式 stdin/stdout
- **子智能体**：fork（继承上下文）和 spawn（独立上下文），支持指定模型和推理强度
- **待办系统**：用户队列 + 模型任务列表，上下文自动注入
- **成本控制**：实时费用、缓存命中率、上下文压缩（70% 阈值）
- **斜杠命令**：`/model` `/todo` `/tasks` 等，支持面板交互
- **多提供商**：DeepSeek / MiMo 自动路由，余额查询，按模型定价计费

## 快速开始

设置任一提供商的 API 密钥，平台会自动识别并启用对应模型。

```bash
export DEEPSEEK_API_KEY=sk-...   # 或 MIMO_API_KEY=sk-...
deno run -A src/main.ts
```

## 智能体

| 智能体         | 范式     | 适用场景                                     |
| -------------- | -------- | -------------------------------------------- |
| **Minion** `⬦` | ReAct    | 日常终端操作、文件管理、后台任务、多步骤编排 |
| **Spark** `⚡` | CodeAct  | 数据分析、脚本编写、自动化 — 写代码一次解决  |
| **Firefly** `` | Ensemble | fork/join 并行编排 · 任务分解 · 结果合成     |

## 文档

| 文档                     | 内容           |
| ------------------------ | -------------- |
| `AGENTS.md`              | 开发指南       |
| `docs/architecture.md`   | 平台架构       |
| `docs/agents/minion.md`  | Minion 智能体  |
| `docs/agents/spark.md`   | Spark 智能体   |
| `docs/agents/firefly.md` | Firefly 智能体 |
| `docs/tools.md`          | 工具参考       |
| `docs/commands.md`       | 斜杠命令       |
