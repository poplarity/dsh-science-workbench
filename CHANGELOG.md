# Changelog

## Unreleased

- 修复：**热替换后样式表不更新** —— `apply()` 以前只判断 `<style data-biowb-css>` 是否存在，宿主 HMR 换掉 `client.js` 后旧 CSS 一直留着，新类名完全没有样式（表现是"布局在、样式全丢"）。改为按 CSS 内容指纹重写，样式改动也能原地热替换。
- 工作台：**左侧步骤栏可收起** —— 步骤栏本身保持原样（320 px、`分析步骤` 标题、检索、步骤卡），标题行右侧加了一个 `«` 收起按钮。收起后右侧产物区占满整宽，顶部留一个 `☰ 分析步骤 · N` 按钮一键恢复；收起状态记在 `localStorage`，切标签不丢。这是为了不让步骤数量继续挤占出图区域，又不改变原来的阅读方式。
- 开发环境：新增 `scripts/dev.sh`（`npm run dev` / `dev:restart` / `dev:status` / `dev:stop`）—— 在 `.dev/` 里起一个独立宿主（`web` profile，端口 5691），数据与设置都隔离在 `.dev/`，不碰桌面 App 的工作区和真实 `bio-projects/`。宿主改动重启约 3 秒。
- 开发环境：新增 `scripts/smoke.sh`（`npm run smoke`）—— 不开浏览器就能跑完整 Host 契约：`listProjects → setProjectsDir → initProject → runCell → getProject → addFeedback → rerunCell → deleteCell → markCellFinal`，任一断言失败非零退出。
- 开发环境：新增 `npm run check`（三个入口一起 `node --check`）。
- 文档：新增 `docs/DEV.md` —— 两条开发回路（`lib/client.js` 经 `/plugins/events` 的 `rebuilt` 事件原地热替换；`lib/index.js` 必须重启，因为模块热重载刻意忽略 `node_modules`）、profile 软链关系、接口速查，以及两个踩过的坑（bundle 带 `immutable` 缓存靠 `&rev=` 失效；`addFeedback` 按 artifact 而非 cell 记账）。
- 修复（开发环境）：`web` profile 里的 `dsh-science-workbench` 曾以 `file:` 安装，pnpm 拷了一份 0.3.0 快照，导致"改了代码看不出变化"。已改为 `link:`；README / README.zh 的开发段落同时改掉 `file:` 的装法。

## 0.3.1

- **修复（重要，首次真正发布）：DSH 0.2 的 shell 服务适配此前从未进入 npm 包** —— registry 上的 0.3.0 tarball 里 `lib/index.js` 仍然是 `shell.run(spec)` 旧路径（`shell.execute` 出现 0 次），而 DSH 0.2 已移除 `shell.run`，因此**从 npm 安装 0.3.0 的用户，任何 `bio_*` 工具调用都会抛 `shell.run is not a function`**，插件实际不可用。0.3.0 的 CHANGELOG 已经写了这条修复，但那条 bullet 是在 0.3.0 发布之后补的，包本身没跟上。0.3.1 是第一次把 `shell.resolve()` → `shell.execute(spec)` → `execution.result()` 真正交付（保留旧接口回退），同时带上 Windows 单引号字面量转义与 `py -3` 解释器回退。
- 约定：**出图一律走 nature-figure 规范（强制）** —— 打包的 `bio-workbench` skill 新增 §8：任何出现绘图库调用的 cell，动笔前必须先加载 `nature-figure`（`tfWuuu/nature-skills`），并遵守其五段式 figure contract、89/183 mm 期刊宽度、`PALETTE_*` 调色板、SVG 优先导出、≥5 pt 字号下限（禁用 mathtext）等硬性约定。同时把实操踩过的坑写死进约定：`'svg.fonttype': 'none'` 必须 mapping 写法、`figsize`/`dpi` 必须字面数字、校验器会扫 docstring、metagene 热图必须瘦长（长宽比 0.25–0.35）、四条门禁（`validate_figure` / `audit_pdf_text` / `audit_figure_collisions` / `require_matplotlib_panel_alignment`）全绿才算完成、WARN 视为返工。
- 修复：**QA 临时产物污染分析结果** —— 审计（alignment / collision）必须照跑且仍然阻断交付，但产物改为写到**项目外的临时目录**，项目里只保留 `figures/` 与 `results/`。此前的写法把 overlay 写进项目：alignment overlay 是「每面板一个矩形 + PASS 页脚」的测量示意图，在 UI 里和图并列会被误认成坏图。约定同时明确 **QA 路径不得出现在 `outputs` 声明里**，并加了一条交付前幽灵 artifact 自查（`manifest.artifacts` 中 `os.path.exists` 为假的条目必须为空）。
- 修复：**幽灵 artifact** —— 碰撞审计在 0 冲突时不写 overlay PDF，但若该路径被列进 `outputs`，账本会留下一条 `kind=figure` 却文件不存在的记录，工作台里点开为空。
- 约定补充：`bio_rerun_cell` 必须传 `name`；`bio_delete_cell` / `bio_mark_cell` 进工具速查表；与插件自带 `figure-style` / `figure-composer` 的优先级（论文级出图以 `nature-figure` 为准，不混用两套风格函数）。
- 维护：打包的 `bio-workbench` skill 说明新增 nature-figure 触发词；`~/.agents/skills/bio-workbench` 与 `~/.agents/skills/nature-figure` 通过 symlink 指向 canonical 位置，避免多份副本漂移。

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
