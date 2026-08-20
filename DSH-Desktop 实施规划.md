# DSH Desktop 实施规划（调研结论 + 落地路线）

> 版本：V0.1（对应 PRD V0.1）
> 调研日期：2026-08（与 PRD 同期）
> 输入：《DeepSeek Harness 桌面产品需求报告（PRD）.md》+ 用户新增需求（聊天框拖拽文件引用，Codex 式）
> 输出：本文档 = 调研结论 + 差距矩阵 + 架构决策 + 分模块实施计划 + 迭代排期

---

# 0. 结论速览（TL;DR）

1. **现有桌面壳比 PRD 设想的起点好**：工作区 `DSH-Desktop` 已经是一个可打包的 Electron 43 桌面壳（wrddgg 的 DSH Desktop 1.0.0），已实现：P0-1（零环境安装，runtime 依赖闭包打包 + 审计 + smoke 测试）、P0-2 的 80%（Harness 子进程监管、ready 探测、日志、重启、超时强杀）、自动更新（含 pending-update 恢复）、以及一个基础 Diff 面板（只读查看，P0-8 的 30%）。
2. **官方 DSH 0.1.0-rc.7 的 Web UI 能力远超 PRD 的悲观估计**：workspaces/sessions 浏览器、Permission Presets、Plan Mode、Goal、Subagent、Trajectory（Agent Activity）、token-meter / session-stats（Context 占用）、附件图片系统、插件设置 + 插件清单（plugin inventory）、模型选择设置页 —— 全部官方自带。**PRD 里很多"要自研"的东西，正确做法是"接官方的 + 补体验缺口"**，这与 PRD "不 fork、不重造" 的原则完全一致，且能省大量工作量。
3. **用户新需求（拖拽文件引用）在官方架构里有天然落点**：官方输入机已内置 `ReferenceInsert`（引用 chip + U+FFFC 占位）、`Occurrence` 表、`ReferenceCodec.serialize()`（把引用序列化成给模型的文本）、以及 `@`/`/` 触发源注册管线。拖拽文件 → chip → 提交时序列化为路径给模型 → 模型用自己的 read 工具去读，整条链路官方已铺好，我们只需写一个客户端插件。（详见 §4 设计）
4. **真正需要自建的差异化能力**（也是 PRD 定义的护城河）：
   - Safe Mode / crash-loop 检测 / Last Known Good（P0-3/4，桌面主进程）
   - Coding Workbench：Files / Git / Terminal / Browser 标签页（P0-6，官方完全没有）
   - 产品级 Diff Review / Change Set / Checkpoint / Rewind（P0-8/9，官方只有行内 diff 展示）
   - 拖拽文件引用（新增需求）
   - Provider / Vision 配置向导 + 远程 Provider Registry（P0-11/12）
   - 兼容注册表 + 交易式插件安装 + Plugin Doctor（§10-12）
5. **排期建议**：在现有 V0.1（Runtime）基础上，3 个迭代（V0.2-V0.4）约 10-12 周完成 PRD 的 V0.2-V0.4 全部 + 拖拽文件引用（用户点名，并入 V0.2）。拖拽功能本身约 3-5 人日。

---

# 1. 调研过程与方法

本次调研分四路进行：

| 调研项 | 方法 | 结论位置 |
|---|---|---|
| 工作区现状 | 通读 `DSH-Desktop` 全部主进程/preload/renderer/脚本/插件代码 | §2.1 |
| 官方 DSH rc.7 能力 | 直接考古 `C:\Program Files\DSH Desktop\resources\dsh-runtime` 内 565 个 `@deepseek-ai/*` 包的类型定义与实现 | §2.2 |
| 社区插件生态 | 两个后台调研子代理：①DSH 生态各插件项目现状 ②Codex/Cline/Cursor/Claude Code/Aider 的文件引用交互 | §2.3 / §4 |
| 竞品交互 | 同上（拖拽/@提及/chip/序列化格式） | §4 |

关键考古发现清单（官方 rc.7 内可直接复用的能力）：

- `dsh-client-ui-slots`：完整 Slot 注册体系（`sidebar` / `conversation` / `conversation.view` / `conversation.chat.node` / `conversation.composer` / `conversation.input.left|right|dock` / `conversation.composer.dock` / `conversation.details.tool` / `shell.overlay` / `details` 等），**并带崩溃隔离**（slot 入口崩溃自动 abdicate 让位，`onEntryError` 事件可上报）。
- `dsh-client-ui-input-trigger`：`@`/`/` 触发管线（菜单候选、`ReferenceInsert` 引用 chip、`ReferenceCodec` 模型序列化、剪贴板往返、paste 匹配）。
- `dsh-attachment` + `dsh-attachment-local` + `dsh-client-ui-attachment`：图片附件（内容寻址存储、DropOverlay/DragMask、Lightbox）——**官方目前只支持图片，不支持任意文件引用**，这正是我们的机会点。
- `dsh-workspace`：`ctx.workspaceRegistry`（工作区持久化、会话归属、归档、排序）——P0-5 的后端已官方。
- `dsh-permission-presets` + `dsh-client-ui-permission-presets`：权限预设（`/permission <preset>` 命令 + 选择器 UI）——P0-10 的后端已官方。
- `dsh-session-stats` / `dsh-token-meter`：`sessionStats` / `tokenUsage` / `contextPressure` 投影（回合数、步数、LLM/工具耗时、token、**上下文占用率**）——§14 的数据源已官方。
- `dsh-host-plugin-inventory`：插件清单 Remote（`pluginInventory/list`，含 entryId/moduleName/enabled/fiberPhase）——Safe Mode 诊断和插件管理 UI 的数据源已官方。
- `dsh-terminal` + `dsh-terminal-bash` + `node-pty`（已随 runtime 打包并做 smoke 测试）：PTY 会话注册表——终端能力有官方底座。
- `dsh-typert-*`：生成式类型安全 RPC（host service → client remote），官方插件清单等已走此通道。
- `dsh-session-checkpoint-policy`：语义级持久化检查点（防崩溃丢日志；注意：这是**日志一致性**检查点，不是用户可回滚的 Change Set，后者需要自建）。
- `dsh-settings` / `dsh-credentials`：命名空间化设置与凭证 seam（凭证是 env 风格引用）。
- `dsh-client-modules`：客户端插件加载协议（`window.__ModuleLoader__.load({id, factory})` + `dsh.client` manifest + `/plugins/<id>/client.js` 服务端点 + HMR）——现有桌面插件已按此协议工作，新增插件照抄即可。

---

# 2. 现状盘点与差距矩阵

## 2.1 现有桌面壳盘点（工作区 `DSH-Desktop`）

| 模块 | 文件 | 状态 |
|---|---|---|
| 应用入口 / 单实例锁 | `src/main/main.ts` | ✅ 完整 |
| Harness 监管 | `src/main/harness-supervisor.ts` | ✅ 启动/探测/日志/重启/超时强杀/进程树清理；❌ 无 crash-loop 检测、无 Safe Mode、无 LKG |
| Profile 管理 | `src/main/profile.ts` | ✅ 受管 profile 写入 + 插件拷贝 + 非受管保护；❌ 无多 profile（safe 模式）、无版本迁移 |
| 就绪探测 | `src/main/readiness.ts` | ✅ URL 解析 + 允许列表校验 |
| 窗口管理 | `src/main/window.ts` | ✅ 加载 splash → harness URL + 导航守卫 + preload 桥验证 |
| IPC 桥 | `src/main/ipc.ts` + `src/preload/preload.ts` | ✅ 更新/运行状态/日志/重启；❌ 无 fs/git/terminal/secret 通道 |
| 自动更新 | `src/main/app-updater.ts` | ✅ electron-updater + 静默安装 + pending 恢复 + 通知 |
| 日志 | `src/main/logger.ts` | ✅ 滚动文件日志 |
| 客户端插件 | `packages/dsh-desktop-plugin` | ✅ 更新 UI + 只读 Diff overlay（`tool.call.toolview` 插槽）；❌ 无变更集/回滚/评论/提交 |
| 打包管线 | `scripts/*.mjs`（build/prepare-runtime/audit-runtime/smoke-runtime/runtime-patches） | ✅ 依赖闭包 + 审计 + node-pty smoke；❌ 无客户端插件构建步骤、无 CI 兼容矩阵 |
| 版本锁定 | `compatibility.json` | ✅ desktop↔dsh 映射；❌ 无插件兼容表 |

