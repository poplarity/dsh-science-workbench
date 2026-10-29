# 本地开发环境

三条命令起步：

```bash
npm run dev        # 起一个独立宿主，http://127.0.0.1:5691/?token=…
npm run smoke      # 全链路断言（init → run → feedback → rerun → delete）
npm run dev:restart  # 改完 lib/index.js 后重启宿主，约 3 秒
```

## 两套 profile，都指向本仓库

| profile | 谁在跑 | 插件位置 |
| --- | --- | --- |
| `desktop` | DeepSeek Harness 桌面 App（当前 GUI，端口 56870） | `~/.dsh/profiles/desktop/node_modules/dsh-science-workbench` → **软链**到本仓库 |
| `web` | `dsh web`（开发宿主，端口 5691） | `~/.dsh/profiles/web/node_modules/dsh-science-workbench` → **软链**到本仓库 |

两者都是 `link:`，改仓库里的文件就是改运行中的插件。

**不要用 `dsh plugin add file:/path/to/checkout`** —— pnpm 会把 `file:` 当快照**拷贝**进 profile，之后你改的代码和跑起来的代码就不是同一份了（2026-10 的 `web` profile 里就留着一份 0.3.0 的旧拷贝，已改成 `link:`）。装本地代码一律 `link:`：

```bash
dsh plugin --profile web add "link:$PWD"
```

## 回路一：客户端 `lib/client.js`（热替换，不用重启）

宿主监听这个 bundle，内容一变就通过 `/plugins/events` 推 `rebuilt` 事件，已打开的页面**原地替换插件、保留 React 状态**。CSS、组件、文案都走这条路：存盘 → 看页面（一两秒）。

验证宿主确实收到了：

```bash
curl -sN http://127.0.0.1:5691/plugins/events | grep -o '"id":"dsh-science-workbench"[^}]*}'
# → "id":"dsh-science-workbench","url":"plugins/??dsh-science-workbench/client.js&rev=<新 rev>"
```

## 回路二：宿主 `lib/index.js`（必须重启）

宿主的模块热重载**刻意忽略 `node_modules`**，而插件正是从 `node_modules` 里加载的，所以 `lib/index.js` 不存在热替换：

```bash
npm run dev:restart && npm run smoke
```

`dev.sh restart` 是 kill + 重新 `dsh --profile web --port 5691`，实测 3 秒。重启后 **token 会变**，要重新打开脚本打印出来的 URL（旧标签页会 401）。

**桌面 App 不会重载宿主**：`lib/index.js` 的改动要退出 App 再打开才生效。所以日常宿主开发用 5691，只有最后验收才回 App 里看一眼；客户端改动则可以直接在 App 里热替换。

## 数据隔离

`dev.sh` 让开发宿主在 `.dev/` 里启动，于是：

- `workspaceRoot` = `.dev/`，`projectsRoot` 默认 `.dev/bio-projects/`
- 插件设置写到 `.dev/.dsh-science-workbench.json`
- `npm run smoke` 只动 `.dev/smoke-projects/`（每次先清空）

`.dev/` 已进 `.gitignore`，不会碰仓库里的 `bio-projects/`，也不会改桌面 App 的工作区设置。

## 命令表

| 命令 | 作用 |
| --- | --- |
| `npm run check` | `node --check` 三个入口（index.js / lib/index.js / lib/client.js），秒级 |
| `npm run dev` | 起开发宿主（已在跑则打印现有 URL） |
| `npm run dev:status` | pid、端口、URL |
| `npm run dev:restart` | 重启宿主，宿主改动的标准动作 |
| `npm run dev:stop` | 停宿主 |
| `npm run smoke` | 端到端断言，失败非零退出，可直接串进 CI |
| `npm run lint` | 沿用 CI 的旧检查 |

端口冲突时：`BIOWB_DEV_PORT=5692 npm run dev`。换 profile：`BIOWB_DEV_PROFILE=…`。

## 手工调接口

客户端和冒烟测试走的是同一组同源接口，都可以直接 curl：

```bash
curl -s -X POST http://127.0.0.1:5691/biowb/listProjects -d '{}'
curl -s -X POST http://127.0.0.1:5691/biowb/getProject -d '{"name":"smoke"}'
curl -s -X POST http://127.0.0.1:5691/biowb/runCell \
  -H 'content-type: application/json' \
  -d '{"name":"smoke","title":"probe","code":"print(1)"}'
```

可用路由：`getProject` `listProjects` `initProject` `setProjectsDir` `addFeedback`
`getCellCode` `deleteCell` `revealInFinder` `markCellFinal` `runCell` `rerunCell`，
外加二进制的 `/biowb/figure?name=&path=`。

宿主日志：`.dev/dev-server.log`（`npm run dev` 之后 `bash scripts/dev.sh log` 可跟）。

## 三个容易踩的坑

1. **客户端 bundle 带 `Cache-Control: immutable, max-age=1y`**，URL 里带 `&rev=<内容哈希>`。所以改完看不到变化，先确认页面拿到的 `rev` 变了（上面那条 SSE 命令），而不是去清缓存。
2. **`addFeedback` 是按 artifact 记的，不是按 cell**：必须给 `artifactPath`（如 `figures/cell_0001_tss.png`），传 `cellId` 会报 `artifact not found: undefined`。`rerunCell` 才是按 `cellId` 派生新版本。

3. **热替换不会重写 `<style>`**：`apply()` 里样式表按内容指纹（`data-biowb-css`）重写，所以改 CSS 也能热替换；早期版本只判断 `style` 标签是否存在，HMR 之后新类名会裸奔（布局在、样式全丢）。样式没生效先怀疑这一点，别急着清缓存。

## 发布

CI（`.github/workflows/ci.yml`）在 push 时只跑 `node --check`；发布由 `v*` tag 触发 `publish.yml`。发版前本地跑一遍：

```bash
npm run check && npm run smoke
```

然后 bump `package.json` 版本、把 CHANGELOG 的 `Unreleased` 段落落到新版本号，再打 tag。
