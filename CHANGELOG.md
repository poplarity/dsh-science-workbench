# Changelog

## 0.2.0

- 工作台：⚙ 按钮改为打开**系统原生目录选择器**（`ctx.workspaces.pickDirectory()`）直接跳转设置项目目录。
- 工作台：支持**标记 cell 为「成品」** —— 新增 `bio_mark_cell` 工具 + UI「标记成品/取消成品」按钮 + 步骤列表与详情中的「成品」徽标。
- 工作台：支持**检索 cell** —— 步骤列表顶部搜索框，按 id / 标题 / 状态过滤。
- 工作台：无项目时显示**第一步引导「设置工作目录」**。
- 内置两个**出版级出图 skill**（改编自 Claude Science，Apache-2.0）：`figure-style`（图形规范 + `apply_figure_style()`）+ `figure-composer`（多面板组合图 + 对抗式自审循环），见 `ATTRIBUTIONS.md`。

## 0.1.1

- 修复：`bio_set_projects_dir` 在 Windows 上拒绝盘符路径（`C:\...` / `C:/...`）的问题——现在同时接受 `/` 开头与盘符开头的绝对路径，并正确剥离尾部 `/` 或 `\` 分隔符。

## 0.1.0

首个发布版：可复现生信工作台插件 `dsh-science-workbench`。

- 8 个 `bio_*` 工具：`bio_init_project` / `bio_run_cell` / `bio_rerun_cell` / `bio_add_feedback` / `bio_get_project` / `bio_list_projects` / `bio_set_projects_dir` / `bio_delete_cell`
- 「分析工作台」网页标签页 + 内联图预览（png/jpg/webp/gif/svg/pdf/tif/bmp）
- 项目布局 + 明文 `manifest.json` 账本 + cell 头契约 + `environment.lock` + SHA-256 输入/输出哈希 provenance
- 反馈 → 重画派生链路（v1 → v2 → v3）+ 每步自动 git commit
- 跨平台 shell 层（macOS/Linux 用 bash、Windows 用 PowerShell）+ Windows 适配
- 双语 README + DSH 双面包发布格式（`dsh.bundle` / `dsh.client`）+ `dsh plugin` 优雅安装