## 2.2 差距矩阵（核心交付物）

图例：🟢 官方/现有已覆盖 → 只需要接线/打磨；🟡 需要补建（工作量中）；🔴 需要全新建设（工作量大，差异化核心）。

| PRD 条目 | 官方/现状 | 差距与方案 | 等级 |
|---|---|---|---|
| P0-1 零环境安装 | 打包管线已存在（dsh runtime 闭包 + 审计 + smoke） | 补：安装器 CI、签名、双平台（macOS 后置）；新增插件纳入管线 | 🟢 |
| P0-2 Runtime Supervisor | supervisor 已覆盖启动/就绪/日志/重启 | 补：crash-loop 检测、退出码/信号分类、状态机完善、健康上报 | 🟡 |
| **P0-3 Safe Mode** | 无 | 🔴 新建：crash 计数 → splash 弹"安全模式/禁用插件/看日志"；safe profile 只含官方+Core | 🔴 |
| **P0-4 Last Known Good** | 无 | 🔴 新建：健康记录 + 升级/装插件前快照 + 回滚 | 🔴 |
| P0-5 Project/Session | 官方 workspaces + sessions 浏览器完整 | 补：固定项目、项目图标/最近列表、侧栏打磨（低优先级） | 🟢 |
| **P0-6 Coding Workbench** | 官方完全没有 Files/Git/Terminal 标签 | 🔴 新建：右侧工作台容器 + Files/Git/Terminal 三标签（方案 §5.2）；Browser 后置 | 🔴 |
| P0-7 Agent Activity | 官方 Trajectory 视图（call 列表/瀑布）已有 | 补：中文友好的"正在进行什么"摘要条（工具名→动词映射），现有 DiffToolView 已有雏形 | 🟡 |
| **P0-8 Diff Review / Change Set** | 官方行内 diff + 现有桌面 overlay（只读） | 🔴 升级：按回合聚合 Change Set + Accept/Reject/Revert/Comment→Agent/Stage/Commit（§5.3） | 🔴 |
| **P0-9 Checkpoint / Rewind** | 官方 session-checkpoint-policy 是日志一致性检查点，非用户回滚 | 🔴 新建：git snapshot（或文件快照）+ 变更集关联 + Undo Agent Changes（§5.3） | 🔴 |
| P0-10 Permission Mode | 官方 permission presets 完整（/permission + UI chip） | 补：Safe/Smart/Full 三档预设映射 + 默认值写入 desktop profile + 首次引导文案 | 🟢 |
| **P0-11 Vision On Demand** | 官方图片附件链路（粘贴图片）已有；缺视觉 Provider 链路 | 🔴 新建：vision 管线（本地视觉服务或社区插件，待 §2.3 生态结论）+ 配置向导 + Provider Registry | 🔴 |
| **P0-12 Provider Manager** | 官方 settings-models 页已有模型选择 | 🟡 补：多 Provider 向导 UI（主模型/视觉/快速任务）+ 凭证写入（§5.6） | 🟡 |
| §8 Capability-on-Demand | 无对应机制 | 🟡 建：能力触发检测（贴图→vision 向导、拖文件→引用、/search→搜索插件）+ 推荐流 | 🟡 |
| §9-12 插件策略/兼容/交易式安装/隔离 | 官方插件设置页 + plugin inventory + slot 崩溃 abdication 已有 | 🔴 新建：compatibility.json 插件表 + 远程注册表 + 交易式安装 + doctor + 健康徽章（§5.9） | 🔴 |
| §13 Secret | dsh-credentials（本地文件）已有 | 🟡 补：Windows Credential Manager 存储（桌面桥）+ 注入 harness 环境 + 作用域分发（P1） | 🟡 |
| §14 Cost/Context | 官方 token-meter/session-stats 投影完整 | 🟡 补：货币成本（用量×registry 价格）+ 预算上限 + 底部状态栏/增强 composer.dock | 🟡 |
| **新增：拖拽文件引用** | 官方输入机 reference 机制完整、但无任意文件引用源与拖拽 | 🔴 新建（但官方机制齐全，工作量小）：@file 触发源 + 拖拽 + chip + codec（§4） | 🔴→🟡 |

## 2.3 社区插件生态调研结论

**已确认（两路调研合并）**：

**版本面**：`v0.1.0-rc.7` 就是当前最新 release（未见 rc.8/stable）；Harness 约 2026-08-17 以 Developer Preview 发布——**pin rc.7 不是保守选择，就是跟随最新**，升级风险策略（§7）依然成立。

**项目面**（活跃度/星数为调研时点快照，部分数字未能核实，标注 ✱）：

