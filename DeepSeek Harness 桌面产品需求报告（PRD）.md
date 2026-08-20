# DeepSeek Harness 桌面产品需求报告（PRD）

> **版本：** V0.1  
> **调研日期：** 2026-08-19  
> **项目阶段：** 产品定义 / MVP 规划  
> **暂定产品定位：** 面向 DeepSeek Harness 的本地优先 Coding Workbench 与精选插件发行版

---

# 1. 项目背景

DeepSeek Harness 已经明确采用 **“Everything is a Plugin”** 的架构，包括工具、UI、权限、持久化、Skills、MCP、工作流等能力都可以通过 Plugin 机制扩展。

但官方同时明确说明当前仍处于 **Developer Preview**，未来仍会发生兼容性破坏性变化。

这带来了一个明显的市场机会：

**DeepSeek Harness 的底层扩展能力很强，但普通用户要把它真正配置成一个成熟 Coding Agent，仍然需要理解大量插件、Profile、Provider、依赖、版本和配置问题。**

社区已经有人直接指出：

> “Everything is a Plugin” 对开发者是优势，但对普通用户意味着配置复杂度；用户只想使用 AI Coding Agent，不应该先理解 Profile composition、Bundle wiring 和 Plugin service。

因此，本项目不应该重新开发一个 Agent Runtime，而应该解决：

**如何把 DeepSeek Harness 和快速增长的插件生态，组合成一个稳定、简单、完整、真正达到商业 Coding Agent 使用体验的桌面产品。**

---

# 2. 一句话产品定位

## 一个“开箱即用”的 DeepSeek Coding Workbench

产品对用户表现为一个完整桌面软件：

```text
下载安装
    ↓
输入 DeepSeek API Key
    ↓
打开项目
    ↓
直接开始 Coding
```

用户不需要理解：

```text
Cordis
Profile
Bundle
patch.yml
pnpm
plugin add
provider route
skill root
```

但产品底层保持：

```text
                Desktop Product
                       │
        ┌──────────────┴──────────────┐
        │                             │
  Product Core                 Capability Layer
        │                             │
 Runtime Supervisor            Vision Plugin
 Workbench Shell               Memory Plugin
 Compatibility Manager         Search Plugin
 Secret Manager                Skill Plugin
 Recovery System               Remote Plugin
        │                             │
        └──────────────┬──────────────┘
                       │
             Official DeepSeek Harness
                       │
                Agent Runtime
```

核心原则：

> **对用户，它是一个产品；对 Harness，它是一个插件化发行版。**

---

# 3. 产品不应该做成什么

本项目**不建议**成为：

```text
deepseek-harness
      ↓
fork
      ↓
大量修改官方源码
      ↓
换 UI
      ↓
长期维护自己的 Harness
```

因为官方 Harness 当前仍快速迭代并明确存在 breaking changes。

更合理的方式是：

```text
Official DSH Runtime（固定经过测试的版本）

        +

自己的 Desktop Host

        +

自己的 Workbench

        +

精选第三方 Plugins

        +

Compatibility Layer
```

官方 Runtime 应尽可能保持原样。

---

# 4. 现有产品调研

## 4.1 DeepSeek Harness 官方

### 优点

官方 Harness 最大优势不是 UI，而是架构。

官方明确希望 UI、Tools、Skills、Sandbox、Permissions、Persistence、MCP、Workflow 等均通过 Plugin 实现。

这意味着本项目没有必要重复开发：

- Agent Loop
- Session 基础设施
- Tool Runtime
- Model Provider
- Plugin Runtime
- Skill Runtime
- MCP Runtime

### 缺点

目前最大问题是：

**这是一个开发者产品，而不是最终消费级产品。**

官方目前仍处于 Developer Preview，插件接口和兼容性可能继续变化。

### 本项目应该参考

**直接把 Harness 当 Agent Engine，而不是把 Harness 当最终产品。**

---

# 4.2 anywhere-labs/deepseek-harness-desktop

这是目前最值得研究的 DSH Desktop 项目之一。

它最正确的设计思想是：

**没有直接魔改官方 Harness。**

官方 Harness 按固定版本运行，Desktop 负责窗口、托盘、Terminal、更新、工作配置等桌面能力，并通过 Harness 插件机制组合进去。

