# 斜杠命令

以 `/` 开头，TUI 处理，不发送到模型。

| 命令               | 功能                         |
| ------------------ | ---------------------------- |
| `/model`           | 模型选择面板（↑↓ Enter Esc） |
| `/model <id>`      | 切换到指定模型               |
| `/agents`          | 列出智能体                   |
| `/balance`         | 刷新余额                     |
| `/tasks`           | 后台任务面板                 |
| `/todo`            | 待办面板（队列 + 进度）      |
| `/todo add <text>` | 加入队列                     |
| `/todo del <idx>`  | 删除队列项                   |
| `/todo clear`      | 清空队列                     |
| `/session pause`   | 暂停会话                     |
| `/session resume`  | 恢复会话                     |
| `/goal <text>`     | 设置自主目标                 |
| `/goal`            | 查看目标状态                 |
| `/goal budget <N>` | 设置轮次上限                 |
| `/goal clear`      | 清除目标                     |
| `/budget`          | 查看会话预算                 |
| `/clear`           | 清除对话                     |
| `/exit`            | 退出                         |
| `/help`            | 所有命令                     |

## 注册

```typescript
registerCommand({ name: "tasks", params: [], handler: () => null, desc: "后台任务", panel: "tasks" });
```
