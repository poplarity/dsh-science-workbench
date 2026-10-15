---
name: bio-workbench
description: 生信分析工作台（dsh-science-workbench）的可复现分析约定。当用户要创建或维护一个可复现的生信分析项目、用 bio_run_cell 跑分析并出图、登记产物 provenance、对图做结构化反馈并重画（反馈→改代码→重跑→派生新版本）时使用此 skill。**任何出图 cell 都必须同时加载 nature-figure skill 作为绘图规范**。触发词：生信项目、分析工作台、bio_run_cell、可复现出图、manifest、cell 契约、反馈重画、出图、画图、热图、profile。
---

# 生信分析工作台约定（dsh-science-workbench）

这是 agent 在执行生信分析时必须遵守的约定。核心原则：**每个产物都可溯源、可重放**——回答"这张图 = 哪段代码 + 哪些输入 + 什么环境 + 什么参数/种子"，并能重跑。

## 1. 项目布局

每个分析项目是一个目录，结构固定：

```
<workspace>/bio-projects/<name>/
├─ manifest.json        # 唯一事实来源（账本）：cells + artifacts + provenance + 反馈
├─ environment.lock     # 环境快照（interpreter 版本 + pip freeze）
├─ code/                # 每个 cell 一个自包含脚本 cell_0001.py / cell_0001_v2.py ...
├─ data/                # 输入数据（引用或副本）
├─ figures/             # 只放图：.svg / .pdf / .tiff / .png
├─ results/             # 非图产物：tsv/csv/bed/npz + source data
└─ .git/                # 项目自动 git（每次 cell 跑完/反馈 自动本地 commit，不 push）
```

**项目里不保留 QA 产物。** 审计（alignment / collision）必须照跑，但它们的产物是 scratch：
alignment overlay 是测量示意图（每个可比面板一个矩形 + PASS 页脚），collision overlay 标的是
可疑的文字/描边碰撞。两者都不是图，摆在项目里就是**污染分析结果**，还会招来误解点击。
一律写到项目外的临时目录，例如：

```python
import os, tempfile
QADIR = os.path.join(tempfile.gettempdir(), 'nature-figure-qa',
                     os.path.basename(os.path.abspath('.')))   # cwd = 项目根
os.makedirs(QADIR, exist_ok=True)
print(f'QA scratch dir (outside the project): {QADIR}')
```

并且**绝不把 QA 文件写进 `outputs` 声明**。踩过的坑：collision 审计在 0 冲突时不写 overlay PDF，
但 `outputs` 里仍列着那个路径，于是账本里留下一条**文件不存在的幽灵 artifact**，在 UI 里点开就是空的。

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
- **审计产物写到项目外的临时目录，绝不写进项目**（见 §1）。`figures/` 被自动扫描并在 UI 里当图展示；alignment overlay 每面板一个矩形 + PASS 页脚，放进去会被误认成坏图。
- **QA 路径不要出现在 `outputs` 里**，否则会留下文件不存在的幽灵 artifact。
- 非图的中间产物（tsv/csv/bed 等）通过 `outputs` 显式声明，放 `results/`。
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

1. **出图**：调用 `bio_run_cell`（含 `title` + `code` + `params` + `seed` + `inputs`）。**绘图规范见 §8，强制。**
2. **视觉自检（Tier 0，默认）**：程序化检查——渲染是否成功（exit code）、是否有图产出、dpi/尺寸合理性。**人（用户）是默认的眼睛**：图永远先给用户看。
3. **反馈**：用户对图提出反馈（"改 x 轴 / 换配色 / 加 p 值"），用 `bio_add_feedback` 把反馈作为结构化记录挂到对应 artifact 上（进 manifest + git commit）。
4. **重画**：调用 `bio_rerun_cell`（`cellId` + `editedCode`），生成版本化新 cell（`cell_0001_v2`），重跑、重新发现图、登记新 artifact 并记录 `derivedFrom` 派生关系。
   - **`bio_rerun_cell` 必须传 `name`**（项目名）。不传就落到"当前活动项目"，会在错的项目里建 cell —— 这是踩过的坑，清理起来很烦。

## 5. 工具速查

| 工具 | 作用 |
|---|---|
| `bio_init_project` | 建项目（目录骨架 + manifest + 环境快照 + git init） |
| `bio_run_cell` | 跑一个自包含 cell，出图并登记 provenance |
| `bio_rerun_cell` | 带编辑代码重跑，生成派生版本（**记得传 `name`**） |
| `bio_add_feedback` | 记录结构化反馈到 artifact |
| `bio_delete_cell` | 删 cell 及其产物（清理被取代的迭代版本） |
| `bio_mark_cell` | 标/取消成品（`final`），UI 里高亮 |
| `bio_get_project` / `bio_list_projects` | 查账本 |