### 优点

1. Desktop 与 Harness Core 分离。
2. 固定 upstream 版本。
3. Desktop 本身也按照 Plugin 思维设计。
4. 普通用户不需要手动运行 `dsh web`。
5. 已经证明“把 Harness 包成普通桌面产品”存在明显市场需求。

### 缺点

目前公开仓库仍存在约百个开放 Issue，尤其是：

- Windows 子进程 / Sandbox 兼容；
- Plugin lifecycle；
- Plugin Market 更新；
- Duplicate loader；
- 系统级进程与 Runtime 生命周期。

例如 Windows 上已经出现 PowerShell 子进程在 Electron Node 模式下触发 `0xC0000142` 的系统性问题，社区最终定位到 Electron/Node/ACL runner 的进程边界。

另外也出现过 Plugin Market 更新失败以及重复 Loader Entry 等问题。

### 本项目应该参考

**参考它的架构，不应简单 fork 它继续堆功能。**

尤其应该学习：

```text
Official Harness
      │
Pinned Version
      │
Desktop Adapter
      │
Native Host
```

但需要重点超过它的：

**稳定性、插件隔离、故障恢复和兼容管理。**

---

# 4.3 dataelement/dsh-desktop

截至调研时约 **1.0k GitHub Stars**。

它的 Desktop 架构也比较清晰：

```text
Electron Main
    ↓
Harness Child Process
    ↓
Random Loopback Port
    ↓
Harness Web UI
```

并负责 Profile、Plugin、Session 数据持久化以及 Harness 生命周期管理。

### 优点

它有几个非常值得参考的工程点：

- 随机 loopback port；
- Harness 单独 child process；
- readiness check；
- application-owned runtime directory；
- native logs；
- recovery actions；
- 平台相关打包检查。

### 缺点

真实 Issue 已经暴露出了类似问题：

- Plugin 不兼容导致 GUI 无法启动；
- 插件导致重启后闪退；
- 多模态 Provider 图片处理失败；
- 用户希望直接导入已有 Provider 配置；
- 曾出现安装包遗漏 DSH runtime dependency。

### 本项目应该参考

最值得参考的是：

> **Harness 必须被 Desktop 当成一个独立受监管的 Runtime Process，而不是 UI 内部随便启动的 library。**

---

# 4.4 DSH-better-sidebar

这是目前 DSH Coding Workbench 方向最值得研究的社区项目之一。

截至调研时约 **2.3k Stars**。

它已经实现：

- Lazy File Explorer
- CodeMirror Editor
- Image / Markdown / Mermaid / PDF Preview
- Browser
- xterm.js + node-pty Terminal
- Git Diff
- Git History
- Stage / Commit / Revert
- Subagent
- Background Task
- 多 Tab / Split View
- Session Layout Persistence

而且第三方 Plugin 可以调用 `ctx.betterSidebar.registerTab()` 注册自己的 Workbench Tab。

### 优点

这是目前最接近真正 **Coding Workbench** 的 DSH 插件。

它最值得借鉴的不是具体 UI，而是：

> **Workbench 本身也是一个可扩展容器。**

以后：

```text
Files
Diff
Terminal
Git
Browser
Database
Docker
SSH
```

都可以只是 Workbench Tab。

### 缺点

它也暴露出了典型插件问题：

- `node-pty` 在 Windows 可能需要 native build；
- pnpm build scripts 可能被阻止；
- 重复安装可能形成 double mount；
- 插件版本与 DSH rc 版本可能发生 peer dependency 冲突；
- 当前 Git Core 仍没有完整 push/pull/fetch；
- 没有实时 file watcher；
- Terminal Tab 跨 panel 会重新启动 shell。

另外已经有人反馈它与其他 Desktop 环境组合时存在 Sidebar 无法展开的问题。

### 本项目应该参考

**Workbench 的设计思想几乎全部值得拿。**

但 Files / Diff / Terminal / Git 这些核心 Coding 能力不建议完全依赖第三方 Plugin。

它们应该成为本产品自己的稳定 Core。

---

# 4.5 dsh-web-ui

截至调研时约 **4.8k Stars**。

它目前已经覆盖：

