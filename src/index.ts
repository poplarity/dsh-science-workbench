// Host half of dsh-bio-workbench as a static Cordis plugin (Phase 2).
//
// This is the STATIC translation of the validated dynamic prototype
// `host/index.js`. Differences from the dynamic version:
//
//   - `harness.defineTool`  -> `defineTool` from `@deepseek-ai/dsh-tools`
//   - `harness.registerTool` -> `ctx.tools.register(...)`
//   - `harness.handle(m, f)` -> `@Remote(m)` methods on a `TypertRemoteService`
//     subclass, so the Client calls `ctx.remote.bioWorkbench.<method>()`
//     instead of `host.call(method, args)`.
//
// Build note: the Client half's remote face (`ctx.remote.bioWorkbench`) is
// produced by `@deepseek-ai/dsh-typert-generator` from THIS file's `@Remote`
// method signatures during the harness monorepo build. The generator infers
// wire schemas from the parameter/return types; the object types below are
// written as plain literal shapes for that inference. If a schema detail
// needs adjustment, tweak the types here and rebuild.

import { defineTool } from "@deepseek-ai/dsh-tools"
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol"
import { z } from "zod"

export const name = "dsh-bio-workbench"

type Json = unknown

export type CellStatus = "ok" | "error"
export type ProjectListItem = { name: string; root: string; cells: number; artifacts: number }
export type FigureEntry = { path: string; mime: string; base64: string | null; artifact: Artifact }
export type Artifact = {
  path: string
  kind: string
  producedBy: string
  inputHashes: Record<string, string | null>
  outputHash: string | null
  params: Record<string, unknown>
  seed: number | null
  env: Record<string, unknown>
  createdAt: string
  feedback: { at: string; text: string }[]
  derivedFrom: string[] | null
}
export type Cell = {
  id: string
  title: string
  script: string
  language: string
  params: Record<string, unknown>
  seed: number | null
  inputs: string[]
  status: CellStatus
  artifacts: string[]
  ranAt: string
  stdoutTail: string
  stderrTail: string
  derivedFrom: string | null
}
export type Manifest = {
  schemaVersion: number
  name: string
  root: string
  environment: Record<string, unknown>
  cells: Cell[]
  artifacts: Artifact[]
}

const BS = String.fromCharCode(92)

export class BioWorkbenchService extends TypertRemoteService {
  static inject = ["tools", "shell", "fs", "sandboxPolicy"]
  static Config = z.object({ projectsRoot: z.string().optional() })

  private shell: any
  private fs: any
  private sandboxPolicy: any
  private workspaceRoot: string
  private settingsFile: string
  private projectsRoot: string
  private lastProject: string | null = null
  private settingsLoaded: Promise<void> | null = null
  private currentProject: { name: string; root: string } | null = null

  constructor(ctx: any, config: { projectsRoot?: string } = {}) {
    super(ctx, "bioWorkbench")
    this.shell = ctx.shell
    this.fs = ctx.fs
    this.sandboxPolicy = ctx.sandboxPolicy
    this.workspaceRoot =
      (this.sandboxPolicy && typeof this.sandboxPolicy.workspaceRoot === "string" && this.sandboxPolicy.workspaceRoot) ||
      String(process.cwd())
    this.settingsFile = this.workspaceRoot + "/.dsh-bio-workbench.json"
    this.projectsRoot = (config.projectsRoot || this.workspaceRoot.replace(/\/+$/, "") + "/bio-projects").replace(/\/+$/, "")
    this.registerTools(ctx)
  }

