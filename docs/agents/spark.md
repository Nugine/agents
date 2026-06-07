# Spark

CodeAct 范式代码执行智能体。

| 字段     | 值                          |
| -------- | --------------------------- |
| Kind     | `spark`                     |
| 标题     | `⚡ Spark`                  |
| 范式     | CodeAct（以代码为动作空间） |
| 默认模型 | heavy 级                    |

## 定位

Spark 通过编写和执行代码解决问题，而非调用离散工具。支持 Python、Bash、TypeScript（Deno
eval）。典型场景：数据分析、脚本编写、自动化任务。

与 Minion 的区别：Minion 逐步调用工具，Spark 一次性编写完整代码后执行、读输出、修复、重跑。

## 参见

- `docs/tools.md` — 全部可用工具
- `docs/minion.md` — Minion 智能体
- `docs/architecture.md` — 平台架构