- Task Board
- Git Graph
- Right Panel
- Mobile Remote
- SSH Ops
- Vision
- Token Stats
- Pet
- Skin Center

等大量功能。

### 优点

它非常适合作为：

> **DSH 用户到底想要哪些 UI 功能的需求池。**

它证明这些需求都真实存在：

- Task 可视化；
- Git 图形界面；
- Remote；
- 手机控制；
- 右侧工作区；
- 状态监控；
- 主题。

### 缺点

本项目不应该照着它做“全家桶”。

原因不是这些功能不好，而是：

**大量不相关能力进入同一个核心包，会扩大兼容测试面。**

本项目应该学习它“发现了什么需求”，而不是学习“把所有需求做进一个包”。

---

# 4.6 ModLens

ModLens 是目前视觉能力方向非常值得直接集成的项目。

它的设计不是让 DeepSeek 本体强行变成多模态，而是：

```text
Image
   ↓
Vision Engine
   ↓
OCR / Layout / Semantic Evidence
   ↓
Structured JSON
   ↓
DeepSeek
```

也就是让视觉模型成为 DeepSeek 的“眼睛”。

### 优点

1. 主模型仍可以使用 DeepSeek 文本模型。
2. Vision Model 可以独立选择。
3. 图片输出被转换成结构化证据。
4. 用户可以直接 Paste Image。
5. Vision 与 Main Agent 解耦。

### 缺点

快速发展的 Plugin 同样存在兼容风险。

已经出现：

- `read_image` 与 DSH 原生 Tool 注册发生冲突；
- Vision Wrapper Provider 某些路由情况下会影响 reasoning block 的呈现。

### 本项目应该参考

**Vision 不应该自己重新开发。**

第一版优先集成成熟视觉插件。

但 Desktop 必须为用户隐藏复杂配置。

---

# 4.7 dsh-plugin-diff-review

这个项目 Star 数不高，但产品思想非常值得学习。

它实现了 Codex 风格的：

- Last Turn Diff
- Unstaged Diff
- Staged Diff
- Commit Diff
- Hunk Stage
- Hunk Revert
- Line Comment
- Review Comment → Agent
- Commit
- Push



### 优点

它解决了 Coding Agent 最核心的问题：

> AI 到底改了什么？

而不是把修改结果藏在 Tool Call 中。

### 缺点

当前安装仍然需要：

```text
安装 open-editor
安装 diff-review
修改 cordis.patch.yml
重新启动 DSH
```

普通用户不应该接触这些东西。

### 本项目应该参考

**Diff Review 必须成为 Core Experience。**

甚至应该比 Chat UI 优先级更高。

---

# 4.8 Plugin Market / Plugin Registry

目前社区已经出现多个 Plugin Market。

官方社区甚至已经开始讨论统一 Registry Contract，因为现状是不同 Marketplace 各自重新定义 Plugin metadata。

更严重的是：

**不完整 Manifest、错误 peer dependency、缺少 build artifact 的 Plugin 会直接进入用户环境。**

### 本项目应该参考

不要再做一个：

```text
搜索 GitHub
↓
Install
```

的简单插件市场。

真正应该做：

# Compatibility Manager

---

# 4.9 dsh-plugin-doctor

社区已经出现专门检查插件健康状态的 `dsh-plugin-doctor`。

它会检查：

- Manifest
- Patch
- Entry
- Files allowlist
- Build
- Pack
- Fresh-profile install
- Plugin 是否真正进入 runtime config



### 本项目应该参考

Plugin Doctor 这种能力应该直接进入 Desktop。

用户不应该运行：

```bash
dsh plugin check
```

而应该看到：

```text
ModLens

✓ Package valid
✓ Version compatible
✓ Build passed
✓ Loaded successfully
✓ Vision tool available
```

---

# 4.10 oh-my-dsh

oh-my-dsh 一个非常值得借鉴的思想是：

> 不自动追最新 Harness，而是 pin 一个经过测试的 upstream release，并使用 canary workflow 测试即将发布的版本。

### 本项目应该参考

这是本项目最应该采用的 Release 策略之一：

```text
DSH rc.7 发布
      ↓
不要立即给用户升级
      ↓
CI Compatibility Matrix
      ↓
测试精选 Plugins
      ↓
Canary 用户
      ↓
Stable
```

