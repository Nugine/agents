# Firefly

fork/join 并行编排智能体。

| 字段     | 值                                         |
| -------- | ------------------------------------------ |
| Kind     | `firefly`                                  |
| 标题     | `Firefly`                                  |
| 范式     | Ensemble（任务分解 → 并行执行 → 结果合成） |
| 默认模型 | medium 级                                  |

## 定位

Firefly 专精于大规模并行任务。它通过 fork 多个子智能体、join 收集结果来加速复杂分析。与 Minion（逐步工具调用）和
Spark（代码执行）不同，Firefly 的核心能力是任务分解和并行编排。

典型场景：比较多个方案、批量代码审查、多维度分析。

## 参见

- `docs/tools.md` — 工具参考
- `docs/agents/minion.md` — Minion 智能体
- `docs/agents/spark.md` — Spark 智能体
