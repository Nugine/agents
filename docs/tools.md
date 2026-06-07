# 平台工具

工具定义在 `tools/mod.ts` 动态注册。每个智能体默认启用全部工具。

## Shell

- **`bash`** — 执行命令。`background:true` 后台。`verbose:true` 完整输出
- **`bash_input`** — 向后台任务发送 stdin
- **`bash_output`** — 读取后台任务输出
- **`list_background_tasks`** — 列出后台任务
- **`get_task_status`** — 按 ID 查询任务

## 代码

- **`exec`** — 子进程执行 Python / Bash / TypeScript，支持 `background`
- **`eval`** — 进程内执行 TypeScript。通过 `yield* $.xxx()` 调用平台 API（bash, fork, spawn, join, send, recv,
  import）。沙箱隔离（node:vm），效应标记防泄漏。返回值 + 日志作为工具结果

## 子智能体

- **`fork_agent`** — Fork 子智能体（继承上下文）。可选 `model`、`reasoning_effort`
- **`spawn_agent`** — Spawn 新智能体。需 `prompt`，可选 `model`、`reasoning_effort`
- **`join_agent`** — 等待子智能体完成并获取摘要
- **`list_agents`** — 列出所有活跃智能体

## 消息

- **`send_message`** — 向其他智能体发送消息
- **`receive_messages`** — 接收待处理消息

## 时间

- **`sleep`** — 休眠 N 秒，alarm 或用户输入唤醒
- **`alarm`** — 定时向指定智能体发送消息

## 任务

- **`todo_write`** — 结构化任务列表
- **`view_todo`** — 查看待办队列

## 交互

- **`ask_user`** — 向用户提问，支持选项
