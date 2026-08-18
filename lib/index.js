// Host half of dsh-science-workbench as a STATIC Cordis plugin (plain ESM).
//
// This is the minimal permanent form: it registers the `bio_*` tools into the
// host `tools` registry using `defineTool` + `ctx.tools.register`, with the
// same execution/provenance logic as the validated dynamic prototype
// (`host/index.js`). There is no Client RPC here — the browser workbench UI
// (which needs the typert `@Remote` bridge) is the separate `src/` upgrade.
//
// Differences from the dynamic prototype:
//   - `harness.defineTool`  -> `defineTool` from `@deepseek-ai/dsh-tools`
//   - `harness.registerTool` -> `ctx.tools.register(...)`
//   - `harness.handle(...)`  -> removed (no Client RPC in this form)

import { defineTool } from "@deepseek-ai/dsh-tools"

export const name = "dsh-science-workbench"
export const inject = ["tools", "webServer"]

export function apply(ctx) {
  const tools = ctx.tools
  const shell = ctx.get("shell")
  const fs = ctx.get("fs")
  const sandboxPolicy = ctx.get("sandboxPolicy")
  if (!tools || !shell || !fs) return

  const workspaceRoot =
    (sandboxPolicy && typeof sandboxPolicy.workspaceRoot === "string" && sandboxPolicy.workspaceRoot) ||
    process.cwd()
  const settingsFile = workspaceRoot + "/.dsh-science-workbench.json"

  let projectsRoot = workspaceRoot.replace(/\/+$/, "") + "/bio-projects"
  let lastProject = null
  let settingsLoaded = null

  const state = { currentProject: null }

  // --- Cross-platform shell layer -------------------------------------
  const BS = String.fromCharCode(92)
  const rootStr = String(workspaceRoot || "")
  const IS_WIN = /^[A-Za-z]:/.test(rootStr) || rootStr.indexOf(BS) !== -1
  const IS_MAC = !IS_WIN && rootStr.indexOf("/Users/") === 0
  const PY = IS_WIN ? "python" : "python3"

  function shq(p) {
    return '"' + String(p).replace(/"/g, "'") + '"'
  }
  function winPath(p) {
    return String(p).split("/").join(BS)
  }
  function shqp(p) {
    return shq(IS_WIN ? winPath(p) : p)
  }
  function isAbsPath(p) {
    const s = String(p)
    return s.charAt(0) === "/" || /^[A-Za-z]:/.test(s)
  }
  function stripTrailingSep(p) {
    let s = String(p)
    while (s.length > 1 && (s.endsWith("/") || s.endsWith(BS))) s = s.slice(0, -1)
    return s
  }

  async function readText(path) {
    try {
      return await fs.readText(await fs.resolve(path))
    } catch (err) {
      return null
    }
  }
  async function writeText(path, content) {
    return await fs.writeText(await fs.resolve(path), content)
  }
  async function listDir(path) {
    try {
      return await fs.listDir(await fs.resolve(path))
    } catch (err) {
      return []
    }
  }
  async function readBytes(path, maxBytes) {
    return await fs.readBytes(await fs.resolve(path), undefined, maxBytes || 3 * 1024 * 1024)
  }
  function bytesToBase64(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    let out = ""
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i]
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
      out += chars[b0 >> 2]
      out += chars[((b0 & 3) << 4) | (b1 >> 4)]
      out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "="
      out += i + 2 < bytes.length ? chars[b2 & 63] : "="
    }
    return out
  }
  function tail(text, n) {
    const s = String(text || "")
    const max = n || 1200
    if (s.length <= max) return s
    return "…(truncated)…\n" + s.slice(s.length - max)
  }
  function runShell(command, workdir, timeoutMs, signal) {
    // TODO(phase2): resolve the SESSION's real sandbox mode via
    // sandboxPolicy.resolve({ session }) instead of hard-coding full access.
    // The workbench writes to a configurable projects root (default
    // ~/bio-projects) and runs python/git/open, which the workspace-write
    // sandbox does not allow; full access is a deliberate stopgap until the
    // per-session mode is threaded through the tools.
    const policy = {
      mode: "danger-full-access",
      workspaceRoot: (sandboxPolicy && sandboxPolicy.workspaceRoot) || workspaceRoot
    }
    const spec = shell.resolve({
      command,
      workdir,
      timeoutMs: timeoutMs || 120000,
      stdoutMaxBytes: 400000,
      signal: signal || undefined,
      sandboxPolicy: policy
    })
    return shell.run(spec)
  }

  async function sha256File(absPath) {
    const cmd = IS_WIN
      ? "Get-FileHash -Algorithm SHA256 -LiteralPath " + shqp(absPath) + " -ErrorAction SilentlyContinue | ForEach-Object { $_.Hash.ToLower() }"
      : "shasum -a 256 " + shqp(absPath) + " 2>/dev/null"
    const r = await runShell(cmd, workspaceRoot, 30000)
    const out = String(r.stdout.text || "").trim()
    const m = out.match(/\b([0-9a-f]{64})\b/i)
    return m ? m[1].toLowerCase() : null
  }
  async function mkdirs(root) {
    const cmd = IS_WIN
      ? "New-Item -ItemType Directory -Force -Path " + shqp(root + "/code") + "," + shqp(root + "/data") + "," + shqp(root + "/figures") + " | Out-Null"
      : "mkdir -p " + shqp(root + "/code") + " " + shqp(root + "/data") + " " + shqp(root + "/figures")
    await runShell(cmd, workspaceRoot, 30000)
  }
  async function gitCommit(root, message) {
    const cmd = IS_WIN
      ? "git add -A 2>$null; git commit -m " + shq(message) + " 2>$null"
      : "git add -A >/dev/null 2>&1; git commit -m " + shq(message) + " >/dev/null 2>&1 || true"
    await runShell(cmd, root, 30000)
  }
  async function gitInit(root) {
    const cmd = IS_WIN
      ? 'git init -q 2>$null; git config user.email "dsh-science-workbench@local" 2>$null; git config user.name "dsh-science-workbench" 2>$null'
      : 'git init -q 2>/dev/null; git config user.email "dsh-science-workbench@local" 2>/dev/null; git config user.name "dsh-science-workbench" 2>/dev/null'
    await runShell(cmd, root, 30000)
  }

  async function ensureProjectsRoot() {
    if (settingsLoaded) return await settingsLoaded
    settingsLoaded = (async () => {
      const raw = await readText(settingsFile)
      if (raw) {
        try {
          const s = JSON.parse(raw)
          if (s && typeof s.projectsRoot === "string" && s.projectsRoot) projectsRoot = s.projectsRoot.replace(/\/+$/, "")
          if (s && typeof s.lastProject === "string" && s.lastProject) lastProject = s.lastProject
        } catch (err) {}
      }
    })()
    await settingsLoaded
  }
  async function persistSettings() {
    await writeText(settingsFile, JSON.stringify({ projectsRoot: projectsRoot, lastProject: lastProject }, null, 2))
  }
  async function setLastProject(name) {
    await ensureProjectsRoot()
    if (name && lastProject !== name) {
      lastProject = name
      await persistSettings()
    }
  }

  function emptyManifest(name, root, environment) {
    return {
      schemaVersion: 1,
      name,
      root,
      environment: environment || { language: "python", interpreter: "python3", lockFile: "environment.lock" },
      cells: [],
      artifacts: []
    }
  }
  async function readManifest(root) {
    const raw = await readText(root + "/manifest.json")
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch (err) {
      return null
    }
  }
  async function writeManifest(root, manifest) {
    await writeText(root + "/manifest.json", JSON.stringify(manifest, null, 2))
  }

  async function listProjects() {
    await ensureProjectsRoot()
    const entries = await listDir(projectsRoot)
    const out = []
    for (const e of entries) {
      if (e.type !== "directory") continue
      const m = await readManifest(projectsRoot + "/" + e.name)
      if (m) out.push({ name: m.name, root: m.root, cells: (m.cells || []).length, artifacts: (m.artifacts || []).length })
    }
    return out
  }

  async function resolveProjectRoot(args) {
    await ensureProjectsRoot()
    if (args && args.name) {
      const nm = String(args.name)
      if (nm && lastProject !== nm) {
        lastProject = nm
        await persistSettings()
      }
    }
    let root = null
    if (args && args.name) root = projectsRoot + "/" + String(args.name).replace(/[^A-Za-z0-9._-]/g, "_")
    else if (state.currentProject) root = state.currentProject.root
    else if (lastProject) {
      const m = await readManifest(projectsRoot + "/" + lastProject)
      if (m) root = projectsRoot + "/" + lastProject
    }
    if (!root) {
      const projects = await listProjects()
      if (projects.length === 1) root = projects[0].root
    }
    return root
  }

  async function snapshotEnvironment(root, language) {
    language = language === "R" ? "R" : "python"
    if (language === "python") {
      const verCmd = PY + ' -c "import sys; print(sys.version.split()[0])"' + (IS_WIN ? " 2>$null" : " 2>/dev/null")
      const py = await runShell(verCmd, root, 30000)
      const interpreter = String(py.stdout.text || "").trim() || PY
      const pkgs = await runShell(PY + " -m pip freeze" + (IS_WIN ? " 2>$null" : " 2>/dev/null || true"), root, 60000)
      const lock = "# dsh-science-workbench environment lock\n# interpreter: " + interpreter + "\n# generated: " + new Date().toISOString() + "\n\n" + String(pkgs.stdout.text || "")
      await writeText(root + "/environment.lock", lock)
      return { language, interpreter, lockFile: "environment.lock" }
    } else {
      const r = await runShell('Rscript -e "cat(as.character(getRversion()))"' + (IS_WIN ? " 2>$null" : " 2>/dev/null"), root, 30000)
      const interpreter = "R " + String(r.stdout.text || "").trim()
      await writeText(root + "/environment.lock", "# dsh-science-workbench environment lock\n# interpreter: " + interpreter + "\n")
      return { language, interpreter: interpreter || "R", lockFile: "environment.lock" }
    }
  }

  function buildHeader(meta) {
    const lines = [
      "# @cell: " + meta.cellId,
      "# @title: " + (meta.title || ""),
      "# @language: " + (meta.language || "python"),
      "# @seed: " + (meta.seed === undefined || meta.seed === null ? "" : meta.seed),
      "# @params: " + JSON.stringify(meta.params || {}),
      "# @inputs: " + JSON.stringify(meta.inputs || []),
      "# @outputs: " + JSON.stringify(meta.outputs || [])
    ]
    return lines.join("\n")
  }
  function guessKind(path) {
    const p = String(path).toLowerCase()
    if (/\.(png|jpe?g|gif|webp|svg|pdf|tiff?|bmp)$/.test(p)) return "figure"
    if (/\.(tsv|csv|bed|bedgraph|bw|bigwig|narrowpeak|bam|bai|txt|json)$/.test(p)) return "data"
    return "file"
  }
  async function hashFigures(root) {
    const entries = await listDir(root + "/figures")
    const map = {}
    for (const e of entries) {
      if (e.type !== "file") continue
      const h = await sha256File(root + "/figures/" + e.name)
      if (h) map["figures/" + e.name] = h
    }
    return map
  }
  async function prefixFigures(root, cellId, newFigurePaths) {
    const renamed = []
    for (const rel of newFigurePaths) {
      const base = rel.substring("figures/".length)
      if (base.indexOf(cellId + "_") === 0) {
        renamed.push(rel)
        continue
      }
      const newRel = "figures/" + cellId + "_" + base
      await runShell(
        IS_WIN
          ? "Move-Item -Force -LiteralPath " + shqp(root + "/" + rel) + " -Destination " + shqp(root + "/" + newRel)
          : "mv " + shqp(root + "/" + rel) + " " + shqp(root + "/" + newRel),
        workspaceRoot,
        30000
      )
      renamed.push(newRel)
    }
    return renamed
  }
  async function registerArtifact(manifest, spec) {
    const root = spec.root
    const outputHash = await sha256File(root + "/" + spec.path)
    const inputHashes = {}
    for (const inp of spec.inputs || []) {
      const h = await sha256File(root + "/" + inp)
      inputHashes[inp] = h || null
    }
    const artifact = {
      path: spec.path,
      kind: spec.kind,
      producedBy: spec.producedBy,
      inputHashes,
      outputHash,
      params: spec.params || {},
      seed: spec.seed === undefined || spec.seed === null ? null : spec.seed,
      env: manifest.environment || {},
      createdAt: new Date().toISOString(),
      feedback: [],
      derivedFrom: spec.derivedFrom || null
    }
    manifest.artifacts.push(artifact)
    return artifact
  }
  async function writeIndex(root, manifest) {
    const lines = ["# " + (manifest.name || "") + " — 分析索引", ""]
    lines.push("> 生成于 " + new Date().toISOString(), "")
    for (const c of manifest.cells || []) {
      const figs = (c.artifacts || []).filter(function (a) { return a.indexOf("figures/") === 0 })
      lines.push("## " + c.id + " · " + (c.title || ""))
      lines.push("- 状态: " + (c.status || ""))
      if (c.final === true) lines.push("- 成品: ✓")
      lines.push("- 脚本: " + (c.script || ""))
      if (figs.length) lines.push("- 图: " + figs.join(", "))
      if (c.derivedFrom) lines.push("- 派生自: " + c.derivedFrom)
      lines.push("")
    }
    await writeText(root + "/index.md", lines.join("\n"))
  }
  function mimeFor(path) {
    const p = String(path).toLowerCase()
    if (p.endsWith(".png")) return "image/png"
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg"
    if (p.endsWith(".webp")) return "image/webp"
    if (p.endsWith(".gif")) return "image/gif"
    if (p.endsWith(".svg")) return "image/svg+xml"
    if (p.endsWith(".pdf")) return "application/pdf"
    if (p.endsWith(".tif") || p.endsWith(".tiff")) return "image/tiff"
    if (p.endsWith(".bmp")) return "image/bmp"
    return "image/png"
  }

  async function getProject(args) {
    const root = await resolveProjectRoot(args)
    if (!root) return { projects: await listProjects(), current: null }

    const manifest = await readManifest(root)
    if (!manifest) return { projects: await listProjects(), current: null }

    const figures = []
    for (const art of manifest.artifacts || []) {
      if (art.kind !== "figure") continue
      const mime = mimeFor(art.path)
      const cap = mime === "application/pdf" ? 10 * 1024 * 1024 : 4 * 1024 * 1024
      try {
        const bytes = await readBytes(root + "/" + art.path, cap)
        figures.push({ path: art.path, mime, base64: bytesToBase64(bytes), artifact: art })
      } catch (err) {
        figures.push({ path: art.path, mime, base64: null, artifact: art })
      }
    }

    return {
      projects: await listProjects(),
      platform: IS_WIN ? "win32" : IS_MAC ? "darwin" : "linux",
      current: { name: manifest.name, root: manifest.root, manifest, figures }
    }
  }

  async function runCell(args, signal) {
    const root = await resolveProjectRoot(args)
    if (!root) throw new Error("no active project — call bio_init_project first")
    const manifest = await readManifest(root)
    if (!manifest) throw new Error("manifest missing")

    const language = args && args.language === "R" ? "R" : "python"
    const cellId = "cell_" + String((manifest.cells || []).length + 1).padStart(4, "0")
    const meta = {
      cellId,
      title: (args && args.title) || "untitled cell",
      language,
      params: (args && args.params) || {},
      seed: args && args.seed !== undefined ? args.seed : 42,
      inputs: (args && args.inputs) || [],
      outputs: (args && args.outputs) || []
    }
    const scriptBody = buildHeader(meta) + "\n\n" + String((args && args.code) || "")
    const scriptRel = "code/" + cellId + ".py"
    await writeText(root + "/" + scriptRel, scriptBody)

    const before = await hashFigures(root)
    const cmd = language === "R" ? "Rscript " + shqp(scriptRel) : PY + " " + shqp(scriptRel)
    const result = await runShell(cmd, root, 300000, signal)
    const status = result.exitCode === 0 ? "ok" : "error"

    const after = await hashFigures(root)
    const newFigurePaths = Object.keys(after).filter(function (k) { return before[k] !== after[k] })
    const renamedPaths = await prefixFigures(root, cellId, newFigurePaths)

    const artifactPaths = []
    for (const rel of renamedPaths) {
      const art = await registerArtifact(manifest, {
        root, path: rel, kind: "figure", producedBy: cellId,
        params: meta.params, seed: meta.seed, inputs: meta.inputs
      })
      artifactPaths.push(art.path)
    }
    for (const out of meta.outputs) {
      if (artifactPaths.indexOf(out) === -1) {
        const art = await registerArtifact(manifest, {
          root, path: out, kind: guessKind(out), producedBy: cellId,
          params: meta.params, seed: meta.seed, inputs: meta.inputs
        })
        artifactPaths.push(art.path)
      }
    }

    manifest.cells.push({
      id: cellId,
      title: meta.title,
      script: scriptRel,
      language,
      params: meta.params,
      seed: meta.seed,
      inputs: meta.inputs,
      status,
      artifacts: artifactPaths,
      ranAt: new Date().toISOString(),
      stdoutTail: tail(result.stdout.text),
      stderrTail: tail(result.stderr.text),
      derivedFrom: null
    })
    await writeManifest(root, manifest)
    await writeIndex(root, manifest)
    await gitCommit(root, "cell " + cellId + ": " + meta.title + " (" + status + ")")

    return {
      cellId,
      status,
      artifacts: artifactPaths,
      stdoutTail: tail(result.stdout.text),
      stderrTail: tail(result.stderr.text)
    }
  }

  async function addFeedback(args) {
    const root = await resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const art = (manifest.artifacts || []).find(function (a) { return a.path === args.artifactPath })
    if (!art) throw new Error("artifact not found: " + args.artifactPath)
    art.feedback = art.feedback || []
    art.feedback.push({ at: new Date().toISOString(), text: String(args.text || "") })
    await writeManifest(root, manifest)
    await writeIndex(root, manifest)
    await gitCommit(root, "feedback on " + args.artifactPath + ": " + String(args.text || "").slice(0, 80))
    return { ok: true, artifactPath: args.artifactPath, feedbackCount: art.feedback.length }
  }

  async function rerunCell(args, signal) {
    const root = await resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const prev = (manifest.cells || []).find(function (c) { return c.id === args.cellId })
    if (!prev) throw new Error("cell not found: " + args.cellId)

    let newCellId
    const vm = prev.id.match(/^(.*)_v(\d+)$/)
    if (vm) newCellId = vm[1] + "_v" + (parseInt(vm[2], 10) + 1)
    else newCellId = prev.id + "_v2"
    let guard = 0
    while ((manifest.cells || []).some(function (c) { return c.id === newCellId }) && guard < 50) {
      newCellId = newCellId + "_x"
      guard += 1
    }

    const language = prev.language === "R" ? "R" : "python"
    const meta = {
      cellId: newCellId,
      title: prev.title,
      language,
      params: prev.params || {},
      seed: prev.seed,
      inputs: prev.inputs || [],
      outputs: []
    }
    const scriptBody = buildHeader(meta) + "\n\n" + String(args.editedCode || "")
    const scriptRel = "code/" + newCellId + ".py"
    await writeText(root + "/" + scriptRel, scriptBody)

    const before = await hashFigures(root)
    const cmd = language === "R" ? "Rscript " + shqp(scriptRel) : PY + " " + shqp(scriptRel)
    const result = await runShell(cmd, root, 300000, signal)
    const status = result.exitCode === 0 ? "ok" : "error"

    const after = await hashFigures(root)
    const newFigurePaths = Object.keys(after).filter(function (k) { return before[k] !== after[k] })
    const renamedPaths = await prefixFigures(root, newCellId, newFigurePaths)

    const artifactPaths = []
    for (const rel of renamedPaths) {
      const art = await registerArtifact(manifest, {
        root, path: rel, kind: "figure", producedBy: newCellId,
        params: meta.params, seed: meta.seed, inputs: meta.inputs,
        derivedFrom: (prev.artifacts || []).slice()
      })
      artifactPaths.push(art.path)
    }

    manifest.cells.push({
      id: newCellId,
      title: prev.title,
      script: scriptRel,
      language,
      params: meta.params,
      seed: meta.seed,
      inputs: meta.inputs,
      status,
      artifacts: artifactPaths,
      ranAt: new Date().toISOString(),
      stdoutTail: tail(result.stdout.text),
      stderrTail: tail(result.stderr.text),
      derivedFrom: prev.id
    })
    await writeManifest(root, manifest)
    await writeIndex(root, manifest)
    await gitCommit(root, "rerun " + newCellId + " (derived from " + prev.id + ", " + status + ")")

    return {
      cellId: newCellId,
      status,
      artifacts: artifactPaths,
      derivedFrom: prev.id,
      stdoutTail: tail(result.stdout.text),
      stderrTail: tail(result.stderr.text)
    }
  }

  async function deleteCell(args) {
    const root = await resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const idx = (manifest.cells || []).findIndex(function (c) { return c.id === args.cellId })
    if (idx === -1) throw new Error("cell not found: " + args.cellId)
    const cell = manifest.cells[idx]
    const artPaths = (cell.artifacts || []).slice()
    manifest.artifacts = (manifest.artifacts || []).filter(function (a) { return artPaths.indexOf(a.path) === -1 })
    await runShell(
      IS_WIN
        ? "Remove-Item -Force -LiteralPath " + shqp(root + "/" + cell.script) + " -ErrorAction SilentlyContinue"
        : "rm -f " + shqp(root + "/" + cell.script),
      workspaceRoot,
      30000
    )
    for (const ap of artPaths) {
      if (ap.indexOf("figures/") === 0)
        await runShell(
          IS_WIN
            ? "Remove-Item -Force -LiteralPath " + shqp(root + "/" + ap) + " -ErrorAction SilentlyContinue"
            : "rm -f " + shqp(root + "/" + ap),
          workspaceRoot,
          30000
        )
    }
    manifest.cells.splice(idx, 1)
    await writeManifest(root, manifest)
    await writeIndex(root, manifest)
    await gitCommit(root, "delete " + cell.id)
    return { ok: true, deletedCell: cell.id }
  }

  function registerTool(name, description, parameters, execute) {
    const tool = defineTool({
      name,
      description,
      parameters,
      output: {
        schema: { type: "json" },
        render: function (_args, value) {
          return [{ type: "text", text: JSON.stringify(value, null, 2) }]
        }
      },
      execute: function (args, exec) { return execute(args, exec) }
    })
    ctx.effect(function () { return ctx.tools.register(tool) })
  }

  registerTool("bio_init_project",
    "Create or open a reproducible bioinformatics analysis project. Creates the project directory skeleton (code/ data/ figures/), writes manifest.json and index.md, snapshots the Python/R environment into environment.lock, and git-inits the project. Call this before bio_run_cell.",
    {
      name: { type: "string", required: true, description: "Project directory name (sanitized to a safe folder name)." },
      language: { type: "string", enum: ["python", "R"], description: "Primary analysis language; defaults to python." }
    },
    function (args) { return initProject(args) })

  registerTool("bio_set_projects_dir",
    "Set the absolute root directory where analysis projects are stored. Persisted across restarts. Call before creating projects to relocate them.",
    {
      dir: { type: "string", required: true, description: "Absolute path for the projects root directory." }
    },
    function (args) { return setProjectsDir(args) })

  registerTool("bio_run_cell",
    "Run one self-contained analysis cell inside the active project. Writes a versioned script with a declaration header (cell id, params, seed, inputs/outputs), executes it in a fresh Python/R subprocess with cwd = project root, discovers figures written to figures/, renames them with a cell-id prefix, registers artifacts with SHA-256 provenance into manifest.json, updates index.md, and git-commits. Figures are saved under figures/ (e.g. figures/result.png); declare extra non-figure outputs in `outputs`.",
    {
      name: { type: "string", description: "Optional project name to run the cell in." },
      title: { type: "string", required: true, description: "Short human-readable cell title." },
      code: { type: "string", required: true, description: "The self-contained script body (no header needed). Write figures to figures/ using relative paths." },
      language: { type: "string", enum: ["python", "R"], description: "Language for this cell; defaults to python." },
      params: { type: "json", description: "Analysis parameters recorded for reproducibility (object)." },
      seed: { type: "integer", description: "Random seed recorded for reproducibility; defaults to 42." },
      inputs: { type: "array", items: { type: "string" }, description: "Input data file paths (relative to project root) hashed into provenance." },
      outputs: { type: "array", items: { type: "string" }, description: "Expected non-figure output paths (figures/ is auto-discovered)." }
    },
    function (args, exec) { return runCell(args, exec && exec.signal) })

  registerTool("bio_add_feedback",
    'Record structured feedback on a produced artifact (e.g. a figure) into manifest.json and git-commit it. This is how a "redraw it" note becomes traceable iteration history.',
    {
      name: { type: "string", description: "Optional project name." },
      artifactPath: { type: "string", required: true, description: "Artifact path as listed in the manifest (e.g. figures/cell_0001_tss_profile.png)." },
      text: { type: "string", required: true, description: "The feedback text (what to change)." }
    },
    function (args) { return addFeedback(args) })

  registerTool("bio_get_project",
    "Return a project summary: manifest cells, artifacts with provenance, and feedback/iteration history. Pass name to select a specific project; otherwise uses the active project.",
    {
      name: { type: "string", description: "Optional project name to inspect." }
    },
    function (args) { return getProject(args) })

  registerTool("bio_list_projects",
    "List all reproducible bioinformatics projects under the projects root.",
    {},
    function () { return listProjects() })

  registerTool("bio_rerun_cell",
    "Re-run a cell with edited code as a new versioned cell (derived-from lineage recorded), re-discover figures, and register new artifacts. Use after feedback to regenerate a figure.",
    {
      name: { type: "string", description: "Optional project name to re-run the cell in." },
      cellId: { type: "string", required: true, description: "Id of the cell to re-run (e.g. cell_0001)." },
      editedCode: { type: "string", required: true, description: "The full replacement script body (header regenerated automatically)." }
    },
    function (args, exec) { return rerunCell(args, exec && exec.signal) })

  registerTool("bio_delete_cell",
    "Delete a cell and its produced artifacts (script and figures) from a project.",
    {
      name: { type: "string", description: "Optional project name." },
      cellId: { type: "string", required: true, description: "Id of the cell to delete (e.g. cell_0001)." }
    },
    function (args) { return deleteCell(args) })

  registerTool("bio_mark_cell",
    "Mark a cell as a final (成品) artifact, or unmark it. Final cells are visually flagged in the workbench.",
    {
      name: { type: "string", description: "Optional project name." },
      cellId: { type: "string", required: true, description: "Id of the cell to mark (e.g. cell_0001_v3)." },
      final: { type: "boolean", description: "true to mark as final, false to unmark." }
    },
    function (args) { return markCellFinal(args) })

  // ---- functions referenced by tools but defined at call time ----------
  async function initProject(args) {
    await ensureProjectsRoot()
    const name = String(args && args.name ? args.name : "project").replace(/[^A-Za-z0-9._-]/g, "_")
    const root = projectsRoot + "/" + name
    await mkdirs(root)
    const environment = await snapshotEnvironment(root, args && args.language)
    const manifest = emptyManifest(name, root, environment)
    await writeManifest(root, manifest)
    await writeIndex(root, manifest)
    await gitInit(root)
    state.currentProject = { name, root }
    await setLastProject(name)
    return { name, root, environment }
  }

  async function setProjectsDir(args) {
    await ensureProjectsRoot()
    const dir = String(args && args.dir ? args.dir : "").trim()
    if (!dir || !isAbsPath(dir)) throw new Error("projects dir must be an absolute path")
    projectsRoot = stripTrailingSep(dir)
    await persistSettings()
    settingsLoaded = Promise.resolve()
    state.currentProject = null
    return { projectsRoot }
  }

  async function revealInFinder(args) {
    const root = await resolveProjectRoot(args)
    if (!root) return { ok: false, error: "no active project" }
    const p = String((args && args.path) || "")
    const isAbs = p.charAt(0) === "/" || /^[A-Za-z]:/.test(p)
    const abs = isAbs ? p : root + "/" + p
    let cmd
    if (IS_WIN) {
      cmd = args && args.isDir === true ? "explorer.exe " + shqp(abs) : "explorer.exe /select," + shqp(abs)
    } else if (IS_MAC) {
      cmd = args && args.isDir === true ? "open " + shqp(abs) : "open -R " + shqp(abs)
    } else {
      cmd = "xdg-open " + shqp(abs)
    }
    await runShell(cmd, workspaceRoot, 30000)
    return { ok: true }
  }

  async function getCellCode(args) {
    const root = await resolveProjectRoot(args)
    if (!root) return null
    const manifest = await readManifest(root)
    if (!manifest) return null
    const cell = (manifest.cells || []).find(function (c) { return c.id === (args && args.cellId) })
    if (!cell) return null
    const code = await readText(root + "/" + cell.script)
    return { cellId: cell.id, script: cell.script, code: code || "" }
  }

  async function markCellFinal(args) {
    const root = await resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const cell = (manifest.cells || []).find(function (c) { return c.id === (args && args.cellId) })
    if (!cell) throw new Error("cell not found: " + (args && args.cellId))
    cell.final = args.final === true
    await writeManifest(root, manifest)
    await writeIndex(root, manifest)
    await gitCommit(root, (cell.final ? "mark final " : "unmark final ") + cell.id)
    return { ok: true, cellId: cell.id, final: cell.final }
  }

  // Serve the workbench data over HTTP so the browser Client half can read and
  // mutate projects without the typert Remote bridge (which needs the harness
  // monorepo build). Same-origin fetch('/biowb/...') from the client bundle.
  const webServer = ctx.webServer
  if (webServer) {
    const routes = {
      getProject: getProject,
      listProjects: listProjects,
      initProject: initProject,
      setProjectsDir: setProjectsDir,
      addFeedback: addFeedback,
      getCellCode: getCellCode,
      deleteCell: deleteCell,
      revealInFinder: revealInFinder,
      markCellFinal: markCellFinal
    }
    const send = function (res, value, status) {
      res.statusCode = status || 200
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.end(JSON.stringify(value))
    }
    ctx.effect(function () {
      return webServer.register({
        kind: "prefix",
        path: "/biowb",
        handler: async function (req, res) {
          try {
            const url = new URL(req.url, "http://localhost")
            const name = url.pathname.replace(/^\/biowb\/?/, "")
            const fn = routes[name]
            if (!fn) return send(res, { error: "unknown endpoint: " + name }, 404)
            const body = req.method === "POST" ? await readJson(req) : {}
            const args = Object.assign({}, body, url.searchParams.get("name") ? { name: url.searchParams.get("name") } : {})
            send(res, await fn(args), 200)
          } catch (e) {
            send(res, { error: String(e && e.message ? e.message : e) }, 500)
          }
        }
      })
    })
  }
}

function readJson(req) {
  return new Promise(function (resolve, reject) {
    let data = ""
    req.on("data", function (c) { data += c })
    req.on("end", function () {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on("error", reject)
  })
}
