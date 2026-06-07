# Agents — Development Guide

Deno + TypeScript + React (Ink) + 多 LLM 提供商。

## Commands

| 命令           | 功能                                          |
| -------------- | --------------------------------------------- |
| `just dev`     | fmt → check → lint → test                     |
| `just run`     | `deno run -A src/main.tsx`                    |
| `just compile` | `deno compile -A -o dist/agents src/main.tsx` |

## Architecture

```
src/
├── agents/         智能体清单 (Minion, Spark)
├── commands/       斜杠命令注册 + 解析器
├── llm/            Provider 接口 + DeepSeek/MiMo
├── runtime/        AgentInstance · Scheduler · Subagent
├── tools/          工具: bash, eval, code_exec, bus, timers, todo, ask, goal
├── ui/             TUI 组件 + 面板 (model, todo, tasks)
├── config.ts       配置中心
├── types.ts        类型
├── transport.ts    Provider 路由
├── engine.ts       SSE
├── format.ts       纯函数
├── main.tsx        入口
```

## Code Style

- `if` / `for` / `while` 语句必须使用大括号，即使只有一行体

## Rules

- 新增 Provider：实现 `LlmProvider` → `transport.ts` 注册
- 新增工具：实现 + 导出定义 → `tools/mod.ts` 注册 → `instance.ts` dispatch
- 新增命令：`registerCommand({ name, params, handler, desc, panel? })`
- 共享单例：`Object.freeze`