---

# 5. DSH 生态之外值得参考的成熟产品

## 5.1 Cline

Cline 截至调研时约 **66.5k Stars**。

它最值得参考的是完整“信任闭环”：

```text
Plan
 ↓
Act
 ↓
Edit
 ↓
Diff
 ↓
Approval
 ↓
Checkpoint
 ↓
Rollback
```

Cline 会显示修改 Diff，每个修改可以 Review / Revert；修改会进入 Checkpoint，因此用户可以撤回 Agent 的工作。Terminal Command 可以实时观察，长时间运行的进程也能继续监控。

### 本项目应该参考

**用户必须始终知道 Agent 在干什么，并且随时能够撤销。**

---

# 5.2 Aider

Aider 的两个设计非常值得参考：

### Repository Map

Aider 不会简单把整个代码仓库塞进 Context，而是维护 Repo Map，让模型理解整个代码库的重要 Symbol，同时只把真正需要修改的文件加入上下文。

### Git First

AI 修改天然进入 Git 工作流，可以 Diff、Commit、Undo。

### 本项目应该参考

后续应该拥有：

```text
Project Index
+
Symbol Map
+
Change Set
+
Git
```

---

# 5.3 OpenCode

OpenCode 很值得学习的一点是明确分离：

```text
Plan Agent
Build Agent
```

Plan 默认更受限，适合分析代码；Build 才获得更完整的执行权限。

### 本项目应该参考

不要让 Permission 只是：

```text
Allow
Deny
```

而应该把权限和工作模式绑定。

---

# 6. 本产品核心用户

## 用户 A：普通计算机学生

需求：

- 不想配置 Node / pnpm；
- 输入 API Key 就能用；
- 可以直接打开 Git 项目；
- 能看到 AI 改了什么；
- 出错不要让我看堆栈。

## 用户 B：Coding Agent 重度用户

需求：

- 自定义 Provider；
- DeepSeek + Vision Model；
- Terminal；
- Diff；
- Git；
- Skills；
- MCP；
- Plugin；
- Multiple Sessions；
- Context / Token / Cost 可视化。

## 用户 C：Harness 高级用户

需求：

- 自己安装 Plugin；
- Profile；
- Agent Preset；
- Custom Provider；
- 调试 Plugin；
- 查看 Runtime Graph；
- Developer Mode。

因此产品必须做到：

> **默认简单，高级能力可以逐层展开。**

---

# 7. V1 核心产品需求

## P0-1：零环境安装

安装程序必须自带：

- Desktop Runtime
- Compatible Node Runtime
- Pinned DSH Runtime
- Core Plugins
- Default Profile

用户不应该手动：

```bash
npm install
pnpm install
dsh web
```

### 验收

新电脑：

```text
Download
↓
Install
↓
Launch
↓
API Key
↓
Open Folder
↓
Chat
```

整个过程不得出现 Terminal。

---

# P0-2：Runtime Supervisor

Desktop 必须负责：

```text
启动 Harness
检测 Ready
检测 Crash
收集 Log
重启
关闭
升级
Rollback
```

Harness 应独立于 Renderer。

---

# P0-3：Safe Mode

这是本项目相比现有 Desktop 最重要的差异化能力之一。

如果某个 Plugin 导致：

```text
App
↓
Crash
↓
Restart
↓
Crash
```

系统必须自动检测 crash loop，并提示：

```text
上一次启动失败。

疑似插件：
dsh-xxx-plugin 1.2.3

[安全模式启动]

[禁用插件并启动]

[查看日志]
```

安全模式仅加载：

```text
Official Harness
+
Product Core
```

不得加载第三方 Plugin。

---

# P0-4：Last Known Good

每次：

```text
升级 DSH
安装插件
升级插件
修改 Profile
```

之前记录健康状态。

如果升级后无法启动：

```text
自动恢复
Last Known Good
```

---

# P0-5：Project / Session

左侧栏：

```text
Projects

ICD Coding
DeepSeek Desktop
School Project

────────────

Sessions

修复 Login Bug
实现 Vision
重构 Provider
```

Session 必须绑定 Workspace。

---

# P0-6：Coding Workbench

Workbench 是产品最核心的 UI。

布局建议：

