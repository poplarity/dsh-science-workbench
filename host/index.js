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
    const projectsRoot = workspaceRoot.replace(/\/+$/, '') + '/bio-projects'

    // In-memory pointer to the currently active project (the manifest on disk is the durable source of truth).
    const state = { currentProject: null }

    // ---------------------------------------------------------------------
    // Small helpers (all reversible/stateless — they read/write through fs)
    // ---------------------------------------------------------------------
    async function fsResolve(path) {
      return await fs.resolve(path)
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
      let bin = ''
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
      }
      return btoa(bin)
    }

    function tail(text, n) {
      const s = String(text || '')
      const max = n || 1200
      if (s.length <= max) return s
      return '…(truncated)…\n' + s.slice(s.length - max)
    }

    function runShell(command, workdir, timeoutMs, signal) {
      const spec = shell.resolve({
        command,
        workdir,
        timeoutMs: timeoutMs || 120000,
        stdoutMaxBytes: 400000,
        signal: signal || undefined
      })
      return shell.run(spec)
    }

    async function sha256File(absPath) {
      const r = await runShell('shasum -a 256 "' + absPath + '" 2>/dev/null', projectsRoot, 30000)
      const out = String(r.stdout.text || '').trim()
      const m = out.match(/\b([0-9a-f]{64})\b/)
      return m ? m[1] : null
    }

    async function mkdirs(root) {
      await runShell('mkdir -p code data figures', root, 30000)
    }

    async function gitCommit(root, message) {
      // Auto-commit is local-only (never pushes). Tolerate "nothing to commit".
      await runShell('git add -A >/dev/null 2>&1; git commit -m "' + String(message).replace(/"/g, '\\"') + '" >/dev/null 2>&1 || true', root, 30000)
    }

    async function gitInit(root) {
      await runShell('git init -q 2>/dev/null; git config user.email "bio-workbench@local" 2>/dev/null; git config user.name "bio-workbench" 2>/dev/null', root, 30000)
    }

    // ---------------------------------------------------------------------
    // Manifest read/write (the durable source of truth)
    // ---------------------------------------------------------------------
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
      const entries = await listDir(projectsRoot)
      const out = []
      for (const e of entries) {
        if (e.type !== 'directory') continue
        const m = await readManifest(projectsRoot + '/' + e.name)
        if (m) out.push({ name: m.name, root: m.root, cells: (m.cells || []).length, artifacts: (m.artifacts || []).length })
      }
      return out
    }

    // ---------------------------------------------------------------------
    // Environment snapshot (decision #3: environment.lock)
    // ---------------------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // Cell header contract (decision #9: declaration block = contract)
    // ---------------------------------------------------------------------
    function buildHeader(meta) {
      const comment = meta.language === 'R' ? '#' : '#'
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
      if (/\.(png|jpe?g|gif|webp|svg|pdf)$/.test(p)) return 'figure'
      if (/\.(tsv|csv|bed|bedgraph|bw|bigwig|narrowpeak|bam|bai|txt|json)$/.test(p)) return 'data'
      return 'file'
    }

    // ---------------------------------------------------------------------
    // Figure discovery (scoped to figures/ — reliable, not whole-tree sniffing)
    // ---------------------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // Business: init / run / feedback / rerun
    // ---------------------------------------------------------------------
    async function initProject(args) {
      const name = String(args && args.name ? args.name : 'project').replace(/[^A-Za-z0-9._-]/g, '_')
      const root = projectsRoot + '/' + name
      await mkdirs(root)
      const environment = await snapshotEnvironment(root, args && args.language)
      const manifest = emptyManifest(name, root, environment)
      await writeManifest(root, manifest)
      await gitInit(root)
      state.currentProject = { name, root }
      return { name, root, environment }
    }

    async function getProject(args) {
      // Resolve the project to serve: explicit name, or current, or the only one.
      let root = null
      if (args && args.name) root = projectsRoot + '/' + String(args.name).replace(/[^A-Za-z0-9._-]/g, '_')
      else if (state.currentProject) root = state.currentProject.root
      if (!root) {
        const projects = await listProjects()
        if (projects.length === 1) root = projects[0].root
      }
      if (!root) return { projects: await listProjects(), current: null }

      const manifest = await readManifest(root)
      if (!manifest) return { projects: await listProjects(), current: null }

      // Attach base64 figures for Client rendering (capped per image).
      const figures = []
      for (const art of manifest.artifacts || []) {
        if (art.kind !== 'figure') continue
        let mime = 'image/png'
        const p = art.path.toLowerCase()
        if (p.endsWith('.jpg') || p.endsWith('.jpeg')) mime = 'image/jpeg'
        else if (p.endsWith('.webp')) mime = 'image/webp'
        else if (p.endsWith('.gif')) mime = 'image/gif'
        else if (p.endsWith('.svg')) mime = 'image/svg+xml'
        try {
          const bytes = await readBytes(root + '/' + art.path, 3 * 1024 * 1024)
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
      const cur = state.currentProject
      if (!cur) throw new Error('no active project — call bio_init_project first')
      const root = cur.root
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

      const artifactPaths = []
      for (const rel of newFigurePaths) {
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
      const cur = state.currentProject
      if (!cur) throw new Error('no active project')
      const root = cur.root
      const manifest = await readManifest(root)
      if (!manifest) throw new Error('manifest missing')
      const art = (manifest.artifacts || []).find(function (a) { return a.path === args.artifactPath })
      if (!art) throw new Error('artifact not found: ' + args.artifactPath)
      art.feedback = art.feedback || []
      art.feedback.push({ at: new Date().toISOString(), text: String(args.text || '') })
      await writeManifest(root, manifest)
      await gitCommit(root, 'feedback on ' + args.artifactPath + ': ' + String(args.text || '').slice(0, 80))
      return { ok: true, artifactPath: args.artifactPath, feedbackCount: art.feedback.length }
    }

    async function rerunCell(args, signal) {
      const cur = state.currentProject
      if (!cur) throw new Error('no active project')
      const root = cur.root
      const manifest = await readManifest(root)
      if (!manifest) throw new Error('manifest missing')
      const prev = (manifest.cells || []).find(function (c) { return c.id === args.cellId })
      if (!prev) throw new Error('cell not found: ' + args.cellId)

      // Derive a versioned cell id (cell_0001 -> cell_0001_v2 -> cell_0001_v3 …).
      let version = 2
      const base = prev.id
      let newCellId = base + '_v' + version
      while ((manifest.cells || []).some(function (c) { return c.id === newCellId })) {
        version += 1
        newCellId = base + '_v' + version
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

      const artifactPaths = []
      for (const rel of newFigurePaths) {
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

    // ---------------------------------------------------------------------
    // Client RPC surface (harness.handle) — Client -> Host, lossless JSON
    // ---------------------------------------------------------------------
    harness.handle('getProject', function (args) { return getProject(args || {}) })
    harness.handle('listProjects', function () { return listProjects() })
    harness.handle('initProject', function (args) { return initProject(args || {}) })
    harness.handle('runCell', function (args) { return runCell(args || {}, undefined) })
    harness.handle('addFeedback', function (args) { return addFeedback(args || {}) })
    harness.handle('rerunCell', function (args) { return rerunCell(args || {}, undefined) })
    harness.handle('getCellCode', async function (args) {
      const cur = state.currentProject
      if (!cur) return null
      const manifest = await readManifest(cur.root)
      if (!manifest) return null
      const cell = (manifest.cells || []).find(function (c) { return c.id === (args && args.cellId) })
      if (!cell) return null
      const code = await readText(cur.root + '/' + cell.script)
      return { cellId: cell.id, script: cell.script, code: code || '' }
    })

    // ---------------------------------------------------------------------
    // Model-visible tools (agent calls these)
    // ---------------------------------------------------------------------
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
      'Create or open a reproducible bioinformatics analysis project. Creates the project directory skeleton (code/ data/ figures/), writes manifest.json, snapshots the Python/R environment into environment.lock, and git-inits the project. Call this before bio_run_cell.',
      {
        name: { type: 'string', required: true, description: 'Project directory name (sanitized to a safe folder name).' },
        language: { type: 'string', required: false, enum: ['python', 'R'], description: 'Primary analysis language; defaults to python.' }
      },
      function (args) { return initProject(args) })

    registerTool('bio_run_cell',
      'Run one self-contained analysis cell inside the active project. Writes a versioned script with a declaration header (cell id, params, seed, inputs/outputs), executes it in a fresh Python/R subprocess with cwd = project root, discovers figures written to figures/, registers artifacts with SHA-256 provenance into manifest.json, and git-commits. Figures are saved under figures/ (e.g. figures/result.png); declare extra non-figure outputs in `outputs`.',
      {
        title: { type: 'string', required: true, description: 'Short human-readable cell title.' },
        code: { type: 'string', required: true, description: 'The self-contained script body (no header needed). Write figures to figures/ using relative paths.' },
        language: { type: 'string', required: false, enum: ['python', 'R'], description: 'Language for this cell; defaults to python.' },
        params: { type: 'json', required: false, description: 'Analysis parameters recorded for reproducibility (object).' },
        seed: { type: 'integer', required: false, description: 'Random seed recorded for reproducibility; defaults to 42.' },
        inputs: { type: 'array', items: { type: 'string' }, required: false, description: 'Input data file paths (relative to project root) hashed into provenance.' },
        outputs: { type: 'array', items: { type: 'string' }, required: false, description: 'Expected non-figure output paths (figures/ is auto-discovered).' }
      },
      function (args, exec) { return runCell(args, exec && exec.signal) })

    registerTool('bio_add_feedback',
      'Record structured feedback on a produced artifact (e.g. a figure) into manifest.json and git-commit it. This is how a "redraw it" note becomes traceable iteration history.',
      {
        artifactPath: { type: 'string', required: true, description: 'Artifact path as listed in the manifest (e.g. figures/tss_profile.png).' },
        text: { type: 'string', required: true, description: 'The feedback text (what to change).' }
      },
      function (args) { return addFeedback(args) })

    registerTool('bio_get_project',
      'Return the active project summary: manifest cells, artifacts with provenance, and feedback/iteration history. Use to inspect what has been produced and how.',
      {},
      function () { return getProject({}) })

    registerTool('bio_list_projects',
      'List all reproducible bioinformatics projects under the projects root.',
      {},
      function () { return listProjects() })

    registerTool('bio_rerun_cell',
      'Re-run a cell with edited code as a new versioned cell (derived-from lineage recorded), re-discover figures, and register new artifacts. Use after feedback to regenerate a figure.',
      {
        cellId: { type: 'string', required: true, description: 'Id of the cell to re-run (e.g. cell_0001).' },
        editedCode: { type: 'string', required: true, description: 'The full replacement script body (header regenerated automatically).' }
      },
      function (args, exec) { return rerunCell(args, exec && exec.signal) })
  }
}
