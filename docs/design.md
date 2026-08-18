# dsh-science-workbench 设计文档

面向生信分析的可复现 DSH 工作台插件。目标形态对齐 Jupyter（cell/内联图）与 Claude Science（agent 驱动 + compute run/artifact + provenance）的混合式：**agent 是执行引擎**，所有产出以结构化 notebook 呈现，每个 cell/图/文件可单独重跑、评论、溯源。

## 一、需求 → 方案映射

| 需求 | 方案 |
|---|---|
| 代码出图 + 反馈重新生成 | `bio_run_cell` 出图 → Tier 0 程序化自检 + 人审 → 结构化反馈 → `bio_rerun_cell` 派生重画 |
| 文件/分析产物管理 | 项目目录 + `manifest.json` 唯一账本（cells + artifacts + provenance） |
| 代码图片可复现 | 自包含脚本 + 全新子进程 + 环境锁 + SHA-256 输入/输出哈希 + seed |
| 开源 + git 版本化 | 本仓库（npm 包）+ 每个项目自动 `git init` + 每步自动 commit |

## 二、19 项决策

1. 交互范式：混合式（agent 执行引擎 + 结构化 notebook 呈现）
2. 执行模型：自包含脚本 + 全新子进程
3. 环境固定：环境快照（environment.lock）
4. 语言栈：Python 主 + R 按需降级
5. 视觉自检：Tier 0 程序化 + 人 + Tier 1 可插拔视觉 reviewer
6. 视觉落地：可插拔 reviewer + 零依赖兜底
7. 执行位置：本地优先；集群执行 = 后续 TODO
8. 账本：项目目录 + 明文 manifest.json
9. cell 契约：脚本头声明块
10. 形态/持久化：两阶段（动态插件跑通 → 开源 npm 包永久化）
11. cell 生成：agent 自主落 cell + "点开改代码→重跑"逃生舱
12. 反馈回路：结构化反馈挂 artifact + 派生关系 v1→v2→v3
13. UI 面板：三面板（notebook / 产物 / 迭代）+ 对话面板原本就有
14. 布局：图内联对话 + 三面板作"分析工作台"tab
15. 数据流：Host 单一事实来源 + Client 纯投影
16. 重跑范围：重跑带编辑 + 自动重跑下游（依赖图从 manifest 免费拿）；缓存复用 = TODO
17. 图载体：PNG + 生成脚本 + 原始绘图数据
18. git 范围：软件仓库 + 分析项目自动 git + 双证据；自动 commit 不 push
19. 开源形态：git 仓库 + npm 包（MIT）

## 三、三层架构

```
① 动态/静态 Cordis 插件
   ├─ Host：cell 执行、manifest 记账、图审、工具注册、Client RPC
   └─ Client：图内联卡片 + 三面板工作台 tab

② 配套 Skill（持久）
   └─ 项目布局 / cell 契约 / manifest 规范 / 图审约定 / 循环流程

③ 项目数据（文件系统，可 git）
   └─ <project>/code/ data/ figures/ manifest.json environment.lock .git/
```

## 四、目录结构（本仓库，v0.2.0）

```
dsh-science-workbench/
├─ lib/index.js        # Host 半（静态 ESM：执行/账本/工具/HTTP 数据路由）
├─ lib/client.js       # Client 半（浏览器 bundle：工作台 tab + 检索 + 目录选择器 + 成品标记）
├─ index.js            # 入口再导出（profile out-of-tree 解析兜底）
├─ cordis.patch.yml    # bundle 补丁（插入 dsh-science-workbench 行）
├─ skills/
│  ├─ bio-workbench/SKILL.md      # 工作台约定 skill
│  ├─ figure-style/               # 出版级出图规范（改编自 Claude Science，Apache-2.0）
│  └─ figure-composer/            # 多面板组合图 + 对抗式自审（改编自 Claude Science，Apache-2.0）
├─ assets/             # README 功能展示截图
├─ docs/design.md
├─ examples/           # 示例分析项目
├─ ATTRIBUTIONS.md     # 第三方（Claude Science skills）归属说明
└─ package.json README.md README.zh.md LICENSE CHANGELOG.md
```