```text
┌──────────────────────────────────────────────────────────┐
│ Project                  Model                 Smart ▼   │
├────────────┬──────────────────────┬─────────────────────┤
│ Projects   │                      │ WORKBENCH           │
│            │                      │                     │
│ Sessions   │ Conversation         │ Files | Diff        │
│            │                      │ Git   | Terminal    │
│            │ Agent Activity       │ Browser             │
│            │                      │                     │
├────────────┴──────────────────────┴─────────────────────┤
│ Running · auth.ts · Context 37% · $0.21          Stop │
└──────────────────────────────────────────────────────────┘
```

Workbench Core Tabs：

```text
Files
Diff
Git
Terminal
Browser
```

第三方插件以后可以注册：

```text
Database
Docker
SSH
Subagent
Preview
...
```

---

# P0-7：Agent Activity

不能只显示：

```text
tool_call
tool_result
tool_call
tool_result
```

必须转换成用户能够理解的状态：

```text
✓ 分析项目结构

✓ 阅读 auth.ts

● 正在修改 login.ts

○ 运行测试

○ 检查结果
```

展开后高级用户才能看到 Raw Tool Call。

---

# P0-8：Diff Review

每轮 Agent 修改必须形成一个：

# Change Set

用户可以看到：

```text
4 files changed
+128
-37
```

支持：

- File Diff
- Hunk Diff
- Accept
- Reject
- Revert
- Comment
- Send Comment to Agent
- Stage
- Commit

参考 `dsh-plugin-diff-review` 的思想，但应成为产品 Core。

---

# P0-9：Checkpoint / Rewind

每一轮重大修改建立轻量 Checkpoint。

用户可以：

```text
Undo Agent Changes
```

而不是自己：

```bash
git reset
git checkout
```

体验参考 Cline。

---

# P0-10：Permission Mode

提供三个用户能理解的模式：

## Safe

```text
File Write       Ask
Terminal         Ask
Network          Ask
Git Push         Ask
Delete           Ask
```

## Smart（默认）

```text
Read             Allow
Workspace Edit   Allow
Test             Allow

Delete           Ask
Outside Workspace Ask
Git Push         Ask
Secret Access    Ask
Dangerous Shell  Ask
```

## Full

允许 Agent 高自主执行，但仍保留极高风险操作保护。

---

# P0-11：Vision On Demand

Vision Plugin 可以预置兼容信息，但不应该强制用户第一次启动就配置。

正常流程：

```text
用户粘贴图片
       ↓
系统检查 Vision Capability
       ↓
未配置
       ↓
弹出配置向导
```

UI：

```text
需要视觉能力

DeepSeek 当前模型无法直接理解图片。

推荐：

○ 当前有免费额度的视觉 Provider
○ 使用已有视觉 API
○ Local Vision Model
○ Custom OpenAI-Compatible

[配置并继续]
```

配置一次后：

```text
Image
 ↓
Vision Plugin
 ↓
Vision Model
 ↓
Structured Evidence
 ↓
DeepSeek
```

第一版优先考虑 ModLens。

---

# P0-12：Provider Manager

不要让用户面对 YAML。

UI：

```text
Main Agent
DeepSeek
● Connected

Vision
Qwen-VL
● Connected

Fast Tasks
Use Main Model

Image Generation
Not configured

Embedding
Automatic
```

并允许：

```text
OpenAI Compatible
Custom Base URL
Local vLLM
Ollama
LM Studio
```

---

# 8. Capability-on-Demand

这是本项目非常重要的 UX 原则。

第一次启动只配置：

```text
DeepSeek API
+
Project
```

不要配置：

```text
Vision
Memory
Embedding
Image
Search
MCP
Remote
...
```

当用户第一次使用某能力：

```text
Paste Image
     ↓
推荐 Vision

Search Web
     ↓
推荐 Search Plugin

Need Memory
     ↓
开启 Project Memory

Connect GitHub
     ↓
登录 GitHub
```

即：

> **能力在用户需要时出现，而不是设置在用户使用之前出现。**

---

# 9. Plugin 产品策略

Plugin 分为三个等级。

## Level 1 — Core

由产品团队维护。

包括：

```text
Desktop Host
Runtime Supervisor
Workbench
Files
Diff
Terminal
Git Basic
Project / Session
Secret Storage
Recovery
Compatibility Manager
```