### 5.1 两个必须知道的工具陷阱（实测确认，非推测）

**① `bio_rerun_cell` 会丢掉上一版声明的 `outputs`。**
`lib/index.js` 的 `rerunCell` 里 meta 写死 `outputs: []`（只继承 `inputs`/`params`/`seed`/`title`）。
后果：重跑 cell 写出的 `results/*.tsv` **不会进 manifest 的 artifact 注册表**，且新脚本头部显示
`# @outputs: []`。图仍然会自动发现并登记。所以**重跑后要回头核对非图产物是否还登记着**。

**② `bio_delete_cell` 按路径删注册，会连带抹掉别的 cell 的共享登记。**
manifest 里 `producedBy` 是**字符串**；同一个路径被两个 cell 产出时是**两条重复条目**（不是一个数组）。
而 `deleteCell` 用 `artifacts.filter(a => artPaths.indexOf(a.path) === -1)` —— 按 path 过滤，
于是删掉任一生产者就会把该路径的**所有**条目清掉。
后果：删旧版本 cell 时，新旧共用的 `results/` 表会**连新 cell 的登记一起消失**（文件仍在磁盘、仍被 git 跟踪）。
想保住 provenance，就在删之前先把共用产物记下来，或干脆保留旧 cell 不删。

**③ 两个操作都没有锁。**每次调用都是对 `manifest.json` 的 read-modify-write，
**必须串行**；并行调用（包括多个子代理同时改同一个项目）会丢失更新。

**④ `bio_delete_cell` 会 `rm -f` 掉该 cell 的脚本**（`code/cell_XXXX.py`）。
那是工具固有能力、不是可选行为，脚本只能从 git 历史里找回。

## 6. 可复现性三条铁律

1. **脚本自包含**：cell 显式声明 inputs/outputs，全新子进程运行，不依赖热内核状态。
2. **环境锁定**：项目用 `environment.lock` 记录 interpreter + 包版本；重放 = 同一 lock + 同一代码 + 同一输入 + 同一 seed。
3. **双证据**：manifest 存 provenance，git 存时间线；两者互相印证，缺一不可。

## 7. 视觉自检 Tier 1（可插拔，需视觉模型）

若配置了视觉模型 endpoint（Qwen-VL / GLM-4V / GPT-4o / Claude / 本地 Ollama），可在出图后调用它审图，检查：标签重叠、图例缺失/冲突、字体过小、坐标轴单位、色盲配色、dpi 不足、统计标注位置。发现机械问题先自改一轮再给用户看。**没有视觉模型时不做，Tier 0 + 人审足够。**

---

## 8. 【强制】出图一律走 nature-figure 规范

**只要 cell 里出现绘图库调用（matplotlib / seaborn 等），动笔之前必须先加载 `nature-figure` skill**（用 `skill` 工具，名称 `nature-figure`）。它是一整套**带阻断式门禁**的绘图规范，不是可选的审美偏好。

来源：`tfWuuu/nature-skills`（本地 checkout 位于 `~/Documents/xinglab/Bioinformatics/nature-skills`，已 symlink 进 `~/.agents/skills/`，随该 repo `git pull` 更新）。`nature-figure` 会引用 `../nature-shared/`，所以 `nature-shared` 也必须可发现。

纯数据 / 统计 / 建索引的 cell（不出图）不受此约束。

**与其它 figure skill 的优先级**：本插件还自带 `figure-style` / `figure-composer`（面向插件自身的多面板拼图工具链）。**论文级分析出图以 `nature-figure` 为准**；两者同时在场时，rcParams、字号阶梯、导出格式、门禁一律按 `nature-figure`，不要混用两套风格函数（例如 `apply_figure_style()` 与 nature-figure 的 rcParams 会互相覆盖）。

### 8.1 先写 figure contract，再写代码

按 `nature-figure` 的 `static/core/contract.md`，五段式：

1. **核心结论**：这张图要捍卫的那一句 claim，以及它回答的 Results 级科学问题。
2. **证据链**：每个 panel 对应一个**独立的推断角色**；只重复同一证据的 panel 要合并或删掉。
3. **archetype**：`quantitative grid` | `schematic-led composite` | `image plate + quant` | `asymmetric mixed-modality figure`。
4. **backend**：`scripts/nature_figure_backend.py set python`（本工作台一律 Python），之后绘制/预览/导出/视觉 QA 只用该 backend。
5. **期刊导出契约**：最终尺寸、≥5 pt 字号下限、可编辑文本、source data、统计与 n 的定义、导出格式、多面板对齐门禁、渲染后碰撞审计。

