# dsh-bio-workbench

面向生信分析的可复现 DSH 工作台插件。目标形态：Jupyter 的 cell/内联图组织 + Claude Science 的 agent 驱动 + Nextflow/nf-core 级的 provenance。

> **核心承诺**：每张图、每个分析产物都可溯源、可重放 —— 回答"它 = 哪段代码 + 哪些输入 + 什么环境 + 什么参数/种子"，并一键重跑。

## 能力

- **代码出图 → 反馈 → 重画**：agent 跑自包含 cell 出图，图内联显示；结构化反馈挂到图上，`bio_rerun_cell` 生成派生版本（v1 → v2 → v3）。
- **文件/产物管理**：每个项目一个目录 + 明文 `manifest.json` 账本（cells + artifacts + provenance + 反馈）。
- **可复现**：自包含脚本 + 全新子进程 + `environment.lock` + SHA-256 输入/输出哈希 + 固定 seed。
- **git 版本化**：项目自动 `git init`，每步自动本地 commit（不 push）。
- **跨平台**：Host 的 shell 层按平台切换命令方言 —— macOS/Linux 用 bash（`shasum`/`mkdir -p`/`mv`/`open`），Windows 用 PowerShell（`Get-FileHash`/`New-Item`/`Move-Item`/`explorer.exe`），Python 解释器在 Windows 上自动用 `python`（POSIX 用 `python3`）。

## 工具

8 个 agent 工具：`bio_init_project` / `bio_run_cell` / `bio_rerun_cell` / `bio_add_feedback` / `bio_get_project` / `bio_list_projects` / `bio_set_projects_dir` / `bio_delete_cell`。配套「分析工作台」网页标签页（内联图 + 反馈 + 溯源 + 删除 cell）。

## 安装

这是一个 **DSH 双面包**（Host + Client）。装成 profile bundle 后，工具全局可用、工作台标签页全局出现、并在「设置 → 插件」里可见。

```bash
# 1. 把本仓库软链到 profile 的 node_modules 兜底层
ln -sfn /path/to/dsh-bio-workbench "$HOME/.dsh/profiles/node_modules/dsh-bio-workbench"

# 2. 在 profile 的 package.json 的 dsh.profile.bundles 里加入 "dsh-bio-workbench"
#    （$HOME/.dsh/profiles/<profile>/package.json）

# 3. 重启 dsh web
```

重启后开任意新会话即可：`bio_*` 工具在工具列表里，「分析工作台」标签页在对话页，插件在设置里可见。

## 目录结构

```
lib/index.js         Host 半：执行 / manifest 记账 / 工具 / HTTP 数据接口
lib/client.js        Client 半：工作台标签页（浏览器 bundle，经 /biowb/* 取数）
index.js             入口再导出（profile out-of-tree 解析兜底）
cordis.patch.yml     bundle 补丁（插入 dsh-bio-workbench 行）
skills/              约定 skill
docs/                设计文档
examples/            示例分析项目
```

## 数据流

- Host 是单一事实来源：项目数据、manifest、provenance 都在磁盘（`~/bio-projects/<name>/`）。
- Client 是纯投影：浏览器经同源 `fetch('/biowb/<method>')` 读写，Host 用 `webServer` 服务这些路由（不依赖 typert Remote 桥，因此不需要 Harness monorepo 构建）。

## License

MIT
