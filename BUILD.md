# Phase 2 构建与挂载步骤（静态化）

`lib/index.ts`（Host）与 `lib/client.ts`（Client）是动态原型 `host/index.js` / `client/index.js`
的静态 ESM 翻译。它们需要在 **DeepSeek Harness monorepo**（或等价构建链）里编译，因为两处产物只能由那套工具链生成：

1. **typert 远程描述符**：Client 通过 `ctx.remote.bioWorkbench.<method>()` 调用 Host，这个远程面由
   `@deepseek-ai/dsh-typert-generator` 扫描 `lib/index.ts` 里 `@Remote` 方法的参数/返回类型后生成
   （`typert.remote-client.js` + `typert.host.js`）。
2. **Client 浏览器 bundle**：`exports["./client"]` 指向的 `lib/client.js` 要由 Harness web 管线产出
   `window.__ModuleLoader__.load(...)` 形式。

## 步骤

1. 把本仓库放到 monorepo 的 `packages/` 下（或作为依赖 `pnpm add` 进来）。
2. 让 monorepo 的 tsc / typert-generator 从 `lib/index.ts` 生成 `lib/index.js`、`lib/types/**/*.d.ts`、
   `typert.remote-client.js`、`typert.host.js`；让 Vite 从 `lib/client.ts` 生成浏览器 `lib/client.js`。
3. 用 `dsh plugin`（profile 的 pnpm）把包装进目标 profile，`cordis.patch.yml` 会插入
   `dsh-bio-workbench` 这一行（Host 半）。
4. `standingKeyFor` 校验组合，再开一个 `bio-workbench` preset 的真实会话确认 `bio_*` 工具清单 + 工作台 UI。

## 构建时可能要微调的点

- **typert 类型推断**：`@Remote` 方法的参数/返回类型我写成了普通对象字面量类型，generator 据此推断 wire
  schema；若某个字段推断成 `unknown`，把该字段类型再细化即可。
- **无 agent 作用域的 remote**：本服务的 RPC 与 agent 无关（全局项目操作），`@Remote` 方法首参不带
  `agent: Agent`，故不会生成 `scope.context = 'agent'` 的查找参数。若 generator 要求 remote 必须带
  session 作用域，改法是在方法首参加入会话标识并标注（对照 monorepo 里 `dsh-goal` 的 `@Remote` 用法）。
- **Client `dsh.client.inject`**：我按 `dsh-client-runtime` / `dsh-api-remotes` / `dsh-client-ui-slots`
  填了包名；若这些包在目标版本里改名，按 `cordis_inspect` 的 Client Service 目录核对后替换。
- **CSS 注入**：静态 Client 用 `document` 一次性注入 `<style>`（不依赖构建期 CSS module）；若 Harness
  有更规范的 `styles` 服务，可改回 `ctx.styles`/CSS module。
- **`danger-full-access`**：Host 的 `runShell` 仍硬编码全权限沙箱（原型期绕过 macOS `sandbox-exec` 的
  占位）；静态化后应改为解析会话真实沙箱模式（`ctx.sandboxPolicy.resolve({session})`），见 `docs/design.md` §7。
