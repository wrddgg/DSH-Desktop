# DSH Desktop

DSH Desktop 是官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Windows 桌面层。它不分叉 Agent Loop，也不复制官方 Web UI；应用负责启动和监管固定版本的 DSH，并通过官方 Bundle / Client Plugin API 增加原生更新入口。

## 当前版本

- Desktop：`1.0.0`（本地基准构建，暂未发布）
- DeepSeek Harness：`0.1.0-rc.7`
- Windows：x64
- 更新通道：GitHub Releases / stable

版本兼容关系记录在 [`compatibility.json`](./compatibility.json)。Desktop、DSH 和 Desktop 插件作为一个发布单元升级。

安装版会在启动 10 秒后检查一次更新，并在运行期间每 4 小时复查。检测到新版本后会显示 Windows 通知、左侧栏底部的 Codex 风格百分比和设置页入口；用户点击一次“下载并自动安装”后，界面展示真实下载进度，下载完成会校验更新、静默安装并自动重新打开。代码修改工具增加“查看更改”入口，右侧面板复用官方 DiffBlock，支持切换修改记录、关闭和拖动调整宽度。Windows 文件夹选择器的官方 rc.7 IPC 兼容问题也在打包阶段自动修复。

> rc.7 的 `@deepseek-ai/dsh-web-frontend` 发布清单误引用了尚未发布的 `@deepseek-ai/dsh-client-web@^0.1.0-rc.7`。本项目用同版本的本地占位清单满足这项纯构建期依赖；运行时使用 rc.7 包内已经构建好的 Web 静态产物，若占位包被意外执行会立即失败并暴露问题。

## 本地开发

需要 Node.js 24 和 Windows 10/11。

```powershell
npm install
npm run dev
```

首次启动会在 `%APPDATA%/dsh-desktop/harness` 建立独立的 DSH Home 和受管理的 `dsh-desktop-app` profile。这样不会覆盖或继承旧 Desktop、CLI 或 `~/.dsh` 中可能不兼容的 Home 级补丁。默认工作目录是用户的“文档”目录，会话、模型设置和凭据仍由官方 DSH 的存储插件管理。

## 检查与打包

```powershell
npm run check
npm run dist
```

打包流程会生成独立的 DSH 运行时，检查全部必需依赖关系，并用最终产物实际加载原生终端模块。任一检查失败都不会产出可发布版本。安装包生成到 `release/DSH-Desktop-Setup-<version>-x64.exe`。

## 安全边界

- DSH 只绑定本机回环地址和系统分配的随机端口。
- Renderer 不启用 Node.js，使用 context isolation 与 sandbox。
- preload 只暴露固定、无任意路径参数的 Desktop 方法。
- 窗口只加载当前 DSH 回环 origin；外部 HTTPS 链接交给系统浏览器。
- 更新由 Electron 主进程拥有，DSH 页面只能读取状态和触发固定动作。

## 发布

`package.json` 已配置 `wrddgg/DSH-Desktop` GitHub Releases 更新源。推送 `v*` 标签后，GitHub Actions 会在 Windows 上重新检查、打包并发布安装包、blockmap 和 `latest.yml`，桌面端“更新”页会读取该稳定通道。

本地构建没有代码签名，Windows SmartScreen 可能在首次运行时提示“未知发布者”。正式公开发布前应配置 Windows 代码签名证书，并恢复更新包签名校验。