## 五、后端契约要点（v0.2.0，静态双面包）

- **执行**：`ctx.get('shell')` → `resolve({command, workdir, timeoutMs, stdoutMaxBytes, signal, sandboxPolicy})` → `run(spec)` → `ShellRunResult{exitCode, stdout.text, stderr.text}`。Windows 上该服务为 PowerShell（pwsh-sandbox），macOS/Linux 为 bash。
- **文件**：`ctx.get('fs')` → `resolve(path)` → `readText`/`writeText`/`listDir`/`readBytes`；`writeText` 无 expected 即无条件覆盖；目录创建用 shell 命令。
- **工具**：`defineTool`（`@deepseek-ai/dsh-tools`）+ `ctx.tools.register`（Host 全局注册 `bio_*` 工具）。
- **Client 数据**：浏览器经同源 `fetch('/biowb/<method>')`，Host 用 `webServer` 服务这些路由（**无 typert Remote 桥、无需 monorepo 构建**）。
- **哈希**：无 crypto 内建 → macOS/Linux 用 shell `shasum -a 256`，Windows 用 `Get-FileHash`。
- **图传递**：Host `fs.readBytes` → 手写 base64 → Client 渲染 `data:` URL。
- **沙箱**：当前 `runShell` 硬编码 `danger-full-access`（绕过 macOS sandbox-exec 问题的占位，见 §七 TODO）。

## 六、MVP 构建顺序

1. 建 git 仓库骨架 + 首次 commit
2. Host 半（项目初始化/manifest/cell 契约/子进程执行/产物登记/反馈落账）
3. Client 半（图内联卡片 + 三面板工作台 tab）
4. 注册 `bio_*` 工具
5. 持久配套 skill
6. 真实小例验证闭环（peaks → TSS profile → 反馈改图 → 派生 v2 → 溯源）

## 七、后续（Phase 2 进展）

✅ 已完成：
- **静态插件包 + 组合挂载永久化**（v0.1.0+）：`dsh.bundle.patch` + `dsh.client` 双面包，`dsh plugin add dsh-science-workbench` 安装，重启不丢、全局可用。
- **Windows 适配**（v0.1.1）：PowerShell 命令方言、`python`↔`python3`、盘符路径支持、`explorer` 定位。
- **内置出版级出图 skill**（v0.2.0）：figure-style + figure-composer（Apache-2.0 归属见 ATTRIBUTIONS.md）。
- **工作台增强**（v0.2.0）：原生目录选择器、cell 检索、`bio_mark_cell` 成品标记、首步引导。

⏳ 待办：
- 集群执行（对接现有 chipseq-cluster / cluster-ssh / remote-compute-ssh）
- 缓存复用 + 依赖图失效判定
- Tier 1 视觉 reviewer 实装（配置视觉模型 endpoint）
- 导出容器配方（Dockerfile / Apptainer def）
- **uv.lock / renv 精确环境锁定**（当前用 `pip freeze` 快照）
- **沙箱策略正确解析**（`runShell` 仍硬编码 `danger-full-access`，因工作台写可配置项目根 + 跑子进程；应改为解析会话真实模式）
- **workspace root 解析**（项目默认落在 `~/bio-projects/`；Phase 2 对齐会话 workspace）

## 八、验证结论（已跑通）

用真实小例 `demo_tss` / `rad21_peak_heatmap` 跑通完整闭环，双证据（manifest + git）成立：

```
bio_init_project → 建目录 + manifest.json + environment.lock + git init
bio_run_cell     → cell_0001 + figures/tss_profile.png（SHA-256 ee5d99c4…）
bio_add_feedback → 反馈挂 figures/tss_profile.png（git: 186d033）
bio_rerun_cell   → cell_0001_v2 + figures/tss_profile_v2.png（derivedFrom 链，git: a9b9975）
bio_mark_cell    → cell_0001_v3 标记「成品」（v0.2.0）
bio_get_project  → 完整 provenance 可查（cells/artifacts/feedback/derivedFrom/哈希）
```