| 项目 | 最新状态 | 对本产品的意义 |
|---|---|---|
| ModLens → [liustack/modlens](https://github.com/liustack/modlens)（npm `@liustack/modlens`） | 活跃；CLI 视觉桥（OCR/布局/语义 → JSON 证据）+ skill（`skills/modlens/SKILL.md`）；**注意：Windows EXE 一键安装器是第三方项目 [JR-JR07/dsh-modlens-installer](https://github.com/JR-JR07/dsh-modlens-installer)**（捆绑智谱 GLM-4V-Flash 免费视觉引擎）；安装形态是 CLI+skill，**非 bundle 插件**，入口方式需读其 INSTALL.md 确认 | §5.5 Vision 向导的"免费额度 Provider"推荐首选项；集成形态为 CLI+skill（见 §2.3 安装模式分类） |
| [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（npm `@starpivot/dsh-better-sidebar` + loader `@dsh-plugin/dsh-better-sidebar-loader`）（~1.9k⭐✱） | 活跃（近期 PR #128：xterm→@xterm/xterm 迁移）；**loader 模式意味着需要 cordis.yml 入口** | Workbench 设计参考（PRD 结论不变：参考设计、自建 Core） |
| dsh-plugin-doctor → [lin-cheng-lab/dsh-plugin-doctor](https://github.com/lin-cheng-lab/dsh-plugin-doctor) + [boyin111-1/dsh-doctor](https://github.com/boyin111-1/dsh-doctor)（npm `dsh-doctor`）+ [SIMON-WORLD/dsh-toolkit](https://github.com/SIMON-WORLD/dsh-toolkit)（**获官方 [Discussion #2801](https://github.com/deepseek-ai/deepseek-harness/discussions/2801) 关注**；toolkit 另含 @文件引用、成本面板、视觉桥、173 痛点知识库） | 活跃 | §5.9 Plugin Doctor 的实现参考与校验项来源 |
| dsh-plugin-diff-review（PRD 原名） | 未找到该名；对应物为 `dsh-review` / `dsh-file-review` / `dsh-file-review-tab` / `rich-file-review`（npm，[diff 审查系列博客](https://blog.yeyupiaoling.cn/tag/diff%E5%AE%A1%E6%9F%A5)）；**hunk 级 stage/revert/commit 功能未见任何项目确认具备** | §5.3 Change Set 的功能参考（仍自建为 Core，hunk 操作是差异化点） |
| dsh-skill-hub（PRD 原名） | 未找到该名；对应物为 CocoSgt/dsh-skills、stvlynn/dsh.fish（插件/skill/MCP/预设安装器）、alex04130/dsh-forge（含插件市场+技能管理面板）；官方 `packages/skill/skill-filesystem` 存在 | 技能管理参考 |
| Plugin Market | **无官方注册表**；社区：dsh-market/dsh-market（DSH 内可视化市场）、2BingLing/dsh-market（1500+ 插件✱）、**AdamPlatin123/awesome-dsh-plugins（每日兼容性跟踪，事实上的兼容台账）**、多个 awesome 索引库；**未发现统一 registry contract 规范** | §5.9 的兼容注册表可借其数据源；"每日兼容跟踪"验证了 PRD 的注册表思路 |
| 桌面 wrappers | anywhere-labs（有 docs/why-desktop.md + dsh-plugin-desktop）与 dataelement/dsh-desktop（v0.1.1/v0.3.0；媒体称发布首日 +1912⭐✱）均活跃；另有 lai-133/dsh-integration（**已捆绑 better-sidebar + dsh-web-ui + ModLens + dshmarket 的"全家桶"竞品**）、Links2008 等 v3.x 桌面壳 | PRD §4.2/4.3 结论维持；"全家桶"竞品印证 PRD §4.5 的判断（全家桶=兼容测试面膨胀） |

**安装模式分类（直接影响 §5.9 交易式安装的设计，安装前必须逐插件确认）**：
1. **npm bundle-entry 插件**（直接进 profile bundle，无需 patch）；
2. **`-loader` 模式**（如 dsh-better-sidebar：需要 cordis.yml 写入 loader 入口）；
3. **CLI 工具 + skill**（如 ModLens：外部命令 + skill 编排，不属于 Cordis 插件）。

→ 兼容注册表每插件条目需记录 `installMode`，交易式安装按模式走不同管线。

**文件拖拽/引用（用户新需求）——社区已有 5+ 个先例，功能已被商品化，两大语义流派已成型**：
- **路径注入派**（Codex 语义，我们采用）：`GLFzr/dsh-file-upload`（拖拽→路径插入输入框，与需求逐字一致）、`omdsh-dev/dsh-drag-and-drop`（drop 为 chip，明确"不再只收图片"，fork：AKIRACOD/dsh-drag-and-drop）；
- **内容附加派**（Claude/Cline 语义）：`FSMargoo/dsh-at-file`（Codex 式 @file 搜索+附加内容）、`HongMing-Huang/dsh-file-upload`（Claude 式附加+内容嗅探+MarkItDown+`read_document` 工具）；
- 其他：`SIMON-WORLD/dsh-toolkit` 的 `@文件引用`、dsh-paste-input、dsh-attach-upload、dsh-web-file-uploader、dsh-utility-tools。

→ 我们按 PRD 原则自建为 Core（§4，默认路径注入 + 小文件限量内联的折中），但开工前逐个读源码取集成点经验。

---

# 3. 架构决策

## 3.1 总体架构（延续 PRD §15/16/28，结合现状细化）

```text
┌────────────────────────────────────────────────────────┐
│              DSH Desktop（Electron 主进程）             │
│                                                        │
│  Runtime Supervisor（增强：crash-loop/Safe/LKG）        │
│  Secret Manager（Windows Credential Manager）           │
│  Native Bridge（fs / git / node-pty / 系统对话框）      │
│  Workbench 服务（files/diff/git/terminal 的后端）       │
│  Compatibility Manager（注册表 + 交易式安装 + doctor）   │
└───────────────┬────────────────────────────────────────┘
                │  spawn（pin rc.7）+ env 注入 + preload 桥
┌───────────────▼────────────────────────────────────────┐
│        Official DSH runtime（0.1.0-rc.7，原样）         │
│  host plugins：dsh-base / dsh-web-app / 桌面插件（host 半）│
│  ⤷ 提供官方一切：agent loop、session、workspace、       │
│    permission presets、token meter、plugin inventory、  │
│    typert RPC、图片附件、终端 PTY 注册表…               │
└───────────────┬────────────────────────────────────────┘
                │  WebSocket / HTTP（typert remotes）+ slot 注册
┌───────────────▼────────────────────────────────────────┐
│       客户端插件（官方 Web UI 内，slot 扩展）            │
│  @wrddgg/dsh-desktop-plugin（现有：更新+Diff overlay）   │
│  + dsh-desktop-file-ref   （拖拽文件引用）【新】         │
│  + dsh-desktop-workbench  （Files/Git/Terminal）【新】   │
│  + dsh-desktop-changeset  （Change Set/Checkpoint）【新】│
│  + dsh-desktop-capability （Vision/Provider 向导）【新】 │
│  + dsh-desktop-plugins    （插件管理/兼容 UI）【新】     │
└────────────────────────────────────────────────────────┘
```

## 3.2 关键决策清单

| # | 决策 | 理由 |
|---|---|---|
| D1 | **不 fork、不改官方 UI 源码**；一切 UI 走官方 Slot 体系（客户端插件） | PRD 原则 + 官方 rc.7 的 slot 面已足够（sidebar/conversation/details/shell.overlay/composer 全套）；升级 rc 时冲突面最小 |
| D2 | **pin rc.7 作为 V1 基准**，升级走 canary + CI 兼容矩阵（复用 oh-my-dsh 思想） | PRD §4.10；官方明确 Developer Preview 有 breaking changes |
| D3 | **Workbench 原生能力走桌面 preload 桥（`window.dshDesktop` 扩展）**，不走 typert 生成器 | 现有桥已验证；typert 生成器是 dev-only 工具不在 runtime 里，自建生成管线成本高；Files/Git/Terminal 是产品 Core，本就该桌面拥有（PRD §4.4 结论）。typert 只读现有官方 remote（pluginInventory 等） |
| D4 | **Workbench UI 容器用官方 `details` 右栏槽位**（替换官方 DetailsPanel，把 Tool 详情收编为其中一个标签），V0.2 先行用 `shell.overlay` 浮动面板过渡（零风险） | 符合 PRD 三段式布局（左栏/对话/右工作台）；details 槽位是官方预留的右栏扩展点；收编后 tool 详情仍可用 `conversation.details.tool` 数据自渲染 |
| D5 | **Change Set / Checkpoint 数据层放桌面主进程**（JSON store + git snapshot），客户端插件只做采集与 UI | 跨会话/跨进程一致；git 命令天然在桌面侧执行；undo 需要文件系统写回权限，走桌面桥最干净 |
| D6 | **Secret 用 Windows Credential Manager**（通过桌面桥封装，P1 再考虑 keytar/DPAPI 细节），启动时注入 harness 子进程环境 | PRD §13；现有 supervisor 已控制 env 注入点，改动最小；`dsh-credentials` 的 env 引用模型与此兼容 |
| D7 | **新客户端插件引入正式构建步骤**：esbuild 打包（inject 依赖 external）+ 保留 `window.__ModuleLoader__.load` handoff + `dsh.client` manifest | 现有 `lib/client.js` 是手写单文件，Workbench 规模必须上构建；这是工程基建，先行 |
| D8 | **Provider Registry / 插件兼容表放远端静态 JSON**（GitHub Releases 托管，desktop 启动时按版本拉取），本地兼容表兜底 | PRD §22 明确"免费额度不能硬编码"；离线可用 |
| D9 | Git 能力：**优先使用系统 git**，检测缺失时引导安装 / P2 再捆绑 MinGit | 减少安装包体积与签名复杂度；V1 用户群（学生/开发者）大多已装 git |
| D10 | 官方 rc.7 自带能力（workspace/session/permission/plan/goal/trajectory/token-meter/附件图片）**一律不重写，只做接线与体验补丁** | 省 40%+ 工作量；与 PRD"参考需求，不参考整体依赖"兼容 |

---

# 4. 新增需求设计：聊天框拖拽文件引用（Codex 式）

用户诉求：像 Codex 一样，把文件拖进聊天框作为"参考"——即把路径用另一种方式交给模型，让模型自己读。

## 4.1 交互设计（竞品调研结论）

对 Codex / Cline / Cursor / Claude Code / Aider 的调研结论：

| 产品 | 机制 | 序列化方式 |
|---|---|---|
| Codex | `@` 提及 + Add context；**任意文件拖拽是长期 open 请求（issue #3761），图片拖拽已支持** | **路径即引用**（`@filename` 只给路径，模型用 Read 工具读；内联内容是另一个 open 请求 issue #3413） |
| Cline | `@file/@folder` chip + 拖拽（文件/文件夹→提及，图片→base64 附件） | **发送时读文件并内联内容**（带路径包裹块，文件夹有数量上限）；Checkpoint = 影子 git 仓库快照 |
| Cursor | `@Files/@Folders/@Code/@Docs/@Web/@Git/@Notepads` 模糊搜索 + chip（路径+类型图标，退格删除）；`@file:10-20` 行区间 | **内联内容/选区**，大文件截断 |
| Claude Code | `/add`、`/add-dir`、`@path`；CLI 无原生拖拽 | 双机制并存：Read 工具（路径）+ `@`/`/add` 客户端内联注入 |
| Aider | `/add`（可编辑）、`/read-only`（只读参考）、`/drop` | 内联内容 + **repo map**（tree-sitter 符号地图注入系统提示） |

**DSH 生态已有直接先例（重要）**：社区已有人做过同类功能，证明官方机制可行、集成点成熟，可作为实现参考（但我们按 PRD 原则自建为 Core，不依赖第三方）：
- [FSMargoo/dsh-at-file](https://github.com/FSMargoo/dsh-at-file) — Codex 式 `@file` 提及（搜索工作区文件）
- [GLFzr/dsh-file-upload](https://github.com/GLFzr/dsh-file-upload) — **"Codex 式拖拽，路径自动插入输入框"**（与用户需求逐字一致）
- [HongMing-Huang/dsh-file-upload](https://github.com/HongMing-Huang/dsh-file-upload) — Claude 式拖拽/回形针，内容嗅探、MarkItDown、`read_document` 工具
- [omdsh-dev/dsh-drag-and-drop](https://github.com/omdsh-dev/dsh-drag-and-drop)（另有同名 AKIRACOD/dsh-drag-and-drop 项目）

**结论**：Codex 的"路径即引用"正是用户要的交互（把路径交给模型让它自己读）；业界共识的 chip 形态 = 图标 + 文件名（tooltip 全路径）+ 可选行区间 + 大小/类型徽章 + 删除按钮。我们取 Codex 语义（默认只给路径）+ Cursor 的行区间扩展（V1.1）+ 小文件限量内联（下述 §4.2 的折中）。

关键出处：Codex 任意文件拖拽为长期 open 请求（[issue #3761](https://github.com/openai/codex/issues/3761)），`@filename` 是引用而非内容转储（[issue #3413](https://github.com/openai/codex/issues/3413)）；Cline 提及 [docs](https://docs.cline.bot/core-workflows/working-with-files) 与影子 git 检查点 [docs](https://docs.cline.bot/core-workflows/checkpoints)；Cursor `@` 符号与行区间（[context](https://cursor.com/help/customization/context.md)、[@Files](https://docs.cursor.ac.cn/context/@-symbols/@-files)）；Claude Code `/add` 与 `@` 客户端注入（[changelog](https://code.claude.com/docs/en/changelog)、[issue #35147](https://github.com/anthropics/claude-code/issues/35147)）；Aider `/read-only` 与 repo map（[usage](https://aider.chat/docs/usage.html)、[repo map](https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system)）。

```
拖拽一个文件到对话区
        ↓
全屏 DropOverlay：「松开以引用 3 个文件」（图片则提示"作为图片发送"）
        ↓
松开 → 输入框 draft 中出现引用 chip： 📄 src/auth.ts   （hover 显示完整路径；× 可删除）
        ↓
用户可继续打字（chip 随 draft 一起发送）
        ↓
提交时 codec 序列化：<file-ref path="C:\proj\src\auth.ts"></file-ref> + 一条系统级提示
        ↓
模型收到路径 → 用自己的 read/edit 工具读取该文件
```

规则表：

| 拖入内容 | 行为 |
|---|---|
| 图片文件（png/jpg/webp/gif） | 走官方图片附件链路 `addImages`（视觉）；不产生文件引用 chip |
| 单个/多个普通文件 | 每个文件一个引用 chip；按绝对路径引用 |
| 文件夹 | 一个"目录引用"chip（模型读取目录树）；或询问展开为文件列表（V1 取前者） |
| 工作区外的文件 | 允许引用（只读路径），chip 上加 ⚠ 标记"仅读路径，编辑需授权" |
| 超限（数量>20 或单文件>5MB 文本类） | 拒绝并提示，不静默截断 |
| 复制/粘贴往返 | clipboardText = 绝对路径（带引号），粘贴回输入框时官方 paste 匹配机制自动还原 chip（官方已实现 paste-matching！） |

补充：**`@` 触发源**与拖拽同源——输入 `@` 出现"工作区文件"候选组（按名称模糊搜索，来自 §5.2 的文件索引），键盘选中与拖拽产生同一种 chip。这样 Codex 的 `@file` 体验完整。

## 4.2 模型序列化格式（关键设计决策）

业界两派：Codex/Claude Code Read 工具 = 路径即引用；Cline/Cursor/Aider = 发送时内联内容。调研推荐的是**折中**，我们采用：

```
（结构化引用块，随该条消息附加一次；路径规范化为绝对路径，显示用工作区相对路径）
<file-refs>
  <file path="C:\proj\src\auth.ts" kind="file" size="2048" />
  <file path="C:\proj\src\views" kind="dir" />
</file-refs>
使用你的文件读取工具查看这些文件/目录的内容后再回答。
```

规则（对应调研建议逐条）：

1. **默认 = 路径 + 读取指令**（Codex 语义）：只给路径不内联内容——内容会过期、会撑爆上下文；模型已有官方 read/glob/grep 工具（`dsh-tool-fs` 系列）。
2. **小文件限量内联**（≤ 8KB 的文本文件，或用户明确选中的行区间）：内联进同一个结构化块，省一次读取往返；大文件/目录绝不递归内联。
3. **文件夹**：只给路径 + 一条"先列目录再按需读取"的指令（Aider repo-map 思想，目录树概览放 V1.1）。
4. **可编辑标记**：工作区内文件默认可编辑；工作区外文件加 `readonly="true"` + 系统提示"该文件在工作区外，只读引用"（Aider 的 /read-only 模式）。
5. 结构化标记风格与官方 skill 引用 codec（`<skill>name</skill>`）一致；纯路径解析失败时有明确报错（官方 codec 契约要求 serialize 失败必须阻断发送，不会静默降级）。

V1.1 扩展：行区间（`@file:12-40`，Cursor 式）、目录树概览、`<file>` 内容缓存失效处理。

## 4.3 技术实现（官方机制落点，全部已有 API）

| 步骤 | 官方 API |
|---|---|
| 注册 `@` 触发源 | `ctx.inputTriggers.registerSource({ trigger:'@', name:'workspace-files', candidates(), onPick(): ReferenceInsert, codec })`（`dsh-client-ui-input-trigger`） |
| codec | `ReferenceCodec.serialize(ref)` → 上节 XML；`clipboardText(ref)` → `"C:\path\file.ts"` |
| chip 渲染 | 由官方 InputMachine 自动完成（`Occurrence` → U+FFFC chip），无需自绘 |
| 拖拽监听 | 客户端插件在 conversation 区域挂 document 级 dragover/drop 监听 + 自绘 DropOverlay（参考官方 `dsh-client-ui-attachment` 的 DropOverlay/DragMask 模式，做文件版） |
| 插入 chip | 通过会话作用域事件 `slash/input-insert-reference`（span CAS）或 `SessionInput.insertReference(ref, span)`；span = 当前 caret（从 textarea selection 读取） |
| 文件搜索数据源 | Workbench 文件索引（§5.2）或桌面桥 `fs.search`（模糊匹配文件名） |
| 图片分流 | 官方 `InputActions.addImages` / `ComposerBarInjected.addImages` |
| 小文件内联 | codec.serialize 时经桌面桥 `fs.read` 读 ≤8KB 文本并内联（§4.2 规则 2） |
| 权限 | 引用只提供路径（默认不预读）；workspace 外文件打 readonly ⚠ 标记（与 P0-10 权限一致） |
| 参考先例 | 开工前先读社区先例插件（§4.1 / §2.3 列表）的集成点实现，避免踩官方 API 的暗坑（尤其 GLFzr/dsh-file-upload 的"路径插入输入框"与 HongMing-Huang/dsh-file-upload 的拖拽处理） |

**实现风险点与备选**：`slash/input-insert-reference` 需要会话作用域 carrier，若客户端插件上下文拿不到（官方 contract 是 frozen 的但 resolver 在 conversation 内部），备选方案：①模拟一次管线 pick（把拖拽结果作为一个"自动完成"的菜单候选走 `onPick` 全链路）；②fallback 到 `InputActions.setDraft` 手动插入纯文本路径（chip 退化为路径文本，V1 可接受）。实现时按 ①② 顺序验证，三者都有兜底，不会卡死。

## 4.4 验收标准

- 拖入 1-N 个文件/文件夹/图片，chip 正确、可删除、随消息发送；
- 模型最终成功调用了 read 工具并引用了所拖文件内容（端到端验证）；
- 图片拖入走视觉链路，非文件引用；
- 粘贴往返（复制 chip → 粘贴 → 恢复 chip）工作正常；
- 超限/非法类型有明确拒绝提示；
- 该功能在 Safe Mode（无第三方插件）下仍可用（它是 Core）。

---

# 5. 分模块实施计划

## 5.0 工程基建（先行，0.5 周）

1. **客户端插件构建管线**（D7）：scripts 里加 `build:plugins`——esbuild 将每个新插件的 `src/client.tsx` 打成 `lib/client.js`（格式：`window.__ModuleLoader__.load({id, factory})` handoff，inject 依赖设为 external require）；host 半 `lib/index.js` 照抄现有模式。产物随 profile 拷贝进 DSH_HOME。
2. **桌面桥扩展**：`contracts.ts` 扩展 `DshDesktopApi`（fs/git/pty/secret/dialog 通道），`ipc.ts` 加受信任发送方校验的 handler，preload 暴露。
3. **插件包注册表**：workspace 根 `plugins.json`（本地插件清单：id、版本、客户端注入依赖、桌面桥需求声明）。

## 5.1 Runtime Reliability（P0-2 补全 + P0-3 Safe Mode + P0-4 LKG）【桌面主进程，2 周】

- **Crash 检测**：supervisor 记录最近 N 次启动结果（时间窗内 crash-loop 判定：如 3 次/10 分钟）；退出码/信号分类 + logTail 关键词匹配（哪個插件 fiber 失败——结合官方 `pluginInventory/list` 的 fiberPhase 数据）。
- **Safe Mode**：`ensureDesktopProfile` 支持 `safe` 变体 profile（只含 dsh-base/dsh-web-app + 桌面 Core 插件）；splash 渲染器加三键对话框：`[安全模式启动] [禁用疑似插件并启动] [查看日志]`；禁用=在 managed profile 写入插件黑名单。
- **LKG**：健康状态记录（启动成功 + 运行 N 分钟无 fatal → 标记 good）；升级/装插件/改 profile 前快照（DSH_HOME 关键目录 + 版本信息）；失败自动回滚并提示。
- 验收：注入一个必崩插件 → 复现 crash-loop → 弹窗出现 → Safe Mode 可进入 → 正常模式恢复。

## 5.2 Coding Workbench（P0-6）【新客户端插件 + 桌面桥，3 周】

- **容器**：V0.2 用 `shell.overlay` 浮动面板（现有 diff overlay 模式）；V0.3 迁移到 `details` 右栏槽位（收编官方 DetailsPanel，Tool 详情成为其一个标签，用 `conversation.details.tool` 的 block 数据自渲染）。
- **Files 标签**：桌面桥 `fs.list/read/write/watch`；简单编辑器（CodeMirror 6，轻量集成，只读+基本编辑）；文件索引（启动后异步扫描 + 内存 trie 模糊匹配，供 @file 与拖拽用）。
- **打开文件路由（官方接缝已找到）**：官方 `host.openPath` API 支持注入式 opener（`defaults.openPath` / `defaults.openTextFile`，api-proxy 内）；桌面宿主插件注入自定义 opener，把"点击工具行文件路径"从系统默认打开重定向到 Workbench Files 标签（经现有 downlink/桌面桥通知客户端）。零 hack、纯官方接口。
- **Diff 标签**：复用 §5.3 Change Set 数据；git diff / 工作区 diff 视图。
- **Terminal 标签**：桌面主进程 `node-pty`（已随包并 smoke 通过）+ xterm.js 前端；每工作区一个会话、cwd 跟随当前工作区；P1 再关联官方 `dsh-terminal` 会话（用户接管 Agent 的终端）。
- **Git 标签**：桌面桥调系统 git：status / diff / stage / unstage / commit / push / pull / 分支切换；配合 §5.3 的评论→Agent。
- **Browser 标签**：P1（iframe + 代理限制复杂，V1 先用系统浏览器外开）。
- 验收：打开项目 → 四个核心操作流（浏览/编辑文件、查看 Agent 改动、跑命令、提交）全程不离开窗口。

## 5.3 Change Set / Diff Review / Checkpoint（P0-8/9）【客户端插件采集 + 桌面数据层，3 周】

- **数据模型**：`turn → changeSet{files[] → hunks[]}`，采集点沿用现有 `tool.call.toolview`（edit/write 的 resultView card 'diff' 已带 old/new text，官方 `dsh-tool-fs/diff` 也有结构化 diff）。功能参考：社区 `dsh-review` / `dsh-file-review` / `dsh-file-review-tab` / `rich-file-review`（PRD 所引 dsh-plugin-diff-review 的现存对应物，仍按 PRD 结论自建为 Core）。
- **桌面数据层**：`changesets.json`（DSH_HOME 或 userData 下）；每回合结束时聚合（turnTail 链 `conversation.chat.turnTail` 槽位可挂"回合结束"钩子）。
- **UI 升级**（现有 DiffOverlay 增强）：文件级 Diff、hunk 级 Accept/Reject（桌面桥写回文件）、Revert（git checkout 单文件）、行评论、评论→Agent（通过 inputActions 注入消息或官方 command 管线）、Stage/Commit 快捷。
- **Checkpoint**：每个 user turn 前自动 `git snapshot`（无 git 时用文件内容快照存储，去重压缩）；"Undo Agent Changes"= 恢复到所选 checkpoint；快照保留策略（最近 50 个 + 空间上限）。
- 验收：完整闭环 = 用户评论 → Agent 修改 → 新 diff 出现 → 接受部分 hunk → commit；Undo 一键还原到回合前状态。

## 5.4 Permission Mode（P0-10）【接线为主，0.5 周】

- 官方 presets 已支持 `/permission <preset>` 与 UI chip。做：Safe/Smart/Full 三预设定义映射进 desktop profile 默认值（Smart 为默认）；首启引导文案；工作区外写入/删除/推送的"Ask"策略复核。
- 验收：三档切换即时生效；危险操作（delete/push/secret）在 Smart 下必问。

## 5.5 Vision On Demand（P0-11）【1.5-2 周】

生态调研结论：**ModLens（liustack/modlens，npm `@liustack/modlens`）活跃，形态是 CLI + skill（非 bundle 插件）**；Windows 一键 EXE 安装器（捆绑智谱 GLM-4V-Flash 免费视觉引擎）是第三方项目 JR-JR07/dsh-modlens-installer——正是 PRD 设想的"有免费额度的视觉 Provider"。另有 SIMON-WORLD/dsh-toolkit 也带视觉桥（§2.3）。

- **V1 路线（与 PRD 一致：优先 ModLens）**：ModLens 作为视觉引擎（图 → OCR/布局/语义证据 JSON → DeepSeek），桌面负责：
  1. 一键安装/配置向导（检测未配置 → 弹向导 → 安装 ModLens CLI（或引导第三方 EXE 安装器）→ 配置 GLM-4V-Flash 免费引擎 → 验证可用）；**开工前先读 ModLens 的 INSTALL.md 确认 CLI+skill 的准确接入方式**（§2.3 安装模式分类第 3 类）；
  2. Provider Registry（§5.8）提供"免费额度"推荐（GLM-4V-Flash 免费）与定价信息（D8：不硬编码）；
  3. 与官方图片附件链路对接（用户贴图/拖图 → 附件存储 → ModLens 处理 → 证据注入 DeepSeek 上下文）。
- **备选路线 A（ModLens 与 rc.7 不兼容时）**：自建轻量"视觉证据管线"host 插件（OpenAI 兼容视觉 API / 本地 Ollama），编排思路照抄 ModLens，但作为产品 Core 维护——规避第三方兼容风险，代价是失去现成实现。
- 验收：首次贴图 → 向导 ≤3 步 → Agent 正确理解截图内容（端到端）；免费额度变更不需要重新发版（注册表远端更新）。

## 5.6 Provider Manager（P0-12）【0.5-1 周】

- 官方 `dsh-client-ui-settings-models` 已有模型选择页；新增"Provider"向导页（settings.section 槽位）：主模型 DeepSeek / 视觉 / 快速任务，各配 Provider 类型（OpenAI 兼容、自定义 baseURL、Ollama、LM Studio、本地 vLLM）。
- API Key 写入 Windows Credential Manager（§5.7），harness env 注入由 supervisor 完成；连接测试按钮（一次最小请求）。
- 验收：新电脑从零到可对话 ≤3 分钟（PRD §26 指标）。

## 5.7 Secret（§13）【0.5 周】

- 桌面桥 `secret.get/set/delete` → Windows Credential Manager（P1 用 keytar，V1 可先用 Electron `safeStorage` + 系统级凭据文件过渡，写清楚取舍）；supervisor spawn 时把需要的 Key 注入子进程 env；插件默认不可读全部 Key（P1 做作用域分发）。
- 验收：Key 不出现在任何配置文件/日志中；更换 Key 后重启即生效。

## 5.8 Cost / Context 可视化（§14）【1 周】

- 数据：官方 `sessionStats` + `tokenUsage` + `contextPressure` 投影（回合/步数/耗时/token/上下文占用率已全）。
- 新增：货币成本 = 用量 × Provider Registry 价格（D8）；预算上限设置（达 80%/100% 提示/暂停）；展示：增强官方 `conversation.composer.dock` 统计行 + 桌面窗口底部状态栏（PRD §14 样式）。
- 验收：长会话中随时可看到 Context %、token、$ 成本；超预算有明确提示。

## 5.9 Plugin Manager + Compatibility（§9-12）【2.5 周】

- **compatibility.json 扩展**：`plugins: {id: {tested, windows, macos, permissions, native, installMode}}` + `providers`；`installMode` 按 §2.3 的三类安装模式（bundle-entry / loader+patch / CLI+skill）记录，交易式安装按模式走不同管线；仓库侧维护 + 远端更新（D8）。数据源可借力：社区市场 2BingLing/dsh-market（1500+ 插件）、dsh-market/dsh-market、awesome 索引库、以及 **AdamPlatin123/awesome-dsh-plugins 的每日兼容性跟踪**（事实上的兼容台账，重点监控）——**数据可以借用，安装必须走自己的兼容+安全+健康链路**（PRD §18 原则）。
- **交易式安装**：Snapshot → Download → Validate（manifest/peer/DSH 版本/native）→ Install → Smoke Test → Enable → Health Check → Commit；任一步失败回滚（§11 流程 1:1 实现）。
- **Plugin Doctor 进桌面**：清单检查 + 依赖检查 + 版本检查 + 原生依赖检查 + 权限检查 + smoke；校验项参考 lin-cheng-lab/dsh-plugin-doctor（已获官方 Discussion #2801 关注）；结果渲染为 PRD 里的 ✓/⚠ 徽章列表。
- **UI**：官方 settings-plugins + plugin-inventory 已有页面，增强：健康徽章（用 `pluginInventory/list` fiberPhase + doctor 结果）、Recommended/Community 分级、权限展示、一键禁用/回滚。
- **崩溃隔离**：官方 slot 入口崩溃已自动 abdicate（`reportEntryError`）——桌面订阅 `onEntryError` 显示"某某插件 UI 已隔离"提示；进程级崩溃靠 §5.1 crash-loop 检测。
- 验收：装一个坏插件 → 回滚 → 环境无损；装一个 Recommended 插件 → 全绿徽章 → 可用。

## 5.10 Agent Activity（P0-7）与 Projects/Sessions（P0-5）打磨【各 0.5 周】

- Activity：tool 名→中文动词映射表 + 状态图标，做成回合摘要条（复用现有 toolview 数据 + trajectory 视图），点击展开 Raw tool call（官方已有 Inspect）。
- Projects/Sessions：官方浏览器已有；加固定项目、最近项目、项目颜色/图标。
- Capability-on-Demand（§8）：能力触发检测（贴图→§5.5 向导；拖文件→§4；/search 命令→推荐搜索插件；/memory→提示）——一个小型"能力提示器"客户端插件，1 周。

## 5.11 打包与发布【0.5-1 周】

- 管线扩展：`build:plugins` 纳入 pack/dist；CI 兼容矩阵（DSH rc 版本 × 精选插件 × Windows/macOS：install/enable/disable/upgrade/rollback/smoke，PRD §26 验收）；canary 发布通道（oh-my-dsh 模式）；安装包签名。

---

# 6. 迭代排期

对应 PRD §27 Roadmap（V0.1 Runtime 已完成），修订为：

| 迭代 | 内容 | 关键验收 | 工期 |
|---|---|---|---|
| **V0.2 Workbench + 引用** | §5.0 基建；§5.1 Safe/LKG；§5.2 Workbench MVP（浮动面板 Files/Git/Terminal）；**§4 拖拽文件引用**；§5.10 Activity 摘要 | 拖文件→模型读文件闭环；Safe Mode 可进；Files/Git/Terminal 可用 | 4-5 周 |
| **V0.3 Coding Safety** | §5.3 Change Set/Checkpoint；§5.4 权限三档；§5.8 Cost/Context | 评论→修改→hunk 接受→commit；Undo 一键回滚 | 3 周 |
| **V0.4 Capability** | §5.5 Vision 向导；§5.6 Provider 向导；§5.7 Secret；§5.9 插件管理/兼容/doctor；Workbench 右栏化 | 贴图≤3 步可用；坏插件回滚无损；Recommended 全绿 | 3-4 周 |
| **V0.5 Advanced**（PRD 原 V0.5，P1） | 项目记忆/远程/多 Agent/浏览器自动化/SSH/Docker/DB；macOS 适配；MinGit 捆绑评估 | — | 后续 |

合计 V0.2-V0.4 ≈ **10-12 周**（1-2 人）。拖拽文件引用在 V0.2 内约 3-5 人日（基建完成后）。

---

# 7. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| **PowerShell/子进程 `0xC0000142`**（PRD §4.2 记载） | 高→已修复 | ✅ **根因已精确定位（实测）**：① 不是权限拒绝——workspace-write 授权本身生效，崩溃发生在沙箱机制内部；② 官方 ACL runner 在**纯 Node** 下运行 pwsh 7 完全正常；③ 同一 runner 在 **Electron node 模式**下（桌面版宿主形态）必然崩溃 0xC0000142 → **官方代码 bug、仅 Electron 嵌入场景触发**。**修复已实施（方案 B，官方代码零修改）**：新插件 `@wrddgg/dsh-desktop-pwsh`（`DesktopPwshExecutor extends` 官方 `SandboxPwshExecutor`）——Electron 宿主下绕开 ACL runner 包装走本地执行路径（`sandbox.confine` 完全不调用），非 Electron 下与官方行为 1:1；profile 受管 patch 禁用官方 `pwsh-sandbox` 条目（唯一 `ctx.shell` 提供者）。**模式恢复为 workspace-write**：文件级沙箱（进程内，不走 runner）与 ask 审批全部保留，仅 pwsh 子进程豁免。验证：`scripts/smoke-pwsh.mjs`（Electron 下真实执行 pwsh + confine 零调用断言）+ harness 冒烟三种 profile 全过。后续：可向官方提 issue（附三组复现步骤） |
| rc 升级 breaking changes | 高 | D2 锁定 + canary + CI 兼容矩阵 + 升级时 slot/SlotMap diff 检测脚本 |
| 官方 SlotMap / client plugin 接口在 rc.7 是 Developer Preview | 高 | 全部扩展走官方注册 API + 唯一 id/priority；升级前用类型快照做编译期差异报告；Safe Mode 兜底 |
| `details` 槽位收编官方 DetailsPanel 的兼容风险（D4） | 中 | V0.2 先浮动面板过渡；V0.3 迁移时保留 tool 详情标签自渲染；必要时退回 overlay 方案 |
| 拖拽插入 chip 的 carrier 不可得（§4.3） | 中 | 已备三条实现路径（事件/模拟 pick/setDraft 退化），不会阻塞 |
| node-pty Windows 原生构建 | 中 | 已捆绑预编译 + smoke-runtime 已有 PTY 冒烟；升级时重跑 |
| 系统未装 git | 中 | 引导安装（打开下载页）+ P2 MinGit 捆绑 |
| 拖拽大文件/大量文件撑爆上下文 | 低 | 数量/大小上限 + 只传路径不内联内容（§4.2） |
| 社区插件（ModLens 等）rc.7 不兼容 | 中 | 兼容注册表先验证再推荐；Vision 路线 A 可完全不依赖第三方 |

---

# 8. 下一步行动（立即开工清单）

按依赖排序：

0. 【数据校准，半天】GitHub API 脚本化核对 §2.3 约 20 个仓库的 `stargazers_count`/`pushed_at`/rc.7 兼容说明，输出 `compatibility.json` 的初版数据；读 ModLens INSTALL.md 与 3-4 个文件拖拽先例的源码（集成点取证）。
1. 【基建】客户端插件构建管线（`build:plugins`）+ `plugins.json` 注册表（0.5 周）——所有后续功能的地基。
2. 【基建】桌面桥扩展契约（fs/git/pty/secret/dialog）骨架 + 受信任校验（与 1 并行）。
3. 【用户点名功能】拖拽文件引用插件：@file 源 + 拖拽 DropOverlay + chip 插入 + codec（3-5 人日）——官方机制齐全，风险最低、见效最快，可作为第一个端到端 Demo。
4. 【可靠性】Safe Mode / crash-loop / LKG（2 周）——PRD 最重要的差异化之一。
5. 【核心体验】Workbench 骨架（浮动面板 + Files + Git + Terminal）+ Change Set 数据层。
6. 其余按 §6 排期推进。

---

# 附：本调研产出物

- `DSH-Desktop 实施规划.md`（本文档）
- 工作区代码盘点结论（§2.1）
- 官方 rc.7 扩展面考古结论（§1 发现清单 + §3 决策依据；关键接缝：Slot 体系 / input-trigger reference 管线 / host.openPath 可注入 opener / plugin inventory / token-meter / permission presets / terminal PTY 注册表 / 附件图片链路 / typert RPC / client-modules 加载协议）
- 生态调研报告（§2.3：ModLens、DSH-better-sidebar、dsh-plugin-doctor、dsh-review 系列、社区 Plugin Market、desktop wrappers、rc.7=最新版、5 个文件拖拽先例）
- 拖拽文件引用交互调研（§4.1：Codex/Cline/Cursor/Claude Code/Aider 机制对比 + 序列化共识 + chip 形态标准）

> 调研口径说明：社区项目的星数/最新提交时间等数字为调研时点快照，个别未能二次核实（表中 ✱ 标记）；开工前对将直接集成的对象（ModLens、doctor、文件拖拽先例源码）做一次 GitHub API 精确核对即可。

---

# 9. 实施进度记录

## V0.2 首轮（已提交 git）✅

- **工程基建**：`scripts/build-plugins.mjs`（esbuild 客户端插件构建管线，由 `plugins.json` 注册表驱动）；`plugins.json`。
- **桌面桥**：`src/main/bridge-{fs,dialog,secret,git}.ts` + IPC/preload 扩展（`window.dshDesktop.fs/dialog/secret/git/getPathForFile`），全部走既有 trustedSender 校验。
- **拖拽文件引用**：新插件 `packages/dsh-desktop-file-ref`（`@wrddgg/dsh-desktop-file-ref`）——`@` 触发源 workspace-files + 拖拽 DropOverlay（capture 监听 + 图片合成重派发给官方视觉链路）+ chip 插入（`ctx.sessions.scope` → `slash/input-insert-reference`）+ codec（路径引用 / ≤8KB 内联 / 目录/只读/二进制标记）+ 回形针原生文件选择器。
- **Profile 多插件**：`ensureDesktopProfile` 支持双插件 bundles + 拷贝。
- **0xC0000142 修复**：supervisor 注入 `DSH_PERMISSION_MODE=danger-full-access`（见 §7 风险表）。
- **验证**：typecheck ✓ / 35 测试 ✓ / 无头 harness 冒烟 ✓（`scripts/smoke-harness.mjs`：真实 profile + 双插件组合 + file-ref 客户端 bundle 端点可达）。
- **打包**：本地 NSIS 安装包 `release/DSH-Desktop-Setup-1.1.0-x64.exe` 构建完成（`--publish never`，未上传任何 release）；打包后运行时审计 528 包/2304 边 ✓、node-pty 冒烟 ✓、双插件资源已核对入包。**待用户安装测试**。

## V0.2 第二轮（本轮）✅

- **Safe Mode / crash-loop / LKG（P0-2 补全 + P0-3 + P0-4）**：`src/main/boot-state.ts`（启动记录持久化、时间窗 crash-loop 判定、插件黑名单、LKG 时间戳）；supervisor 区分 normal/safe 模式启动、健康窗口（60s）标记 LKG 并快照 profile、疑似插件启发式（scoped + 裸名 dsh-* 双正则）；splash 增加恢复对话框（安全模式启动 / 禁用插件并启动 / 恢复上次已知良好 / 查看日志）；`profile.ts` 支持 safe 变体 profile（`dsh-desktop-app-safe`）与插件黑名单过滤、profile 快照/恢复。
- **pty 桥（②补全）**：`src/main/bridge-pty.ts`——复用打包内 node-pty（零原生依赖进桌面包），会话管理 + data/exit 事件推送到页面。
- **验证**：typecheck ✓ / 48 测试 ✓（boot-state 8 + pty 3 + 既有）/ 无头 harness 冒烟 ✓。
- **打包**：`release/DSH-Desktop-Setup-1.2.0-x64.exe`（本地构建，未上传）。

## V0.2 第三轮（本轮）✅

- **Workbench 骨架（P0-6，⑤）**：新插件 `packages/dsh-desktop-workbench`（`@wrddgg/dsh-desktop-workbench`）——`shell.overlay` 浮动面板（可调宽、三标签、底部工作区指示）+ 触发入口（composer 工具行 + 侧栏底部）；**Files 标签**（目录树懒加载、面包屑、512KB 预览、原生选择文件夹）；**Git 标签**（分支/状态列表/暂存/取消暂存/差异/提交，走 git 桥）；**终端标签**（pty 桥会话：启动/关闭/输入执行/输出流，ANSI 剥离，xterm 留待 P1）；面板状态跨触发点共享（模块级 store）。
- **构建管线修正**：`build-plugins.mjs` 设 `charset: 'utf8'`（产物中文可读、断言稳定）。
- **验证**：typecheck ✓ / **56 测试全绿** / 无头冒烟三种模式全过（normal 双 bundle 服务 ✓、safe ✓、disabled 黑名单缺席 ✓）。
- **打包**：`release/DSH-Desktop-Setup-1.3.0-x64.exe`（本地构建，未上传）。

## V0.2 第四轮（本轮）✅

- **0xC0000142 方案 B 落地（官方代码零修改）**：新插件 `packages/dsh-desktop-pwsh`（`@wrddgg/dsh-desktop-pwsh`，默认内置）——`DesktopPwshExecutor extends` 官方 `SandboxPwshExecutor`；Electron 宿主下 `run/start` 走本地执行路径（`sandbox.confine` 零调用），非 Electron 与官方 1:1；profile 受管 `cordis.patch.yml` 禁用官方 `pwsh-sandbox`（黑名单该插件时自动保留官方条目）；`DSH_PERMISSION_MODE` 恢复 **workspace-write**（文件沙箱 + ask 审批全保留）。踩坑记录：`dsh-permission-presets` 强制要求 `ctx.shell.sandboxMode` 存在（"no sandboxMode 是配置错误"），故 Electron 下保留策略模式可见、仅绕 runner。
- **验证**：typecheck ✓ / 63 测试全绿（新增 pwsh 插件 5 项 + profile 黑名单回退用例）/ `scripts/smoke-pwsh.mjs`（Electron 真实执行 pwsh + confine 零调用 + 策略模式可见）✓ / harness 冒烟三种 profile（workspace-write 模式）全过 ✓。
- **打包**：`release/DSH-Desktop-Setup-1.4.0-x64.exe`（本地构建，未上传）。

## 发布记录（⚠️ 已按用户要求全部撤回，版本重置为 1.0.0）

- **v1.4.0 / v1.5.0 曾发布 GitHub Releases（应用内更新可看到）**，用户指出"最基础功能尚未验证完就迭代版本"后，**已删除全部 release 与 tag（v1.4.0/v1.5.0），版本号重置为 1.0.0**，更新通道停用，直到基础功能完整验证通过前不再发布新版本。
- 发布踩坑记录（保留备查）：PowerShell 字符串插值 `"$base?name=…"` 会把 `?` 并入变量名（须 `${base}?name=…`）；本机到 github.com 网络持续抖动，上传/校验需多次重试。
- 待办：向官方提交 upstream issue（`upstream-issue-pwsh-acl-electron.md` 已起草）。

## V0.2 第六轮（本轮）✅ — 用户反馈四问题修复

1. **复制按钮失效（问题 3）**：根因 = Electron 权限处理器全拒导致 `navigator.clipboard.writeText` 静默失败；`window.ts` 放行 `clipboard-sanitized-write`。
2. **模型多模态勾选（问题 1）**：根因 = OpenAI 兼容 adapter（含 DeepSeek）对任意模型硬编码 `inputModalities: ["text"]`（`MODEL_DOES_NOT_SUPPORT_IMAGES` 拒绝链）。方案：宿主插件 `@wrddgg/dsh-desktop-model-cap`——settings 命名空间 `desktop-model-capabilities`（用户勾选表）+ 包装每个 provider adapter（`Object.create` 继承原型，仅覆盖 listModels/resolveModel，未命中完全委托）+ 设置页「模型能力」。
3. **Vision On Demand（问题 2）**：宿主侧 `desktop_vision` 工具（读图 → 用户配置的 OpenAI 兼容视觉 API → 文本描述，配置存 `desktop-vision` 命名空间）+ 系统提示 section；客户端 `@wrddgg/dsh-desktop-vision`——拖图分流（`session.models` 取当前模型 + localStorage 能力表镜像，未声明默认按纯文本）：多模态 → 官方图片链路；纯文本且已配置视觉 → 转文件引用 chip（模型经 desktop_vision 看图）；未配置 → 弹「需要视觉能力」向导。
4. **双击编辑重发（问题 4）**：`@wrddgg/dsh-desktop-message-edit` 替换 `conversation.chat.node` 的 user 节点（priority -1，崩溃自动 abdicate 回退官方）——双击进入编辑态，Ctrl/⌘+Enter 或按钮保存 → `inputActions.setDraft + submit` 重发。
- 工程：profile 纳入 3 个新插件（共 9 个 bundle）；`check` 顺序修正（build 先于 test）；冒烟扩展为 4 个客户端 bundle + 全插件组合失败扫描。
- 踩坑记录：宿主插件必须是**纯 JS**（ESM 直载，TS 注解直接语法错误）；settings 命名空间须小写连字符；Cordis 4 强制 `inject` 声明；`defineTool` 强制 `output:{schema,render}`。
- 验证：typecheck ✓ / 65 测试全绿 / harness 冒烟三种 profile（4 bundle + 组合扫描）✓ / pwsh 冒烟 ✓。
- 打包：`release/DSH-Desktop-Setup-1.5.0-x64.exe`（本地构建，未上传，等测试）。
