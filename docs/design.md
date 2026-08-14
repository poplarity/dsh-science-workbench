# dsh-bio-workbench 设计文档

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

## 四、目录结构（本仓库）

```
dsh-bio-workbench/
├─ host/index.js        # Host 半（Node 进程：执行/账本/工具）
├─ client/index.js      # Client 半（浏览器：图卡片 + 工作台 tab）
├─ skills/bio-workbench/SKILL.md
├─ docs/design.md
├─ examples/            # 示例分析项目
└─ package.json README.md LICENSE
```

## 五、后端契约要点（已用 inspect 确认）

- **执行**：`ctx.get('shell')` → `resolve({command, workdir, timeoutMs, stdoutMaxBytes, signal})` → `run(spec)` → `ShellRunResult{exitCode, stdout.text, stderr.text}`。
- **文件**：`ctx.get('fs')` → `resolve(path)` → `readText`/`writeText`/`listDir`/`readBytes`；`writeText` 无 expected 即无条件覆盖；目录创建用 shell `mkdir -p`（fs 无 mkdir）。
- **工具**：`harness.defineTool({name, description, parameters, output:{schema,render}, execute})` + `harness.registerTool(ctx, tool)`。
- **RPC**：`harness.handle(method, fn)` ↔ Client `host.call(method, args)`。
- **哈希**：无 crypto 内建 → 用 shell `shasum -a 256`。
- **图传递**：Host `fs.readBytes` → base64（`btoa`）→ Client 渲染 `data:` URL。

## 六、MVP 构建顺序

1. 建 git 仓库骨架 + 首次 commit
2. Host 半（项目初始化/manifest/cell 契约/子进程执行/产物登记/反馈落账）
3. Client 半（图内联卡片 + 三面板工作台 tab）
4. 注册 `bio_*` 工具
5. 持久配套 skill
6. 真实小例验证闭环（peaks → TSS profile → 反馈改图 → 派生 v2 → 溯源）

## 七、后续（Phase 2）

- 静态插件包 + 组合挂载（`editing-cordis-compositions`）永久化
- 集群执行（对接现有 chipseq-cluster / cluster-ssh）
- 缓存复用 + 依赖图失效判定
- Tier 1 视觉 reviewer 实装（配置视觉模型 endpoint）
- 导出容器配方（Dockerfile / Apptainer def）
