---
name: bio-workbench
description: 生信分析工作台（dsh-science）的可复现分析约定。当用户要创建或维护一个可复现的生信分析项目、用 bio_run_cell 跑分析并出图、登记产物 provenance、对图做结构化反馈并重画（反馈→改代码→重跑→派生新版本）时使用此 skill。触发词：生信项目、分析工作台、bio_run_cell、可复现出图、manifest、cell 契约、反馈重画。
---

# 生信分析工作台约定（dsh-science）

这是 agent 在执行生信分析时必须遵守的约定。核心原则：**每个产物都可溯源、可重放**——回答"这张图 = 哪段代码 + 哪些输入 + 什么环境 + 什么参数/种子"，并能重跑。

## 1. 项目布局

每个分析项目是一个目录，结构固定：

```
<workspace>/bio-projects/<name>/
├─ manifest.json        # 唯一事实来源（账本）：cells + artifacts + provenance + 反馈
├─ environment.lock     # 环境快照（interpreter 版本 + pip freeze）
├─ code/                # 每个 cell 一个自包含脚本 cell_0001.py / cell_0001_v2.py ...
├─ data/                # 输入数据（引用或副本）
├─ figures/             # 图产物（.png 等，可配 .data.tsv 原始绘图数据）
└─ .git/                # 项目自动 git（每次 cell 跑完/反馈 自动本地 commit，不 push）
```

## 2. cell 契约（脚本头声明块）

每个 cell 脚本顶部有一段由工具生成的声明头，声明即契约：

```python
# @cell: cell_0001
# @title: TSS profile
# @language: python
# @seed: 42
# @params: {"bin": 50, "upstream": 3000}
# @inputs: ["data/peaks.bed"]
# @outputs: ["figures/tss_profile.png"]
```

规则：
- **图必须写到 `figures/` 下**（相对项目根路径），这样运行后能自动被发现并登记 provenance。
- 非图的中间产物（tsv/csv/bed 等）通过 `outputs` 显式声明。
- 脚本要**自包含**：显式读输入、写输出；cwd = 项目根；用相对路径。

## 3. manifest 记账（唯一事实来源）

```json
{
  "schemaVersion": 1,
  "name": "...", "root": "...",
  "environment": {"language": "python", "interpreter": "3.12.x", "lockFile": "environment.lock"},
  "cells": [ { "id", "title", "script", "language", "params", "seed", "inputs",
               "status": "ok|error", "artifacts": [], "ranAt", "stdoutTail", "stderrTail", "derivedFrom" } ],
  "artifacts": [ { "path", "kind": "figure|data|file", "producedBy", "inputHashes",
                   "outputHash", "params", "seed", "env", "createdAt", "feedback": [], "derivedFrom" } ]
}
```

- 每个 artifact 的 `outputHash` 与每个 `inputHashes` 都是 SHA-256，保证可复现性证据。
- `feedback` 挂在 artifact 上；`derivedFrom` 记录版本派生关系（v1 → v2）。

## 4. 出图 → 反馈 → 重画循环

1. **出图**：调用 `bio_run_cell`（含 `title` + `code` + `params` + `seed` + `inputs`）。
2. **视觉自检（Tier 0，默认）**：程序化检查——渲染是否成功（exit code）、是否有图产出、dpi/尺寸合理性。**人（用户）是默认的眼睛**：图永远先给用户看。
3. **反馈**：用户对图提出反馈（"改 x 轴 / 换配色 / 加 p 值"），用 `bio_add_feedback` 把反馈作为结构化记录挂到对应 artifact 上（进 manifest + git commit）。
4. **重画**：调用 `bio_rerun_cell`（`cellId` + `editedCode`），生成版本化新 cell（`cell_0001_v2`），重跑、重新发现图、登记新 artifact 并记录 `derivedFrom` 派生关系。

## 5. 工具速查

| 工具 | 作用 |
|---|---|
| `bio_init_project` | 建项目（目录骨架 + manifest + 环境快照 + git init） |
| `bio_run_cell` | 跑一个自包含 cell，出图并登记 provenance |
| `bio_rerun_cell` | 带编辑代码重跑，生成派生版本 |
| `bio_add_feedback` | 记录结构化反馈到 artifact |
| `bio_get_project` / `bio_list_projects` | 查账本 |

## 6. 可复现性三条铁律

1. **脚本自包含**：cell 显式声明 inputs/outputs，全新子进程运行，不依赖热内核状态。
2. **环境锁定**：项目用 `environment.lock` 记录 interpreter + 包版本；重放 = 同一 lock + 同一代码 + 同一输入 + 同一 seed。
3. **双证据**：manifest 存 provenance，git 存时间线；两者互相印证，缺一不可。

## 7. 视觉自检 Tier 1（可插拔，需视觉模型）

若配置了视觉模型 endpoint（Qwen-VL / GLM-4V / GPT-4o / Claude / 本地 Ollama），可在出图后调用它审图，检查：标签重叠、图例缺失/冲突、字体过小、坐标轴单位、色盲配色、dpi 不足、统计标注位置。发现机械问题先自改一轮再给用户看。**没有视觉模型时不做，Tier 0 + 人审足够。**
