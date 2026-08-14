# dsh-bio-workbench

面向生信分析的可复现 DSH 工作台插件。目标形态：Jupyter 的 cell/内联图组织 + Claude Science 的 agent 驱动 + Nextflow/nf-core 级的 provenance。

> **核心承诺**：每张图、每个分析产物都可溯源、可重放 —— 回答"它 = 哪段代码 + 哪些输入 + 什么环境 + 什么参数/种子"，并一键重跑。

## 能力

- **代码出图 → 反馈 → 重画**：agent 跑自包含 cell 出图，图内联显示；结构化反馈挂到图上，`bio_rerun_cell` 生成派生版本（v1 → v2 → v3）。
- **文件/产物管理**：每个项目一个目录 + 明文 `manifest.json` 账本（cells + artifacts + provenance + 反馈）。
- **可复现**：自包含脚本 + 全新子进程 + `environment.lock` + SHA-256 输入/输出哈希 + 固定 seed。
- **git 版本化**：项目自动 `git init`，每步自动本地 commit（不 push）。
- **跨平台**：Host 的 shell 层按平台切换命令方言 —— macOS/Linux 用 bash（`shasum`/`mkdir -p`/`mv`/`open`），Windows 用 PowerShell（`Get-FileHash`/`New-Item`/`Move-Item`/`explorer.exe`），Python 解释器在 Windows 上自动用 `python`（POSIX 用 `python3`）。

## 安装 / 使用（原型阶段）

本仓库当前是**动态 Cordis 插件原型**（进程内临时运行），Host/Client 源码即 `host/index.js` 与 `client/index.js`。配套 skill 见 `skills/bio-workbench/SKILL.md`。

流程：

1. `bio_init_project` 建项目；
2. `bio_run_cell` 跑分析出图（图写进 `figures/`）；
3. 用户看内联图 → 反馈 → `bio_add_feedback` 记录 → `bio_rerun_cell` 带编辑重画；
4. "分析工作台" tab 看三面板（notebook / 产物 / 反馈迭代）。

## 目录结构

```
host/    Host 半：执行 / manifest 记账 / 工具 / RPC
client/  Client 半：图内联卡片 + 三面板工作台 tab
skills/  持久约定 skill
docs/    设计文档
examples/ 示例分析项目
```

## Phase 2：静态插件包 + 组合挂载（进行中）

目标：把动态原型变成可 `npm install` 的静态双面包，随 profile bundle 挂载、随 agent preset 暴露 `bio_*` 工具，重启后依然存在。已就位：

### 已完成：静态 Host（工具永久化）

`lib/index.js` 是**纯 JS 静态 Host**（无 Client RPC）：把 `harness.defineTool/registerTool` 换成
`@deepseek-ai/dsh-tools` 的 `defineTool` + `ctx.tools.register`，注册 8 个 `bio_*` 工具，逻辑与动态原型
1:1。根目录 `index.js` 是入口再导出（profile 的 out-of-tree 解析按 `index.js` 找包）。

挂载方式：把仓库 symlink 到 profile 的 node_modules 兜底层，再在 agent preset `bio-workbench` 里加一行
`name: 'dsh-bio-workbench'`。已用 `standingKeyFor` 校验 **mounted OK**。

```bash
ln -sfn /path/to/dsh-bio-workbench "$HOME/.dsh/profiles/node_modules/dsh-bio-workbench"
```

重启 DSH 后，用 **Bio Workbench** 预设开新会话即可永久使用 `bio_*` 工具。

### 剩余（可选）：浏览器工作台 UI 的静态化

`src/index.ts`（`@Remote` 服务）+ `src/client.ts`（`ctx.remote` UI）是把「分析工作台」标签页也永久化的
完整双面包，需要 Harness monorepo 的 tsdown + typert 生成器构建（步骤见 `BUILD.md`）。在此之前，
浏览器 UI 继续由动态插件 `biowb-1`（`pkg-18`）提供。

## License

MIT
