# Changelog

## 0.3.0

- 工作台：**重塑项目选择器** —— 工作台顶部**置顶下拉**（触发器显示当前项目名，点击展开**宽面板**）：项目名完整显示（自动换行不截断）、元数据独立列（cell/图数量 + 最近活动日期）、面板内置检索框按名称过滤、当前项目高亮；项目列表带 `createdAt`/`updatedAt` 日期索引并按最近活跃排序，新建的项目自动排最前。左侧栏固定宽度，不再被内容挤占右侧显示区。
- 修复：**超大图无法显示** —— 图不再以 base64 内联进 JSON（旧版单图 4 MB 上限，超过即「无预览」），改为新增 `/biowb/figure` 二进制路由按需流式加载（上限提升到 100 MB，带 1 小时缓存 + 路径穿越防护）；PDF 同样走 URL 加载。
- 性能：**打开工作台提速** —— `getProject` 响应不再内联全部图片字节，从数十 MB 级降到 KB 级；`<img loading="lazy">` 按需加载，多图项目首屏明显加快。

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
