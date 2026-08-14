# dsh-bio-workbench

面向生信分析的可复现 DSH 工作台插件。目标形态：Jupyter 的 cell/内联图组织 + Claude Science 的 agent 驱动 + Nextflow/nf-core 级的 provenance。

> **核心承诺**：每张图、每个分析产物都可溯源、可重放 —— 回答"它 = 哪段代码 + 哪些输入 + 什么环境 + 什么参数/种子"，并一键重跑。

## 能力

- **代码出图 → 反馈 → 重画**：agent 跑自包含 cell 出图，图内联显示；结构化反馈挂到图上，`bio_rerun_cell` 生成派生版本（v1 → v2 → v3）。
- **文件/产物管理**：每个项目一个目录 + 明文 `manifest.json` 账本（cells + artifacts + provenance + 反馈）。
- **可复现**：自包含脚本 + 全新子进程 + `environment.lock` + SHA-256 输入/输出哈希 + 固定 seed。
- **git 版本化**：项目自动 `git init`，每步自动本地 commit（不 push）。

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

## License

MIT
