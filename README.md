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

- `package.json` 声明了 `dsh.bundle.patch`（→ `cordis.patch.yml`）与 `dsh.client`（`platform: web`）+ `exports["./client"]`，对齐 Harness 双面包约定；
- `cordis.patch.yml` 是 bundle 补丁，插入 `dsh-bio-workbench` 这一行（安装后由 Loader 按包名解析）。

剩余步骤（依赖 Harness monorepo 构建链 / npm 发布，需在外部环境执行）：

1. **静态 ESM 入口**：把 `host/index.js` 的 `harness.defineTool/registerTool` 换成 `@deepseek-ai/dsh-tools` 的 `defineTool` + `ctx.tools.register`，把 `harness.handle`（动态专属的 Client RPC 桥）换成 `@Remote` + typert 生成的远程服务（`ctx.remote.<svc>.<method>`）。
2. **Client 半构建**：`exports["./client"]` 指向的 `lib/client.js` 需由 Harness web 构建管线产出 `window.__ModuleLoader__.load(...)` 形式的浏览器 bundle。
3. **安装挂载**：`npm publish`（或 `dsh plugin` 以本地路径/pnpm 安装）到 profile，随后 `standingKeyFor` 校验组合，再开真实会话确认 `bio_*` 工具清单。

在此之前，动态插件（`biowb-1`，当前 `pkg-18`）是运行中的实现；上述只是把它永久化的收尾。

## License

MIT