这些不能依赖第三方插件。

---

## Level 2 — Recommended

由社区开发，但本项目经过验证。

例如：

```text
Vision
Search
Advanced Git
Memory
Skill Manager
Remote
Notifications
```

显示：

```text
ModLens

★ Recommended
✓ Tested
✓ Windows
✓ macOS
✓ DSH rc.7

Permissions:
Network
Image Files
API Key: Vision only
```

---

## Level 3 — Community

允许任意用户安装。

但明确：

```text
Community Plugin

⚠ Not tested by XXX Desktop
```

---

# 10. Compatibility Layer

这是本产品最值得长期投入的能力。

维护：

```text
compatibility.json
```

逻辑类似：

```json
{
  "dsh": "0.1.0-rc.7",
  "plugins": {
    "modlens": {
      "tested": "3.x",
      "windows": true,
      "macos": true
    },
    "better-sidebar": {
      "tested": "0.13.x"
    }
  }
}
```

安装 Plugin 之前执行：

```text
Manifest Check
↓
Dependency Check
↓
DSH Version Check
↓
Native Dependency Check
↓
Permission Check
↓
Smoke Test
↓
Enable
```

社区目前正在讨论统一 Registry Contract，核心原因正是 Plugin metadata、依赖和预发布验证目前缺乏统一标准。

---

# 11. Plugin 安装必须是 Transaction

不能：

```text
npm install
↓
失败一半
↓
环境废掉
```

而应该：

```text
Snapshot
 ↓
Download
 ↓
Validate
 ↓
Install
 ↓
Smoke Test
 ↓
Enable
 ↓
Health Check
 ↓
Commit
```

任何一步失败：

```text
Rollback
```

---

# 12. Plugin Crash Isolation

如果插件：

```text
Vision Plugin
```

挂掉，

结果应该是：

```text
Vision unavailable
```

而不是：

```text
整个 Desktop 启动不了
```

社区已经明确提出过“第三方插件不兼容导致 DSH 无法启动，之后连 UI 都进不去进行修复”的问题。

因此插件故障隔离应作为核心产品能力。

---

# 13. API Key 与 Secret

所有 Key：

```text
DeepSeek
Vision
GitHub
OpenRouter
Custom API
```

应存储于操作系统 Secret Store，例如：

```text
Windows Credential Manager
macOS Keychain
Linux Secret Service
```

Plugin 默认不得读取全部 Key。

权限应按 Provider Scope 分发。

---

# 14. Cost / Context 可视化

建议底部状态栏：

```text
DeepSeek V4 Pro
Context 37%
18.4k tokens
Cache 92%
$0.14
1m32s
```

原因是 Agent 长 Session 下，用户必须知道上下文和成本情况。

官方社区已经出现用户反馈：Agent UI 卡死后后台仍继续运行，同时缺乏明显预算、成本和 context guardrail。

因此建议提供：

```text
Per Turn Cost
Session Cost
Token Usage
Context Usage
Cache Hit
Budget Limit
```

---

# 15. 推荐的技术架构

## V1 建议 Electron

虽然 Tauri 应用本身可以更轻，但本项目的 Runtime 本身就是 Node/TypeScript/Cordis Plugin 生态，而且 Coding Workbench 中像真实 Terminal 已经大量依赖 `node-pty` 等 Node Native 模块。

因此 V1 使用：

```text
Electron
+
React
+
TypeScript
+
Official DSH
+
Node Runtime
```

会减少：

```text
Rust Runtime
+
Node Runtime
+
IPC Bridge
+
Plugin Runtime
```

这种双运行时复杂度。

这是本 PRD 的工程建议，而不是必须永久绑定 Electron。

未来如果 Runtime 可以完全 daemon 化，再评估 Tauri。

---

# 16. 推荐目录架构

```text
desktop/
│
├── apps/
│   └── desktop/
│
├── packages/
│
│   ├── runtime-supervisor/
│   ├── workbench/
│   ├── projects/
│   ├── sessions/
│   ├── diff/
│   ├── terminal/
│   ├── git/
│   ├── secrets/
│   ├── permissions/
│   ├── plugin-manager/
│   ├── compatibility/
│   ├── recovery/
│   └── provider-manager/
│
├── runtime/
│   └── deepseek-harness/
│
├── registry/
│   ├── plugins.json
│   ├── providers.json
│   └── compatibility.json
│
└── third-party/
    └── notices/
```