### 8.2 硬性绘图约定（校验器会查）

| 项 | 要求 |
|---|---|
| 三行强制字体规则 | 置于脚本最前：`font.family='sans-serif'`、`font.sans-serif=['Arial','DejaVu Sans','Liberation Sans']`、**`rcParams.update({'svg.fonttype': 'none'})`** |
| 为什么是 mapping 写法 | `validate_figure.py` 的正则只认 `'svg.fonttype': 'none'` 这种键值；`rcParams['svg.fonttype'] = 'none'` 过不了 `EDITABLE-TEXT` |
| 可编辑文本 | `'pdf.fonttype': 42` |
| 尺寸 | 单栏 **89 mm** / 双栏 **183 mm**，高度 ≤170 mm；`figsize` 必须写**字面英寸**（如 `(3.504, 5.118)`），写 `183*MM` 会被静态解析器当成英寸 |
| dpi | 图内 `dpi=300`；TIFF `dpi=600`（**字面数字**，`dpi=DPI_TIFF` 过不了 `RASTER-DPI`） |
| 调色板 | 用 `references/api.md` 的 `PALETTE_*`（genomics 数据用 `PALETTE_NATURE_GENOMICS`：wave2 对照 / wave1 处理）；顺序色阶（如 Reds）只用于单一连续量，不得当分类色 |
| 字号 | 全图 **≥5 pt**；**不要用 mathtext**（下标缩到 0.7× 会击穿下限），`±` 等用 Unicode |
| 导出 | **SVG 为主** + PDF + TIFF(600 dpi, LZW) + PNG(300 dpi) |
| 瘦长热图 | metagene 热图横轴只有几 kb、纵轴数万行基因，**加宽只损行可读性**；经验长宽比约 0.25–0.35（例：27 mm × 105 mm） |
| 注释/标签 | 校验器会扫**整个源文件含 docstring**；不要在注释里写 `dpi=200` 这类小值字面量，否则 `RASTER-DPI` 会失败 |

### 8.3 门禁：四条全绿才算出图完成

```bash
SKILL=<nature-skills>/skills/nature-figure
QADIR=$TMPDIR/nature-figure-qa/<project>      # 项目外，见 §1
# 1) 源码预检 —— 必须 READY FOR VISUAL QA
python $SKILL/scripts/validate_figure.py --backend python code/cell_XXXX.py
# 2) 渲染后字号下限 —— 必须 PASS
python $SKILL/scripts/audit_pdf_text.py figures/<fig>.pdf --min-pt 5
# 3) 渲染后碰撞审计 —— 必须 0 fail / 0 warn
python $SKILL/scripts/audit_figure_collisions.py figures/<fig>.pdf \
  --json-out $QADIR/<fig>.collision-audit.json --overlay-pdf $QADIR/<fig>.collision-audit.pdf
```

4. **面板对齐门禁**在 cell **内部**调用（最后一次 layout draw 之后、导出之前）：

```python
from audit_panel_alignment import require_matplotlib_panel_alignment
require_matplotlib_panel_alignment(
    fig, json_out=f'{QADIR}/{name}.alignment.json', overlay_svg=f'{QADIR}/{name}.alignment.svg',
    tolerance_pt=1.5, gutter_tolerance_pt=1.5, strict=True,
    axes=[...], panel_ids=[...], row_groups=[...], column_groups=[...], exclude_axes=[colorbar.ax])
```

- `FAIL` / 退出码 1 → **改图再导**，不许放过。
- `WARN` → 视为需复核，按"改图"处理（例：图内标签压在填充上 → 把标签移出绘图区）。
- 单面板图 `NOT APPLICABLE` 是正常结果。

### 8.4 收尾

- **QA 产物一律写到项目外的临时目录**（见 §1），项目里只留图和 results；**不要**把 QA 路径写进 `outputs`。
- 交付前核对账本无幽灵 artifact：`python -c "import json,os;m=json.load(open('manifest.json'));print([a['path'] for a in m['artifacts'] if not os.path.exists(a['path'])])"` 应输出 `[]`。
- **逐面板目视检查**（final physical size）后才交付；程序化检查不能替代目视。
- 把"失败 → 改 → 重跑"的链条写进 cell docstring，并保留失败那次 cell（它是迭代证据）。
- 迭代稳定后用 `bio_delete_cell` 清掉被取代的版本，避免产物堆积；完整历史仍在 git log 里。
