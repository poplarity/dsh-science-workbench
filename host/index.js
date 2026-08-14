// Host half of the dsh-bio-workbench dynamic Cordis Plugin.
// Plain-JavaScript function body returning a Cordis Plugin (no import/require/TS/JSX).

return {
  apply(ctx) {
    const shell = ctx.get('shell')
    const fs = ctx.get('fs')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    if (!shell || !fs) return

    const workspaceRoot =
      (sandboxPolicy && typeof sandboxPolicy.workspaceRoot === 'string' && sandboxPolicy.workspaceRoot) ||
      '/Users/wangyian/Documents/DSH'
    const settingsFile = workspaceRoot + '/.dsh-bio-workbench.json'

    // projectsRoot is configurable; default under the workspace root, then
    // overridden by the persisted preference (settingsFile).
    let projectsRoot = workspaceRoot.replace(/\/+$/, '') + '/bio-projects'
    let lastProject = null
    let settingsLoaded = null

    const state = { currentProject: null }

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
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let out = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
        out += chars[b0 >> 2]
        out += chars[((b0 & 3) << 4) | (b1 >> 4)]
        out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '='
        out += i + 2 < bytes.length ? chars[b2 & 63] : '='
      }
      return out
    }

    function tail(text, n) {
      const s = String(text || '')
      const max = n || 1200
      if (s.length <= max) return s
      return '…(truncated)…\n' + s.slice(s.length - max)
    }

    function runShell(command, workdir, timeoutMs, signal) {
      const policy = {
        mode: 'danger-full-access',
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
      const r = await runShell('shasum -a 256 "' + absPath + '" 2>/dev/null', workspaceRoot, 30000)
      const out = String(r.stdout.text || '').trim()
      const m = out.match(/\b([0-9a-f]{64})\b/)
      return m ? m[1] : null
    }

    async function mkdirs(root) {
      await runShell('mkdir -p "' + root + '/code" "' + root + '/data" "' + root + '/figures"', workspaceRoot, 30000)
    }

    async function gitCommit(root, message) {
      await runShell('git add -A >/dev/null 2>&1; git commit -m "' + String(message).replace(/"/g, '\\"') + '" >/dev/null 2>&1 || true', root, 30000)
    }

    async function gitInit(root) {
      await runShell('git init -q 2>/dev/null; git config user.email "bio-workbench@local" 2>/dev/null; git config user.name "bio-workbench" 2>/dev/null', root, 30000)
    }

    async function ensureProjectsRoot() {
      if (settingsLoaded) return await settingsLoaded
      settingsLoaded = (async () => {
        const raw = await readText(settingsFile)
        if (raw) {
          try {
            const s = JSON.parse(raw)
            if (s && typeof s.projectsRoot === 'string' && s.projectsRoot) projectsRoot = s.projectsRoot.replace(/\/+$/, '')
            if (s && typeof s.lastProject === 'string' && s.lastProject) lastProject = s.lastProject
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
        environment: environment || { language: 'python', interpreter: 'python3', lockFile: 'environment.lock' },
        cells: [],
        artifacts: []
      }
    }

    async function readManifest(root) {
      const raw = await readText(root + '/manifest.json')
      if (!raw) return null
      try {
        return JSON.parse(raw)
      } catch (err) {
        return null
      }
    }

    async function writeManifest(root, manifest) {
      await writeText(root + '/manifest.json', JSON.stringify(manifest, null, 2))
    }

    async function listProjects() {
      await ensureProjectsRoot()
      const entries = await listDir(projectsRoot)
      const out = []
      for (const e of entries) {
        if (e.type !== 'directory') continue
        const m = await readManifest(projectsRoot + '/' + e.name)
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
      if (args && args.name) root = projectsRoot + '/' + String(args.name).replace(/[^A-Za-z0-9._-]/g, '_')
      else if (state.currentProject) root = state.currentProject.root
      else if (lastProject) {
        const m = await readManifest(projectsRoot + '/' + lastProject)
        if (m) root = projectsRoot + '/' + lastProject
      }
      if (!root) {
        const projects = await listProjects()
        if (projects.length === 1) root = projects[0].root
      }
      return root
    }

    async function snapshotEnvironment(root, language) {
      language = language === 'R' ? 'R' : 'python'
      if (language === 'python') {
        const py = await runShell('python3 -c "import sys; print(sys.version.split()[0])" 2>/dev/null', root, 30000)
        const interpreter = String(py.stdout.text || '').trim() || 'python3'
        const pkgs = await runShell('python3 -m pip freeze 2>/dev/null || true', root, 60000)
        const lock = '# dsh-bio-workbench environment lock\n# interpreter: ' + interpreter + '\n# generated: ' + new Date().toISOString() + '\n\n' + String(pkgs.stdout.text || '')
        await writeText(root + '/environment.lock', lock)
        return { language, interpreter, lockFile: 'environment.lock' }
      } else {
        const r = await runShell('Rscript -e "cat(as.character(getRversion()))" 2>/dev/null', root, 30000)
        const interpreter = 'R ' + String(r.stdout.text || '').trim()
        await writeText(root + '/environment.lock', '# dsh-bio-workbench environment lock\n# interpreter: ' + interpreter + '\n')
        return { language, interpreter: interpreter || 'R', lockFile: 'environment.lock' }
      }
    }

    function buildHeader(meta) {
      const comment = '#'
      const lines = []
      lines.push(comment + ' @cell: ' + meta.cellId)
      lines.push(comment + ' @title: ' + (meta.title || ''))
      lines.push(comment + ' @language: ' + (meta.language || 'python'))
      lines.push(comment + ' @seed: ' + (meta.seed === undefined || meta.seed === null ? '' : meta.seed))
      lines.push(comment + ' @params: ' + JSON.stringify(meta.params || {}))
      lines.push(comment + ' @inputs: ' + JSON.stringify(meta.inputs || []))
      lines.push(comment + ' @outputs: ' + JSON.stringify(meta.outputs || []))
      return lines.join('\n')
    }

    function guessKind(path) {
      const p = String(path).toLowerCase()
      if (/\.(png|jpe?g|gif|webp|svg|pdf|tiff?|bmp)$/.test(p)) return 'figure'
      if (/\.(tsv|csv|bed|bedgraph|bw|bigwig|narrowpeak|bam|bai|txt|json)$/.test(p)) return 'data'
      return 'file'
    }

    async function hashFigures(root) {
      const entries = await listDir(root + '/figures')
      const map = {}
      for (const e of entries) {
        if (e.type !== 'file') continue
        const h = await sha256File(root + '/figures/' + e.name)
        if (h) map['figures/' + e.name] = h
      }
      return map
    }

    // Rename freshly produced figures to carry the producing cell id prefix,
    // so the figures/ directory is self-describing (decision #6).
    async function prefixFigures(root, cellId, newFigurePaths) {
      const renamed = []
      for (const rel of newFigurePaths) {
        const base = rel.substring('figures/'.length)
        if (base.indexOf(cellId + '_') === 0) {
          renamed.push(rel)
          continue
        }
        const newRel = 'figures/' + cellId + '_' + base
        await runShell('mv "' + root + '/' + rel + '" "' + root + '/' + newRel + '"', workspaceRoot, 30000)
        renamed.push(newRel)
      }
      return renamed
    }

    async function registerArtifact(manifest, spec) {
      const root = spec.root
      const outputHash = await sha256File(root + '/' + spec.path)
      const inputHashes = {}
      for (const inp of spec.inputs || []) {
        const h = await sha256File(root + '/' + inp)
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

    // Human-readable index.md at the project root (decision #6).
    async function writeIndex(root, manifest) {
      const lines = ['# ' + (manifest.name || '') + ' — 分析索引', '']
      lines.push('> 生成于 ' + new Date().toISOString(), '')
      for (const c of (manifest.cells || [])) {
        const figs = (c.artifacts || []).filter(function (a) { return a.indexOf('figures/') === 0 })
        lines.push('## ' + c.id + ' · ' + (c.title || ''))
        lines.push('- 状态: ' + (c.status || ''))
        lines.push('- 脚本: ' + (c.script || ''))
        if (figs.length) lines.push('- 图: ' + figs.join(', '))
        if (c.derivedFrom) lines.push('- 派生自: ' + c.derivedFrom)
        lines.push('')
      }
      await writeText(root + '/index.md', lines.join('\n'))
    }

    async function initProject(args) {
      await ensureProjectsRoot()
      const name = String(args && args.name ? args.name : 'project').replace(/[^A-Za-z0-9._-]/g, '_')
      const root = projectsRoot + '/' + name
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
      const dir = String(args && args.dir ? args.dir : '').trim()
      if (!dir || dir.charAt(0) !== '/') throw new Error('projects dir must be an absolute path')
      projectsRoot = dir.replace(/\/+$/, '')
      await persistSettings()
      settingsLoaded = Promise.resolve()
      state.currentProject = null
      return { projectsRoot }
    }

    async function revealInFinder(args) {
      const root = await resolveProjectRoot(args)
      if (!root) return { ok: false, error: 'no active project' }
      const p = String(args.path || '')
      const abs = p.charAt(0) === '/' ? p : (root + '/' + p)
      if (args.isDir === true) await runShell('open "' + abs + '"', workspaceRoot, 30000)
      else await runShell('open -R "' + abs + '"', workspaceRoot, 30000)
      return { ok: true }
    }

    function mimeFor(path) {
      const p = String(path).toLowerCase()
      if (p.endsWith('.png')) return 'image/png'
      if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
      if (p.endsWith('.webp')) return 'image/webp'
      if (p.endsWith('.gif')) return 'image/gif'
      if (p.endsWith('.svg')) return 'image/svg+xml'
      if (p.endsWith('.pdf')) return 'application/pdf'
      if (p.endsWith('.tif') || p.endsWith('.tiff')) return 'image/tiff'
      if (p.endsWith('.bmp')) return 'image/bmp'
      return 'image/png'
    }

    async function getProject(args) {
      const root = await resolveProjectRoot(args)
      if (!root) return { projects: await listProjects(), current: null }

      const manifest = await readManifest(root)
      if (!manifest) return { projects: await listProjects(), current: null }

      const figures = []
      for (const art of manifest.artifacts || []) {
        if (art.kind !== 'figure') continue
        const mime = mimeFor(art.path)
        const cap = mime === 'application/pdf' ? 10 * 1024 * 1024 : 4 * 1024 * 1024
        try {
          const bytes = await readBytes(root + '/' + art.path, cap)
          figures.push({ path: art.path, mime, base64: bytesToBase64(bytes), artifact: art })
        } catch (err) {
          figures.push({ path: art.path, mime, base64: null, artifact: art })
        }
      }

      return {
        projects: await listProjects(),
        current: { name: manifest.name, root: manifest.root, manifest, figures }
      }
    }

    async function runCell(args, signal) {
      const root = await resolveProjectRoot(args)
      if (!root) throw new Error('no active project — call bio_init_project first')
      const manifest = await readManifest(root)
      if (!manifest) throw new Error('manifest missing')

      const language = (args && args.language === 'R') ? 'R' : 'python'
      const cellId = 'cell_' + String((manifest.cells || []).length + 1).padStart(4, '0')
      const meta = {
        cellId,
        title: (args && args.title) || 'untitled cell',
        language,
        params: (args && args.params) || {},
        seed: args && args.seed !== undefined ? args.seed : 42,
        inputs: (args && args.inputs) || [],
        outputs: (args && args.outputs) || []
      }
      const scriptBody = buildHeader(meta) + '\n\n' + String((args && args.code) || '')
      const scriptRel = 'code/' + cellId + '.py'
      await writeText(root + '/' + scriptRel, scriptBody)

      const before = await hashFigures(root)
      const cmd = language === 'R' ? ('Rscript ' + scriptRel) : ('python3 ' + scriptRel)
      const result = await runShell(cmd, root, 300000, signal)
      const status = result.exitCode === 0 ? 'ok' : 'error'

      const after = await hashFigures(root)
      const newFigurePaths = Object.keys(after).filter(function (k) { return before[k] !== after[k] })
      const renamedPaths = await prefixFigures(root, cellId, newFigurePaths)

      const artifactPaths = []
      for (const rel of renamedPaths) {
        const art = await registerArtifact(manifest, {
          root, path: rel, kind: 'figure', producedBy: cellId,
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
      await gitCommit(root, 'cell ' + cellId + ': ' + meta.title + ' (' + status + ')')

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
      if (!root) throw new Error('no active project')
      const manifest = await readManifest(root)
      if (!manifest) throw new Error('manifest missing')
      const art = (manifest.artifacts || []).find(function (a) { return a.path === args.artifactPath })
      if (!art) throw new Error('artifact not found: ' + args.artifactPath)
      art.feedback = art.feedback || []
      art.feedback.push({ at: new Date().toISOString(), text: String(args.text || '') })
      await writeManifest(root, manifest)
      await writeIndex(root, manifest)
      await gitCommit(root, 'feedback on ' + args.artifactPath + ': ' + String(args.text || '').slice(0, 80))
      return { ok: true, artifactPath: args.artifactPath, feedbackCount: art.feedback.length }
    }

    async function rerunCell(args, signal) {
      const root = await resolveProjectRoot(args)
      if (!root) throw new Error('no active project')
      const manifest = await readManifest(root)
      if (!manifest) throw new Error('manifest missing')
      const prev = (manifest.cells || []).find(function (c) { return c.id === args.cellId })
      if (!prev) throw new Error('cell not found: ' + args.cellId)

      let newCellId
      const vm = prev.id.match(/^(.*)_v(\d+)$/)
      if (vm) newCellId = vm[1] + '_v' + (parseInt(vm[2], 10) + 1)
      else newCellId = prev.id + '_v2'
      let guard = 0
      while ((manifest.cells || []).some(function (c) { return c.id === newCellId }) && guard < 50) {
        newCellId = newCellId + '_x'
        guard += 1
      }

      const language = prev.language === 'R' ? 'R' : 'python'
      const meta = {
        cellId: newCellId,
        title: prev.title,
        language,
        params: prev.params || {},
        seed: prev.seed,
        inputs: prev.inputs || [],
        outputs: []
      }
      const scriptBody = buildHeader(meta) + '\n\n' + String(args.editedCode || '')
      const scriptRel = 'code/' + newCellId + '.py'
      await writeText(root + '/' + scriptRel, scriptBody)

      const before = await hashFigures(root)
      const cmd = language === 'R' ? ('Rscript ' + scriptRel) : ('python3 ' + scriptRel)
      const result = await runShell(cmd, root, 300000, signal)
      const status = result.exitCode === 0 ? 'ok' : 'error'

      const after = await hashFigures(root)
      const newFigurePaths = Object.keys(after).filter(function (k) { return before[k] !== after[k] })
      const renamedPaths = await prefixFigures(root, newCellId, newFigurePaths)

      const artifactPaths = []
      for (const rel of renamedPaths) {
        const art = await registerArtifact(manifest, {
          root, path: rel, kind: 'figure', producedBy: newCellId,
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
      await gitCommit(root, 'rerun ' + newCellId + ' (derived from ' + prev.id + ', ' + status + ')')

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
      if (!root) throw new Error('no active project')
      const manifest = await readManifest(root)
      if (!manifest) throw new Error('manifest missing')
      const idx = (manifest.cells || []).findIndex(function (c) { return c.id === args.cellId })
      if (idx === -1) throw new Error('cell not found: ' + args.cellId)
      const cell = manifest.cells[idx]
      const artPaths = (cell.artifacts || []).slice()
      manifest.artifacts = (manifest.artifacts || []).filter(function (a) { return artPaths.indexOf(a.path) === -1 })
      await runShell('rm -f "' + root + '/' + cell.script + '"', workspaceRoot, 30000)
      for (const ap of artPaths) {
        if (ap.indexOf('figures/') === 0) await runShell('rm -f "' + root + '/' + ap + '"', workspaceRoot, 30000)
      }
      manifest.cells.splice(idx, 1)
      await writeManifest(root, manifest)
      await writeIndex(root, manifest)
      await gitCommit(root, 'delete ' + cell.id)
      return { ok: true, deletedCell: cell.id }
    }

    harness.handle('getProject', function (args) { return getProject(args || {}) })
    harness.handle('listProjects', function () { return listProjects() })
    harness.handle('initProject', function (args) { return initProject(args || {}) })
    harness.handle('runCell', function (args) { return runCell(args || {}, undefined) })
    harness.handle('addFeedback', function (args) { return addFeedback(args || {}) })
    harness.handle('rerunCell', function (args) { return rerunCell(args || {}, undefined) })
    harness.handle('setProjectsDir', function (args) { return setProjectsDir(args || {}) })
    harness.handle('revealInFinder', function (args) { return revealInFinder(args || {}) })
    harness.handle('getCellCode', async function (args) {
      const root = await resolveProjectRoot(args)
      if (!root) return null
      const manifest = await readManifest(root)
      if (!manifest) return null
      const cell = (manifest.cells || []).find(function (c) { return c.id === (args && args.cellId) })
      if (!cell) return null
      const code = await readText(root + '/' + cell.script)
      return { cellId: cell.id, script: cell.script, code: code || '' }
    })
    harness.handle('deleteCell', function (args) { return deleteCell(args || {}) })

    function registerTool(name, description, parameters, execute) {
      const tool = harness.defineTool({
        name,
        description,
        parameters,
        output: {
          schema: { type: 'json' },
          render: function (_args, value) {
            return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
          }
        },
        execute: function (args, exec) { return execute(args, exec) }
      })
      ctx.effect(function () { return harness.registerTool(ctx, tool) })
    }

    registerTool('bio_init_project',
      'Create or open a reproducible bioinformatics analysis project. Creates the project directory skeleton (code/ data/ figures/), writes manifest.json and index.md, snapshots the Python/R environment into environment.lock, and git-inits the project. Call this before bio_run_cell.',
      {
        name: { type: 'string', required: true, description: 'Project directory name (sanitized to a safe folder name).' },
        language: { type: 'string', enum: ['python', 'R'], description: 'Primary analysis language; defaults to python.' }
      },
      function (args) { return initProject(args) })

    registerTool('bio_set_projects_dir',
      'Set the absolute root directory where analysis projects are stored. Persisted across restarts. Call before creating projects to relocate them.',
      {
        dir: { type: 'string', required: true, description: 'Absolute path for the projects root directory.' }
      },
      function (args) { return setProjectsDir(args) })

    registerTool('bio_run_cell',
      'Run one self-contained analysis cell inside the active project. Writes a versioned script with a declaration header (cell id, params, seed, inputs/outputs), executes it in a fresh Python/R subprocess with cwd = project root, discovers figures written to figures/, renames them with a cell-id prefix, registers artifacts with SHA-256 provenance into manifest.json, updates index.md, and git-commits. Figures are saved under figures/ (e.g. figures/result.png); declare extra non-figure outputs in `outputs`.',
      {
        name: { type: 'string', description: 'Optional project name to run the cell in.' },
        title: { type: 'string', required: true, description: 'Short human-readable cell title.' },
        code: { type: 'string', required: true, description: 'The self-contained script body (no header needed). Write figures to figures/ using relative paths.' },
        language: { type: 'string', enum: ['python', 'R'], description: 'Language for this cell; defaults to python.' },
        params: { type: 'json', description: 'Analysis parameters recorded for reproducibility (object).' },
        seed: { type: 'integer', description: 'Random seed recorded for reproducibility; defaults to 42.' },
        inputs: { type: 'array', items: { type: 'string' }, description: 'Input data file paths (relative to project root) hashed into provenance.' },
        outputs: { type: 'array', items: { type: 'string' }, description: 'Expected non-figure output paths (figures/ is auto-discovered).' }
      },
      function (args, exec) { return runCell(args, exec && exec.signal) })

    registerTool('bio_add_feedback',
      'Record structured feedback on a produced artifact (e.g. a figure) into manifest.json and git-commit it. This is how a "redraw it" note becomes traceable iteration history.',
      {
        name: { type: 'string', description: 'Optional project name.' },
        artifactPath: { type: 'string', required: true, description: 'Artifact path as listed in the manifest (e.g. figures/cell_0001_tss_profile.png).' },
        text: { type: 'string', required: true, description: 'The feedback text (what to change).' }
      },
      function (args) { return addFeedback(args) })

    registerTool('bio_get_project',
      'Return a project summary: manifest cells, artifacts with provenance, and feedback/iteration history. Pass name to select a specific project; otherwise uses the active project.',
      {
        name: { type: 'string', description: 'Optional project name to inspect.' }
      },
      function (args) { return getProject(args) })

    registerTool('bio_list_projects',
      'List all reproducible bioinformatics projects under the projects root.',
      {},
      function () { return listProjects() })

    registerTool('bio_rerun_cell',
      'Re-run a cell with edited code as a new versioned cell (derived-from lineage recorded), re-discover figures, and register new artifacts. Use after feedback to regenerate a figure.',
      {
        name: { type: 'string', description: 'Optional project name to re-run the cell in.' },
        cellId: { type: 'string', required: true, description: 'Id of the cell to re-run (e.g. cell_0001).' },
        editedCode: { type: 'string', required: true, description: 'The full replacement script body (header regenerated automatically).' }
      },
      function (args, exec) { return rerunCell(args, exec && exec.signal) })

    registerTool('bio_delete_cell',
      'Delete a cell and its produced artifacts (script and figures) from a project.',
      {
        name: { type: 'string', description: 'Optional project name.' },
        cellId: { type: 'string', required: true, description: 'Id of the cell to delete (e.g. cell_0001).' }
      },
      function (args) { return deleteCell(args) })
  }
}