  // --- cross-platform shell helpers ------------------------------------
  private get IS_WIN(): boolean {
    const r = String(this.workspaceRoot || "")
    return /^[A-Za-z]:/.test(r) || r.indexOf(BS) !== -1
  }
  private get IS_MAC(): boolean {
    return !this.IS_WIN && String(this.workspaceRoot || "").indexOf("/Users/") === 0
  }
  private get PY(): string {
    return this.IS_WIN ? "python" : "python3"
  }
  private shq(p: unknown): string {
    return '"' + String(p).replace(/"/g, "'") + '"'
  }
  private winPath(p: unknown): string {
    return String(p).split("/").join(BS)
  }
  private shqp(p: unknown): string {
    return this.shq(this.IS_WIN ? this.winPath(p) : p)
  }

  private async readText(path: string): Promise<string | null> {
    try {
      return await this.fs.readText(await this.fs.resolve(path))
    } catch {
      return null
    }
  }
  private async writeText(path: string, content: string): Promise<void> {
    return await this.fs.writeText(await this.fs.resolve(path), content)
  }
  private async listDir(path: string): Promise<any[]> {
    try {
      return await this.fs.listDir(await this.fs.resolve(path))
    } catch {
      return []
    }
  }
  private async readBytes(path: string, maxBytes?: number): Promise<Uint8Array> {
    return await this.fs.readBytes(await this.fs.resolve(path), undefined, maxBytes || 3 * 1024 * 1024)
  }
  private bytesToBase64(bytes: Uint8Array): string {
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
  private tail(text: unknown, n?: number): string {
    const s = String(text || "")
    const max = n || 1200
    if (s.length <= max) return s
    return "…(truncated)…\n" + s.slice(s.length - max)
  }
  private runShell(command: string, workdir: string, timeoutMs?: number, signal?: any): Promise<any> {
    const policy = {
      mode: "danger-full-access",
      workspaceRoot: (this.sandboxPolicy && this.sandboxPolicy.workspaceRoot) || this.workspaceRoot
    }
    const spec = this.shell.resolve({
      command,
      workdir,
      timeoutMs: timeoutMs || 120000,
      stdoutMaxBytes: 400000,
      signal: signal || undefined,
      sandboxPolicy: policy
    })
    return this.shell.run(spec)
  }
  private async sha256File(absPath: string): Promise<string | null> {
    const cmd = this.IS_WIN
      ? "Get-FileHash -Algorithm SHA256 -LiteralPath " + this.shqp(absPath) + " -ErrorAction SilentlyContinue | ForEach-Object { $_.Hash.ToLower() }"
      : "shasum -a 256 " + this.shqp(absPath) + " 2>/dev/null"
    const r = await this.runShell(cmd, this.workspaceRoot, 30000)
    const out = String(r.stdout.text || "").trim()
    const m = out.match(/\b([0-9a-f]{64})\b/i)
    return m ? m[1].toLowerCase() : null
  }
  private async mkdirs(root: string): Promise<void> {
    const cmd = this.IS_WIN
      ? "New-Item -ItemType Directory -Force -Path " + this.shqp(root + "/code") + "," + this.shqp(root + "/data") + "," + this.shqp(root + "/figures") + " | Out-Null"
      : "mkdir -p " + this.shqp(root + "/code") + " " + this.shqp(root + "/data") + " " + this.shqp(root + "/figures")
    await this.runShell(cmd, this.workspaceRoot, 30000)
  }
  private async gitCommit(root: string, message: string): Promise<void> {
    const cmd = this.IS_WIN
      ? "git add -A 2>$null; git commit -m " + this.shq(message) + " 2>$null"
      : "git add -A >/dev/null 2>&1; git commit -m " + this.shq(message) + " >/dev/null 2>&1 || true"
    await this.runShell(cmd, root, 30000)
  }
  private async gitInit(root: string): Promise<void> {
    const cmd = this.IS_WIN
      ? 'git init -q 2>$null; git config user.email "bio-workbench@local" 2>$null; git config user.name "bio-workbench" 2>$null'
      : 'git init -q 2>/dev/null; git config user.email "bio-workbench@local" 2>/dev/null; git config user.name "bio-workbench" 2>/dev/null'
    await this.runShell(cmd, root, 30000)
  }

  private async ensureProjectsRoot(): Promise<void> {
    if (this.settingsLoaded) return await this.settingsLoaded
    this.settingsLoaded = (async () => {
      const raw = await this.readText(this.settingsFile)
      if (raw) {
        try {
          const s = JSON.parse(raw)
          if (s && typeof s.projectsRoot === "string" && s.projectsRoot) this.projectsRoot = s.projectsRoot.replace(/\/+$/, "")
          if (s && typeof s.lastProject === "string" && s.lastProject) this.lastProject = s.lastProject
        } catch {}
      }
    })()
    await this.settingsLoaded
  }
  private async persistSettings(): Promise<void> {
    await this.writeText(this.settingsFile, JSON.stringify({ projectsRoot: this.projectsRoot, lastProject: this.lastProject }, null, 2))
  }
  private async setLastProject(name: string | null): Promise<void> {
    await this.ensureProjectsRoot()
    if (name && this.lastProject !== name) {
      this.lastProject = name
      await this.persistSettings()
    }
  }

  private emptyManifest(name: string, root: string, environment: any): Manifest {
    return {
      schemaVersion: 1,
      name,
      root,
      environment: environment || { language: "python", interpreter: "python3", lockFile: "environment.lock" },
      cells: [],
      artifacts: []
    }
  }
  private async readManifest(root: string): Promise<Manifest | null> {
    const raw = await this.readText(root + "/manifest.json")
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  private async writeManifest(root: string, manifest: Manifest): Promise<void> {
    await this.writeText(root + "/manifest.json", JSON.stringify(manifest, null, 2))
  }

  private async listProjects(): Promise<ProjectListItem[]> {
    await this.ensureProjectsRoot()
    const entries = await this.listDir(this.projectsRoot)
    const out: ProjectListItem[] = []
    for (const e of entries) {
      if (e.type !== "directory") continue
      const m = await this.readManifest(this.projectsRoot + "/" + e.name)
      if (m) out.push({ name: m.name, root: m.root, cells: (m.cells || []).length, artifacts: (m.artifacts || []).length })
    }
    return out
  }

  private async resolveProjectRoot(args?: { name?: string }): Promise<string | null> {
    await this.ensureProjectsRoot()
    if (args && args.name) {
      const nm = String(args.name)
      if (nm && this.lastProject !== nm) {
        this.lastProject = nm
        await this.persistSettings()
      }
    }
    let root: string | null = null
    if (args && args.name) root = this.projectsRoot + "/" + String(args.name).replace(/[^A-Za-z0-9._-]/g, "_")
    else if (this.currentProject) root = this.currentProject.root
    else if (this.lastProject) {
      const m = await this.readManifest(this.projectsRoot + "/" + this.lastProject)
      if (m) root = this.projectsRoot + "/" + this.lastProject
    }
    if (!root) {
      const projects = await this.listProjects()
      if (projects.length === 1) root = projects[0].root
    }
    return root
  }

  private async snapshotEnvironment(root: string, language?: string): Promise<any> {
    language = language === "R" ? "R" : "python"
    if (language === "python") {
      const verCmd = this.PY + ' -c "import sys; print(sys.version.split()[0])"' + (this.IS_WIN ? " 2>$null" : " 2>/dev/null")
      const py = await this.runShell(verCmd, root, 30000)
      const interpreter = String(py.stdout.text || "").trim() || this.PY
      const pkgs = await this.runShell(this.PY + " -m pip freeze" + (this.IS_WIN ? " 2>$null" : " 2>/dev/null || true"), root, 60000)
      const lock = "# dsh-bio-workbench environment lock\n# interpreter: " + interpreter + "\n# generated: " + new Date().toISOString() + "\n\n" + String(pkgs.stdout.text || "")
      await this.writeText(root + "/environment.lock", lock)
      return { language, interpreter, lockFile: "environment.lock" }
    } else {
      const r = await this.runShell('Rscript -e "cat(as.character(getRversion()))"' + (this.IS_WIN ? " 2>$null" : " 2>/dev/null"), root, 30000)
      const interpreter = "R " + String(r.stdout.text || "").trim()
      await this.writeText(root + "/environment.lock", "# dsh-bio-workbench environment lock\n# interpreter: " + interpreter + "\n")
      return { language, interpreter: interpreter || "R", lockFile: "environment.lock" }
    }
  }

  private buildHeader(meta: any): string {
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
  private guessKind(path: string): string {
    const p = String(path).toLowerCase()
    if (/\.(png|jpe?g|gif|webp|svg|pdf|tiff?|bmp)$/.test(p)) return "figure"
    if (/\.(tsv|csv|bed|bedgraph|bw|bigwig|narrowpeak|bam|bai|txt|json)$/.test(p)) return "data"
    return "file"
  }
  private async hashFigures(root: string): Promise<Record<string, string>> {
    const entries = await this.listDir(root + "/figures")
    const map: Record<string, string> = {}
    for (const e of entries) {
      if (e.type !== "file") continue
      const h = await this.sha256File(root + "/figures/" + e.name)
      if (h) map["figures/" + e.name] = h
    }
    return map
  }
  private async prefixFigures(root: string, cellId: string, newFigurePaths: string[]): Promise<string[]> {
    const renamed: string[] = []
    for (const rel of newFigurePaths) {
      const base = rel.substring("figures/".length)
      if (base.indexOf(cellId + "_") === 0) {
        renamed.push(rel)
        continue
      }
      const newRel = "figures/" + cellId + "_" + base
      await this.runShell(
        this.IS_WIN
          ? "Move-Item -Force -LiteralPath " + this.shqp(root + "/" + rel) + " -Destination " + this.shqp(root + "/" + newRel)
          : "mv " + this.shqp(root + "/" + rel) + " " + this.shqp(root + "/" + newRel),
        this.workspaceRoot,
        30000
      )
      renamed.push(newRel)
    }
    return renamed
  }
  private async registerArtifact(manifest: Manifest, spec: any): Promise<Artifact> {
    const outputHash = await this.sha256File(spec.root + "/" + spec.path)
    const inputHashes: Record<string, string | null> = {}
    for (const inp of spec.inputs || []) {
      const h = await this.sha256File(spec.root + "/" + inp)
      inputHashes[inp] = h || null
    }
    const artifact: Artifact = {
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
  private async writeIndex(root: string, manifest: Manifest): Promise<void> {
    const lines = ["# " + (manifest.name || "") + " — 分析索引", ""]
    lines.push("> 生成于 " + new Date().toISOString(), "")
    for (const c of manifest.cells || []) {
      const figs = (c.artifacts || []).filter((a) => a.indexOf("figures/") === 0)
      lines.push("## " + c.id + " · " + (c.title || ""))
      lines.push("- 状态: " + (c.status || ""))
      lines.push("- 脚本: " + (c.script || ""))
      if (figs.length) lines.push("- 图: " + figs.join(", "))
      if (c.derivedFrom) lines.push("- 派生自: " + c.derivedFrom)
      lines.push("")
    }
    await this.writeText(root + "/index.md", lines.join("\n"))
  }
  private mimeFor(path: string): string {
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

  // --- public RPC (Client `ctx.remote.bioWorkbench.*`) ------------------
  @Remote("getProject")
  async getProject(args?: { name?: string }): Promise<{ projects: ProjectListItem[]; platform: string; current: { name: string; root: string; manifest: Manifest; figures: FigureEntry[] } | null }> {
    const root = await this.resolveProjectRoot(args)
    if (!root) return { projects: await this.listProjects(), platform: this.platform(), current: null }
    const manifest = await this.readManifest(root)
    if (!manifest) return { projects: await this.listProjects(), platform: this.platform(), current: null }
    const figures: FigureEntry[] = []
    for (const art of manifest.artifacts || []) {
      if (art.kind !== "figure") continue
      const mime = this.mimeFor(art.path)
      const cap = mime === "application/pdf" ? 10 * 1024 * 1024 : 4 * 1024 * 1024
      try {
        const bytes = await this.readBytes(root + "/" + art.path, cap)
        figures.push({ path: art.path, mime, base64: this.bytesToBase64(bytes), artifact: art })
      } catch {
        figures.push({ path: art.path, mime, base64: null, artifact: art })
      }
    }
    return { projects: await this.listProjects(), platform: this.platform(), current: { name: manifest.name, root: manifest.root, manifest, figures } }
  }

  @Remote("listProjects")
  async listProjectsRemote(): Promise<ProjectListItem[]> {
    return this.listProjects()
  }

  @Remote("initProject")
  async initProject(args?: { name?: string; language?: string }): Promise<{ name: string; root: string; environment: any }> {
    await this.ensureProjectsRoot()
    const name = String(args && args.name ? args.name : "project").replace(/[^A-Za-z0-9._-]/g, "_")
    const root = this.projectsRoot + "/" + name
    await this.mkdirs(root)
    const environment = await this.snapshotEnvironment(root, args && args.language)
    const manifest = this.emptyManifest(name, root, environment)
    await this.writeManifest(root, manifest)
    await this.writeIndex(root, manifest)
    await this.gitInit(root)
    this.currentProject = { name, root }
    await this.setLastProject(name)
    return { name, root, environment }
  }

  @Remote("setProjectsDir")
  async setProjectsDir(args?: { dir?: string }): Promise<{ projectsRoot: string }> {
    await this.ensureProjectsRoot()
    const dir = String(args && args.dir ? args.dir : "").trim()
    if (!dir || dir.charAt(0) !== "/") throw new Error("projects dir must be an absolute path")
    this.projectsRoot = dir.replace(/\/+$/, "")
    await this.persistSettings()
    this.settingsLoaded = Promise.resolve()
    this.currentProject = null
    return { projectsRoot: this.projectsRoot }
  }

  @Remote("revealInFinder")
  async revealInFinder(args?: { name?: string; path?: string; isDir?: boolean }): Promise<{ ok: boolean; error?: string }> {
    const root = await this.resolveProjectRoot(args)
    if (!root) return { ok: false, error: "no active project" }
    const p = String((args && args.path) || "")
    const isAbs = p.charAt(0) === "/" || /^[A-Za-z]:/.test(p)
    const abs = isAbs ? p : root + "/" + p
    let cmd: string
    if (this.IS_WIN) {
      cmd = args && args.isDir === true ? "explorer.exe " + this.shqp(abs) : "explorer.exe /select," + this.shqp(abs)
    } else if (this.IS_MAC) {
      cmd = args && args.isDir === true ? "open " + this.shqp(abs) : "open -R " + this.shqp(abs)
    } else {
      cmd = "xdg-open " + this.shqp(abs)
    }
    await this.runShell(cmd, this.workspaceRoot, 30000)
    return { ok: true }
  }

  @Remote("getCellCode")
  async getCellCode(args?: { name?: string; cellId?: string }): Promise<{ cellId: string; script: string; code: string } | null> {
    const root = await this.resolveProjectRoot(args)
    if (!root) return null
    const manifest = await this.readManifest(root)
    if (!manifest) return null
    const cell = (manifest.cells || []).find((c) => c.id === (args && args.cellId))
    if (!cell) return null
    const code = await this.readText(root + "/" + cell.script)
    return { cellId: cell.id, script: cell.script, code: code || "" }
  }

  @Remote("addFeedback")
  async addFeedback(args: { name?: string; artifactPath: string; text: string }): Promise<{ ok: boolean; artifactPath: string; feedbackCount: number }> {
    const root = await this.resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await this.readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const art = (manifest.artifacts || []).find((a) => a.path === args.artifactPath)
    if (!art) throw new Error("artifact not found: " + args.artifactPath)
    art.feedback = art.feedback || []
    art.feedback.push({ at: new Date().toISOString(), text: String(args.text || "") })
    await this.writeManifest(root, manifest)
    await this.writeIndex(root, manifest)
    await this.gitCommit(root, "feedback on " + args.artifactPath + ": " + String(args.text || "").slice(0, 80))
    return { ok: true, artifactPath: args.artifactPath, feedbackCount: art.feedback.length }
  }

  @Remote("deleteCell")
  async deleteCell(args: { name?: string; cellId: string }): Promise<{ ok: boolean; deletedCell: string }> {
    const root = await this.resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await this.readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const idx = (manifest.cells || []).findIndex((c) => c.id === args.cellId)
    if (idx === -1) throw new Error("cell not found: " + args.cellId)
    const cell = manifest.cells[idx]
    const artPaths = (cell.artifacts || []).slice()
    manifest.artifacts = (manifest.artifacts || []).filter((a) => artPaths.indexOf(a.path) === -1)
    await this.runShell(
      this.IS_WIN
        ? "Remove-Item -Force -LiteralPath " + this.shqp(root + "/" + cell.script) + " -ErrorAction SilentlyContinue"
        : "rm -f " + this.shqp(root + "/" + cell.script),
      this.workspaceRoot,
      30000
    )
    for (const ap of artPaths) {
      if (ap.indexOf("figures/") === 0)
        await this.runShell(
          this.IS_WIN
            ? "Remove-Item -Force -LiteralPath " + this.shqp(root + "/" + ap) + " -ErrorAction SilentlyContinue"
            : "rm -f " + this.shqp(root + "/" + ap),
          this.workspaceRoot,
          30000
        )
    }
    manifest.cells.splice(idx, 1)
    await this.writeManifest(root, manifest)
    await this.writeIndex(root, manifest)
    await this.gitCommit(root, "delete " + cell.id)
    return { ok: true, deletedCell: cell.id }
  }

  // --- internal execution (called by the bio_* tools) -------------------
  async runCell(args: any, signal?: any): Promise<any> {
    const root = await this.resolveProjectRoot(args)
    if (!root) throw new Error("no active project — call bio_init_project first")
    const manifest = await this.readManifest(root)
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
    const scriptBody = this.buildHeader(meta) + "\n\n" + String((args && args.code) || "")
    const scriptRel = "code/" + cellId + ".py"
    await this.writeText(root + "/" + scriptRel, scriptBody)

    const before = await this.hashFigures(root)
    const cmd = language === "R" ? "Rscript " + this.shqp(scriptRel) : this.PY + " " + this.shqp(scriptRel)
    const result = await this.runShell(cmd, root, 300000, signal)
    const status: CellStatus = result.exitCode === 0 ? "ok" : "error"

    const after = await this.hashFigures(root)
    const newFigurePaths = Object.keys(after).filter((k) => before[k] !== after[k])
    const renamedPaths = await this.prefixFigures(root, cellId, newFigurePaths)

    const artifactPaths: string[] = []
    for (const rel of renamedPaths) {
      const art = await this.registerArtifact(manifest, { root, path: rel, kind: "figure", producedBy: cellId, params: meta.params, seed: meta.seed, inputs: meta.inputs })
      artifactPaths.push(art.path)
    }
    for (const out of meta.outputs) {
      if (artifactPaths.indexOf(out) === -1) {
        const art = await this.registerArtifact(manifest, { root, path: out, kind: this.guessKind(out), producedBy: cellId, params: meta.params, seed: meta.seed, inputs: meta.inputs })
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
      stdoutTail: this.tail(result.stdout.text),
      stderrTail: this.tail(result.stderr.text),
      derivedFrom: null
    })
    await this.writeManifest(root, manifest)
    await this.writeIndex(root, manifest)
    await this.gitCommit(root, "cell " + cellId + ": " + meta.title + " (" + status + ")")

    return { cellId, status, artifacts: artifactPaths, stdoutTail: this.tail(result.stdout.text), stderrTail: this.tail(result.stderr.text) }
  }

  async rerunCell(args: any, signal?: any): Promise<any> {
    const root = await this.resolveProjectRoot(args)
    if (!root) throw new Error("no active project")
    const manifest = await this.readManifest(root)
    if (!manifest) throw new Error("manifest missing")
    const prev = (manifest.cells || []).find((c) => c.id === args.cellId)
    if (!prev) throw new Error("cell not found: " + args.cellId)

    let newCellId: string
    const vm = prev.id.match(/^(.*)_v(\d+)$/)
    if (vm) newCellId = vm[1] + "_v" + (parseInt(vm[2], 10) + 1)
    else newCellId = prev.id + "_v2"
    let guard = 0
    while ((manifest.cells || []).some((c) => c.id === newCellId) && guard < 50) {
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
    const scriptBody = this.buildHeader(meta) + "\n\n" + String(args.editedCode || "")
    const scriptRel = "code/" + newCellId + ".py"
    await this.writeText(root + "/" + scriptRel, scriptBody)

    const before = await this.hashFigures(root)
    const cmd = language === "R" ? "Rscript " + this.shqp(scriptRel) : this.PY + " " + this.shqp(scriptRel)
    const result = await this.runShell(cmd, root, 300000, signal)
    const status: CellStatus = result.exitCode === 0 ? "ok" : "error"

    const after = await this.hashFigures(root)
    const newFigurePaths = Object.keys(after).filter((k) => before[k] !== after[k])
    const renamedPaths = await this.prefixFigures(root, newCellId, newFigurePaths)

    const artifactPaths: string[] = []
    for (const rel of renamedPaths) {
      const art = await this.registerArtifact(manifest, { root, path: rel, kind: "figure", producedBy: newCellId, params: meta.params, seed: meta.seed, inputs: meta.inputs, derivedFrom: (prev.artifacts || []).slice() })
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
      stdoutTail: this.tail(result.stdout.text),
      stderrTail: this.tail(result.stderr.text),
      derivedFrom: prev.id
    })
    await this.writeManifest(root, manifest)
    await this.writeIndex(root, manifest)
    await this.gitCommit(root, "rerun " + newCellId + " (derived from " + prev.id + ", " + status + ")")

    return { cellId: newCellId, status, artifacts: artifactPaths, derivedFrom: prev.id, stdoutTail: this.tail(result.stdout.text), stderrTail: this.tail(result.stderr.text) }
  }

  private platform(): string {
    return this.IS_WIN ? "win32" : this.IS_MAC ? "darwin" : "linux"
  }

  private registerTools(ctx: any): void {
    const register = (t: any) => ctx.effect(() => ctx.tools.register(t))

    register(
      defineTool({
        name: "bio_init_project",
        description: "Create or open a reproducible bioinformatics analysis project. Creates the project directory skeleton (code/ data/ figures/), writes manifest.json and index.md, snapshots the Python/R environment into environment.lock, and git-inits the project. Call this before bio_run_cell.",
        parameters: {
          name: { type: "string", required: true, description: "Project directory name (sanitized to a safe folder name)." },
          language: { type: "string", enum: ["python", "R"], description: "Primary analysis language; defaults to python." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any) => this.initProject(args)
      })
    )

    register(
      defineTool({
        name: "bio_set_projects_dir",
        description: "Set the absolute root directory where analysis projects are stored. Persisted across restarts. Call before creating projects to relocate them.",
        parameters: {
          dir: { type: "string", required: true, description: "Absolute path for the projects root directory." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any) => this.setProjectsDir(args)
      })
    )

    register(
      defineTool({
        name: "bio_run_cell",
        description: "Run one self-contained analysis cell inside the active project. Writes a versioned script with a declaration header (cell id, params, seed, inputs/outputs), executes it in a fresh Python/R subprocess with cwd = project root, discovers figures written to figures/, renames them with a cell-id prefix, registers artifacts with SHA-256 provenance into manifest.json, updates index.md, and git-commits. Figures are saved under figures/ (e.g. figures/result.png); declare extra non-figure outputs in `outputs`.",
        parameters: {
          name: { type: "string", description: "Optional project name to run the cell in." },
          title: { type: "string", required: true, description: "Short human-readable cell title." },
          code: { type: "string", required: true, description: "The self-contained script body (no header needed). Write figures to figures/ using relative paths." },
          language: { type: "string", enum: ["python", "R"], description: "Language for this cell; defaults to python." },
          params: { type: "json", description: "Analysis parameters recorded for reproducibility (object)." },
          seed: { type: "integer", description: "Random seed recorded for reproducibility; defaults to 42." },
          inputs: { type: "array", items: { type: "string" }, description: "Input data file paths (relative to project root) hashed into provenance." },
          outputs: { type: "array", items: { type: "string" }, description: "Expected non-figure output paths (figures/ is auto-discovered)." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any, exec: any) => this.runCell(args, exec && exec.signal)
      })
    )

    register(
      defineTool({
        name: "bio_add_feedback",
        description: 'Record structured feedback on a produced artifact (e.g. a figure) into manifest.json and git-commit it. This is how a "redraw it" note becomes traceable iteration history.',
        parameters: {
          name: { type: "string", description: "Optional project name." },
          artifactPath: { type: "string", required: true, description: "Artifact path as listed in the manifest (e.g. figures/cell_0001_tss_profile.png)." },
          text: { type: "string", required: true, description: "The feedback text (what to change)." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any) => this.addFeedback(args)
      })
    )

    register(
      defineTool({
        name: "bio_get_project",
        description: "Return a project summary: manifest cells, artifacts with provenance, and feedback/iteration history. Pass name to select a specific project; otherwise uses the active project.",
        parameters: {
          name: { type: "string", description: "Optional project name to inspect." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any) => this.getProject(args) as any
      })
    )

    register(
      defineTool({
        name: "bio_list_projects",
        description: "List all reproducible bioinformatics projects under the projects root.",
        parameters: {},
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: () => this.listProjects()
      })
    )

    register(
      defineTool({
        name: "bio_rerun_cell",
        description: "Re-run a cell with edited code as a new versioned cell (derived-from lineage recorded), re-discover figures, and register new artifacts. Use after feedback to regenerate a figure.",
        parameters: {
          name: { type: "string", description: "Optional project name to re-run the cell in." },
          cellId: { type: "string", required: true, description: "Id of the cell to re-run (e.g. cell_0001)." },
          editedCode: { type: "string", required: true, description: "The full replacement script body (header regenerated automatically)." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any, exec: any) => this.rerunCell(args, exec && exec.signal)
      })
    )

    register(
      defineTool({
        name: "bio_delete_cell",
        description: "Delete a cell and its produced artifacts (script and figures) from a project.",
        parameters: {
          name: { type: "string", description: "Optional project name." },
          cellId: { type: "string", required: true, description: "Id of the cell to delete (e.g. cell_0001)." }
        },
        output: { schema: { type: "json" }, render: (_a: any, v: any) => [{ type: "text", text: JSON.stringify(v, null, 2) }] },
        execute: (args: any) => this.deleteCell(args)
      })
    )
  }
}

export default BioWorkbenchService