---

# 17. V1 推荐预置插件

## 默认 Core

```text
Official Harness
Product Workbench
Product Diff
Product Terminal
Product Git
Product Recovery
Product Compatibility
```

## Recommended Capability

```text
Vision
→ ModLens

Plugin Diagnostics
→ 参考 dsh-plugin-doctor

Skill Management
→ 参考 dsh-skill-hub
```

`dsh-skill-hub` 已经开始解决内置 Skill Browser 只读能力不足的问题，包括 Skill Catalog、启停和诊断。

## 不建议 V1 默认安装

```text
Memory
SSH
Remote Mobile
Multi-Agent
Pet
Themes
Image Generation
Database
Docker
```

这些进入 P1 / P2。

---

# 18. 不应该直接打包哪些项目

## dsh-web-ui 全家桶

不建议直接全部打包。

**参考需求，不参考整体依赖。**

## DSH-better-sidebar

强烈参考 Workbench 设计。

但 Files / Terminal / Diff / Git Basic 最终建议自己拥有稳定版本。

可以兼容 Better Sidebar Plugin，而不是产品依赖它才能工作。

## 第三方 Plugin Market

可以使用其数据作为发现来源。

但安装必须经过自己的：

```text
Compatibility Layer
+
Security Layer
+
Health Check
```

---

# 19. V1 功能优先级

开发投入建议：

```text
35%  Runtime Stability
     Install
     Recovery
     Safe Mode
     Compatibility

30%  Coding Workbench
     Files
     Diff
     Git
     Terminal

15%  Agent UX
     Activity
     Plan
     Permissions
     Checkpoint

10%  Provider / Vision UX

 5%  Plugin / Skill Manager

 5%  Theme / Polish
```

---

# 20. V1 不做什么

明确不做：

```text
❌ 自研新的 Agent Runtime

❌ Fork Harness 大量改 Core

❌ 自研 Vision Model

❌ 自研 Memory System

❌ 自己重新造 100 个 Plugin

❌ 第一版 Multi-Agent Team

❌ 第一版手机 Remote

❌ 第一版插件数量竞赛
```

V1 目标只有：

> **把最基本的 DeepSeek Coding 流程做到比现有 Desktop 明显舒服。**

---

# 21. V1 核心用户闭环

最终必须做到：

```text
下载安装
    ↓
输入 DeepSeek API Key
    ↓
打开 Repo
    ↓
输入：

“登录页面现在会重复请求两次 API，
帮我找原因并修复”
    ↓
Agent：

✓ 分析项目
✓ 找到相关文件
● 修改 auth.ts
○ 测试
    ↓
Workbench 自动显示 Diff
    ↓
用户查看
    ↓
评论：

“这里不要改公共 API”
    ↓
Agent 修改
    ↓
测试通过
    ↓
Commit
```

用户中途随时：

```text
Stop
Undo
Revert
Review
Take Over Terminal
```

---

# 22. Vision 用户闭环

用户：

```text
Paste Screenshot
```

系统：

```text
第一次使用图片能力。

为 DeepSeek 添加视觉能力？
```

用户：

```text
Recommended
```

系统：

```text
检测当前可用 Provider
```

例如显示：

```text
Vision Provider A

目前提供免费额度
Recommended

[Connect]
```

注意：

**“免费视觉模型”不能硬编码。**

Provider Registry 应该远程更新：

```text
Provider
Model
Pricing
Free Tier
Capability
Region
Last Updated
```

否则 Provider 一旦取消免费额度，就必须重新发布 Desktop。

---

# 23. 最重要的产品差异化

现有 DSH 社区并不缺：

```text
插件
UI
Git
Vision
Memory
Remote
Theme
```

真正缺的是：

```text
               Community Plugins
                      │
                      ▼
                Your Product
                      │
        ┌─────────────┼─────────────┐
        │             │             │
     筛选插件       测试插件       配置插件
        │             │             │
        ▼             ▼             ▼
      安全检查      兼容矩阵       一键配置
        │             │             │
        └─────────────┼─────────────┘
                      ▼
                 Stable UX
```

