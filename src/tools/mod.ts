// ============================================================================
// Tool definitions — registered dynamically by each tool module.
// ============================================================================

// ---- Tool definitions -------------------------------------------------------

/** Tool definitions sent with every chat-completion request.
 *  Individual agents select a subset via their `toolNames` manifest field. */
const tools = [
    {
        type: "function" as const,
        function: {
            name: "bash",
            description: "Execute a command in a Linux bash shell. " +
                "Commands that finish within 60s return results directly. " +
                "Longer-running commands move to the background — use list_background_tasks to check progress " +
                "and get_task_status to retrieve output. " +
                "Returns a JSON object: {status, exit_code, stdout, stderr, task_id?}.",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "The bash command to execute, e.g. 'ls -la /tmp' or 'cat file.txt'",
                    },
                    stdin: {
                        type: "string",
                        description: "Optional. Content to pipe to the command's standard input.",
                    },
                    preview_chars: {
                        type: "integer",
                        description:
                            "Max characters to return in the inline preview (default 500). Tool outputs are truncated by default; use verbose=true to get the full output.",
                    },
                    verbose: {
                        type: "boolean",
                        description:
                            "Set to true to return the full output (up to 8000 chars). Default false — returns a 500-char preview with a file path for the rest.",
                    },
                    cwd: {
                        type: "string",
                        description:
                            "Working directory for the command. Default: current workspace directory (see [Session] for the path). Only specify when you need a different directory.",
                    },
                },
                required: ["command"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "bash_input",
            description: "Send stdin input to a running background task. " +
                "Use this to interact with long-running commands that expect further input.",
            parameters: {
                type: "object",
                properties: {
                    task_id: { type: "string", description: "The background task ID." },
                    content: { type: "string", description: "Content to pipe to the process stdin." },
                },
                required: ["task_id", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "bash_output",
            description: "Read the current accumulated stdout/stderr from a running background task. " +
                "Use this to check progress of a long-running command before it completes.",
            parameters: {
                type: "object",
                properties: {
                    task_id: { type: "string", description: "The background task ID." },
                },
                required: ["task_id"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "exec",
            description: "Execute code in a specified language. " +
                "Returns {exit_code, stdout, stderr}. " +
                "Set background:true for long-running code — use bash_output to check progress. " +
                "Languages: python, bash, typescript (deno eval).",
            parameters: {
                type: "object",
                properties: {
                    language: { type: "string", enum: ["python", "bash", "typescript"], description: "Language." },
                    code: { type: "string", description: "Source code to execute." },
                    background: { type: "boolean", description: "Run in background (default false)." },
                },
                required: ["language", "code"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "list_background_tasks",
            description: "List all background tasks with their current status. " +
                "Returns {tasks: [{id, command, status, startedAt, finishedAt?, exitCode?}]}.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "fork_agent",
            description: "Fork a sub-agent that inherits the current conversation context. " +
                "Returns the sub-agent's ID. " +
                "Optionally provide a prompt (system-level instruction) and a display name.",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "Optional system-level instruction for the sub-agent.",
                    },
                    model: {
                        type: "string",
                        description: "Model override (default: parent's model). v4-flash for speed, v4-pro for depth.",
                    },
                    reasoning_effort: {
                        type: "string",
                        description: "Reasoning effort: low (fastest), high (default), max (pro only).",
                    },
                    name: {
                        type: "string",
                        description: "Optional display name for the sub-agent.",
                    },
                },
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "spawn_agent",
            description: "Spawn a new independent agent with a fresh context. " +
                "Provide an initial prompt describing what the new agent should do, and optionally a display name.",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "Initial task description for the new agent." },
                    model: { type: "string", description: "Model override. v4-flash for speed, v4-pro for depth." },
                    reasoning_effort: {
                        type: "string",
                        description: "Reasoning effort: low (fastest), high (default), max (pro only).",
                    },
                    name: {
                        type: "string",
                        description: "Optional display name for the spawned agent.",
                    },
                    kind: {
                        type: "string",
                        description:
                            "Agent kind: minion (ReAct), spark (CodeAct), firefly (fork/join). Default: parent's kind.",
                    },
                },
                required: ["prompt"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "send_message",
            description: "Send a text message to another agent via the message bus. " +
                "Use this to communicate with sub-agents or the parent agent.",
            parameters: {
                type: "object",
                properties: {
                    to: { type: "string", description: "Target agent ID." },
                    content: { type: "string", description: "Message content." },
                },
                required: ["to", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "receive_messages",
            description: "Receive all pending messages for the current agent. Drains the message queue. " +
                "Returns {messages: [{from, content, timestamp}]}.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "join_agent",
            description:
                "Wait for a sub-agent to complete and return its summary. Blocks until the sub-agent finishes.",
            parameters: {
                type: "object",
                properties: {
                    agent_id: { type: "string", description: "The sub-agent ID from fork_agent or spawn_agent." },
                },
                required: ["agent_id"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "eval",
            description:
                "Execute JavaScript code (NOT TypeScript — no type annotations) with full access to platform tools via yield* $.xxx(). " +
                "Available: $.bash(cmd, stdin?, background?, cwd?) → {exit_code,stdout,stderr}, " +
                "$.fork({prompt?, name?}) → agentId, $.spawn({prompt, name?, kind?}) → agentId, $.join(id|[ids]) → summary|[summaries], $.join(agentId) → summary, " +
                "$.send(to, content), $.recv() → {from,to,content,timestamp}[], $.sleep(s), " +
                "$.agents() → ids[], $.agentId() → string, " +
                "$.import('jsr:@std/path') or $.import('npm:yaml') for dynamic imports. " +
                "console.log() output is captured and returned in the result. " +
                "The return value of your code becomes the tool result. Errors are caught and reported. " +
                "Example: yield* $.sleep(5); const r = yield* $.bash('ls /tmp'); const id = yield* $.fork({prompt:'analyze logs'}); yield* $.send(id, 'check errors'); const msgs = yield* $.recv(); const summary = yield* $.join(id); return {files: r.stdout, msgs, analysis: summary};",
            parameters: {
                type: "object",
                properties: {
                    code: { type: "string", description: "JavaScript code to execute (no TS type annotations)." },
                },
                required: ["code"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "sleep",
            description: "Put the current agent to sleep for N seconds. " +
                "The agent pauses until the sleep duration elapses or an alarm wakes it. " +
                "Use this to wait for external processes or time-based coordination.",
            parameters: {
                type: "object",
                properties: { seconds: { type: "integer", description: "Sleep duration in seconds." } },
                required: ["seconds"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "alarm",
            description: "Set an alarm that sends a message after N seconds. " +
                "Can target any agent (including self). Alarms can wake a sleeping agent.",
            parameters: {
                type: "object",
                properties: {
                    seconds: { type: "integer", description: "Delay before the alarm fires." },
                    message: { type: "string", description: "Message content delivered when the alarm fires." },
                    target_agent: { type: "string", description: "Target agent ID (default: current agent)." },
                },
                required: ["seconds", "message"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "ask_user",
            description: "Ask the user one or more questions. " +
                "Use this when you need clarification, confirmation, or additional input. " +
                "Provide a list of questions with optional multiple-choice options. " +
                "The tool will wait for the user's answers before returning.",
            parameters: {
                type: "object",
                properties: {
                    questions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                text: { type: "string", description: "The question to ask the user." },
                                options: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Optional multiple-choice options.",
                                },
                            },
                            required: ["text"],
                        },
                        description: "List of questions to ask.",
                    },
                },
                required: ["questions"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "todo_write",
            description: "Create or update a structured task list for your current coding session. " +
                "Use this to track progress through complex multi-step tasks. " +
                "Each item has an id, text, and status (pending | in_progress | completed). " +
                "Only ONE item can be in_progress at a time. Max 20 items. " +
                "Pass the FULL list each time — it replaces the previous list.",
            parameters: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: {
                                    type: "integer",
                                    description: "Optional. Omit for new items, include to update existing.",
                                },
                                text: { type: "string", description: "Task description (max 200 chars)." },
                                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
                            },
                            required: ["text", "status"],
                        },
                        description: "The full todo list (replaces previous).",
                    },
                },
                required: ["items"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "view_todo",
            description: "View the current prompt queue. " +
                "Returns {count, items: [string, ...]} showing queued prompts waiting to be processed.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "list_agents",
            description: "List all known agent IDs currently active.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "get_task_status",
            description: "Get detailed status and output of a specific background task by task_id. " +
                "Returns the full task object including stdout/stderr previews and file paths.",
            parameters: {
                type: "object",
                properties: {
                    task_id: { type: "string", description: "The task ID returned by a previous bash call." },
                },
                required: ["task_id"],
            },
        },
    },
] as const;

// ---- Shared tool guidance (appended to all agent prompts) -------------------

export const sharedToolGuidance =
    `\n\nPlatform tools available to all agents:\n- bash / bash_input / bash_output — shell commands with background support (60s foreground, 600s background)\n- list_background_tasks / get_task_status — manage long-running processes\n- exec — run Python, Bash, TypeScript code in a subprocess with optional background mode\n- eval — execute JavaScript in-process with yield* access to all platform APIs (bash, fork, spawn, join, send, recv → {from,to,content,timestamp}[], sleep, agents, agentId, import). Only plain JS — no TypeScript type annotations.\n- fork_agent / spawn_agent — create sub-agents with optional prompt, name, model, and reasoning_effort params\n- join_agent — wait for a sub-agent to complete and get its summary\n- list_agents — list all active agents\n- send_message / receive_messages — inter-agent communication\n- sleep / alarm — time-based coordination\n- view_todo / todo_write — todo board management\n\nSub-agent model selection:\n- Simple/fast tasks → model: "deepseek-v4-flash", reasoning_effort: "low"\n- Analysis/debugging → model: "deepseek-v4-flash", reasoning_effort: "high"\n- Complex/hard problems → model: "deepseek-v4-pro", reasoning_effort: "max"\n- Default to v4-flash+high unless the task genuinely needs v4-pro.`;

export const toolDefs = tools;
