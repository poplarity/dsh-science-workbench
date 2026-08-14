# dsh-science

English | [中文](README.zh.md)

A reproducible science workbench plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): Jupyter-style cells and inline figures, driven by an agent, with Nextflow/nf-core-grade provenance.

> **Core promise**: every figure and artifact is traceable and replayable — you can answer "it = which code + which inputs + which environment + which params/seed", and re-run it in one click.

## Features

- **Code → figure → feedback → redraw**: the agent runs a self-contained cell to produce figures shown inline; structured feedback is attached to each figure, and `bio_rerun_cell` produces a derived version (v1 → v2 → v3).
- **Artifact management**: each project is a directory with a plain-text `manifest.json` ledger (cells + artifacts + provenance + feedback).
- **Reproducible**: self-contained scripts + fresh subprocess + `environment.lock` + SHA-256 input/output hashes + fixed seed.
- **Git versioned**: each project is auto `git init`-ed; every step is auto-committed locally (never pushed).
- **Cross-platform**: the Host shell layer switches dialect per platform — bash on macOS/Linux, PowerShell on Windows; the Python interpreter auto-uses `python` on Windows and `python3` on POSIX.

## Tools

Eight agent tools: `bio_init_project`, `bio_run_cell`, `bio_rerun_cell`, `bio_add_feedback`, `bio_get_project`, `bio_list_projects`, `bio_set_projects_dir`, `bio_delete_cell` — plus the "Analysis workbench" web tab (inline figures, feedback, provenance, delete cell).

## Install

This is a dual-face DSH plugin (Host + Client). Installed as a profile bundle, the tools become globally available, the workbench tab appears globally, and the plugin shows up under Settings → Plugins.

```bash
# 1. Symlink this repo into the profile's node_modules fallback
ln -sfn /path/to/dsh-science "$HOME/.dsh/profiles/node_modules/dsh-science"

# 2. Add "dsh-science" to dsh.profile.bundles in the profile package.json
#    ($HOME/.dsh/profiles/<profile>/package.json)

# 3. Restart dsh web
```

After restart, open any new session: the `bio_*` tools are in the tool list, the "Analysis workbench" tab is in the conversation page, and the plugin is visible in Settings.

## Usage flow

1. `bio_init_project` — create a project.
2. `bio_run_cell` — run an analysis cell and write figures to `figures/`.
3. Review the inline figure → `bio_add_feedback` to record → `bio_rerun_cell` to redraw with edits.
4. Open the "Analysis workbench" tab for the notebook / artifacts / feedback view.

## Directory structure

```
lib/index.js         Host half: execution / manifest ledger / tools / HTTP data routes
lib/client.js        Client half: workbench tab (browser bundle, fetches /biowb/*)
index.js             entry re-export (profile out-of-tree resolution fallback)
cordis.patch.yml     bundle patch (inserts the dsh-science row)
skills/              convention skill
docs/                design doc
examples/            example analysis project
```

## Data flow

- The Host is the single source of truth: project data, manifest and provenance live on disk (`~/bio-projects/<name>/`).
- The Client is a pure projection: the browser reads/writes over same-origin `fetch('/biowb/<method>')`, served by the Host through the `webServer` service — no typert Remote bridge, so no harness monorepo build is required.

## License

MIT