因此真正的长期护城河不是：

> “我们拥有最多插件。”

而是：

> **“我们让 DeepSeek Harness 的插件真正可靠地工作。”**

---

# 24. 产品核心卖点

建议最终对外只讲三个：

## 1. 开箱即用

> 不需要 Node、不需要 pnpm、不需要命令行配置 Harness。

## 2. 真正的 Coding Workbench

> Chat、Files、Diff、Git、Terminal 在一个工作流里。

## 3. 插件能力自动配置

> 需要视觉、联网、Memory 等能力时，由系统推荐并一键启用。

不要把营销首页写成：

```text
1500 Plugins
20 Providers
30 Skills
50 MCP
```

普通用户不关心这些。

---

# 25. 产品真正应该追赶的对象

不应该只比较：

```text
DSH Desktop A
DSH Desktop B
DSH Web UI
```

最终应该比较：

```text
Claude Code
Codex
Cline
Cursor
OpenCode
Aider
```

因为用户真正比较的是：

> **“这个 Coding Agent 好不好用？”**

而不是：

> **“这个 DeepSeek Harness Wrapper 功能多不多？”**

---

# 26. V1 成功指标

建议设定以下内部指标。

### 安装

```text
首次安装成功率 > 98%
```

### 启动

```text
Crash-free launch > 99.5%
```

### Recovery

第三方 Plugin 导致启动失败时：

```text
100% 可以进入 Safe Mode
```

### Plugin

Recommended Plugin 必须经过：

```text
Windows
macOS

Install
Enable
Disable
Upgrade
Rollback
Smoke Test
```

### Onboarding

新用户第一次：

```text
安装 → 第一次发送 Prompt
```

目标：

```text
< 3 分钟
```

### Vision

用户第一次贴图：

```text
Paste → Configure → Agent understands image
```

最多：

```text
3 个主要步骤
```

---

# 27. Roadmap

## V0.1 — Runtime

```text
Desktop Shell
Harness Supervisor
Pinned Runtime
Logging
Safe Mode
Rollback
Provider Setup
```

## V0.2 — Workbench

```text
Projects
Sessions
Files
Terminal
Diff
Git
Agent Activity
```

## V0.3 — Coding Safety

```text
Smart Permission
Checkpoint
Rewind
Change Set
Review Comments
```

## V0.4 — Capability

```text
Vision
Plugin Manager
Skill Manager
Plugin Doctor
Compatibility Registry
```

## V0.5 — Advanced

```text
Project Memory
Remote
Multi-Agent
Browser Automation
SSH
Docker
Database
```

---

# 28. 最终架构判断

本项目不应该做成：

> 一个巨大的 DeepSeek Harness Plugin。

也不应该做成：

> 一个 Fork 之后自行发展的 DeepSeek Harness。

最合理的产品形态是：

```text
┌───────────────────────────────────────┐
│          Your Desktop Product         │
│                                       │
│ Projects | Chat | Workbench | Settings│
├───────────────────────────────────────┤
│           Product Core                │
│                                       │
│ Runtime Supervisor                    │
│ Compatibility                         │
│ Recovery                              │
│ Permissions                           │
│ Secrets                               │
├───────────────────────────────────────┤
│       Curated Capability Layer        │
│                                       │
│ Vision | Search | Memory | Skills ... │
├───────────────────────────────────────┤
│                                       │
│       Official DeepSeek Harness       │
│                                       │
│          Agent Runtime                │
└───────────────────────────────────────┘
```

其中：

> **Harness 负责智能。**

> **社区负责能力。**

> **本产品负责体验、稳定性、兼容性和信任。**

---

# 29. 最终产品定义

如果只能保留一句话，我建议把整个项目定义为：

## 「一个为 DeepSeek Harness 打造的本地优先 Coding Workbench 与精选插件发行版。」

它不是另一个 Harness。

不是 Web UI 套 Electron。

也不是一个插件市场。

它真正解决的是：

> **把一个强大的 Agent Engine 和混乱但快速发展的开源插件生态，变成普通开发者真正每天愿意使用的 Coding 产品。**

这也是目前整个 DSH 生态最值得切入的位置。