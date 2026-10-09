# Changelog

## 0.3.0

- 工作台：**重塑项目选择器** —— 工作台顶部**置顶下拉**（触发器显示当前项目名，点击展开**宽面板**）：项目名完整显示（自动换行不截断）、元数据独立列（cell/图数量 + 最近活动日期）、面板内置检索框按名称过滤、当前项目高亮；项目列表带 `createdAt`/`updatedAt` 日期索引并按最近活跃排序，新建的项目自动排最前。左侧栏固定宽度，不再被内容挤占右侧显示区。
- 修复：**超大图无法显示** —— 图不再以 base64 内联进 JSON（旧版单图 4 MB 上限，超过即「无预览」），改为新增 `/biowb/figure` 二进制路由按需流式加载（上限提升到 100 MB，带 1 小时缓存 + 路径穿越防护）；PDF 同样走 URL 加载。
- 性能：**打开工作台提速** —— `getProject` 响应不再内联全部图片字节，从数十 MB 级降到 KB 级；`<img loading="lazy">` 按需加载，多图项目首屏明显加快。
- 适配：**支持 DSH 桌面版（Electron）** —— 桌面版使用独立的 `desktop` profile 且命令行拒绝写入，改为用界面内 **Plugins → Add plugin**（支持包名 / Git / 本地绝对路径）安装；peer 声明放宽为 `@deepseek-ai/dsh-tools >=0.1.0-rc.6`（原 `^0.1.0-rc.6` 上界是 `<0.2.0`，DSH `0.2.0-rc.2` 的兼容性检查会直接把插件判为 incompatible 并跳过加载）。
- 兼容：**适配 DSH 0.2 的 shell 服务** —— 由 `shell.run(spec)` 改为 `shell.resolve()` → `shell.execute(spec)` → `execution.result()`（保留旧接口回退，老版本 DSH 仍可用）。
- 修复：**项目根位于会话工作区之外时写入被沙箱拒绝** —— 插件发起的 `fs.writeText` 没有 session，沙箱策略会解析成 `workspace-write`（工作区 = 会话目录），于是写 `~/bio-projects` 下的 cell 脚本 / `manifest.json` 一律报 `file access denied`；现在显式传入 `danger-full-access` 策略（与 shell 层一致）。
- Windows：**命令引号改用单引号字面量** —— PowerShell 的双引号会插值 `$` 与反引号，提交信息/路径可能被改写；**Python 解释器解析** —— `python` 不在 PATH 时自动回退 `py -3`，并用解析到的解释器运行 cell。

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
