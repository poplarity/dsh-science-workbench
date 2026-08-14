// Client half of the dsh-bio-workbench dynamic Cordis Plugin.
// Plain-JavaScript function body returning a Cordis Plugin (no import/require/TS/JSX).

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const h = React.createElement

    styles.insert(`
      .biowb { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: var(--color-text, inherit); }
      .biowb h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; opacity: .7; }
      .biowb .panel { border: 1px solid var(--color-border, rgba(128,128,128,.25)); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
      .biowb .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .biowb .cell { border-left: 3px solid var(--color-accent, #4a9eff); padding: 8px 10px; margin: 8px 0; background: var(--color-surface-2, rgba(0,0,0,.03)); border-radius: 4px; }
      .biowb .cell.err { border-left-color: #e5484d; }
      .biowb .cell.pending { border-left-color: #b0b0b0; }
      .biowb .fig { max-width: 100%; border: 1px solid var(--color-border, rgba(128,128,128,.25)); border-radius: 6px; margin: 8px 0; }
      .biowb .btn { cursor: pointer; border: 1px solid var(--color-border, rgba(128,128,128,.4)); background: var(--color-surface-1, rgba(0,0,0,.04)); color: var(--color-text, inherit); border-radius: 6px; padding: 4px 10px; font-size: 12px; }
      .biowb .btn:hover { background: var(--color-surface-2, rgba(0,0,0,.08)); }
      .biowb .btn.primary { border-color: transparent; background: var(--color-accent, #4a9eff); color: #fff; }
      .biowb input[type=text], .biowb textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-border, rgba(128,128,128,.4)); border-radius: 6px; padding: 6px 8px; font-size: 12px; background: var(--color-surface-1, rgba(0,0,0,.02)); color: var(--color-text, inherit); }
      .biowb .muted { opacity: .62; font-size: 11px; }
      .biowb .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
      .biowb .kv { margin: 2px 0; }
      .biowb .tag { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 10px; margin-right: 4px; background: var(--color-surface-2, rgba(0,0,0,.08)); }
      .biowb .fb { border-top: 1px dashed var(--color-border, rgba(128,128,128,.3)); margin-top: 6px; padding-top: 6px; }
    `)

    // -------------------------------------------------------------------
    // Shared async-state hook: fetch the project, expose {data, refresh}
    // -------------------------------------------------------------------
    function useProject() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [loading, setLoading] = React.useState(false)

      function refresh() {
        setLoading(true)
        host.call('getProject', {}).then(function (d) {
          setData(d)
          setError(null)
        }).catch(function (e) {
          setError(String(e && e.message ? e.message : e))
        }).finally(function () {
          setLoading(false)
        })
      }

      React.useEffect(function () { refresh() }, [])
      return { data, error, loading, refresh }
    }

    function fmtTime(iso) {
      if (!iso) return ''
      try { return String(iso).replace('T', ' ').slice(0, 19) } catch (e) { return String(iso) }
    }

    function kv(label, value) {
      return h('div', { className: 'kv muted' }, label + ': ', h('span', { className: 'mono' }, typeof value === 'string' ? value : JSON.stringify(value)))
    }

    function Provenance(props) {
      const a = props.artifact || {}
      const cellId = a.producedBy || ''
      return h('div', { className: 'muted' },
        kv('产出 cell', cellId),
        kv('输入哈希', a.inputHashes || {}),
        kv('输出哈希', (a.outputHash || '').slice(0, 16) + '…'),
        kv('参数', a.params || {}),
        kv('seed', a.seed),
        a.derivedFrom && a.derivedFrom.length ? kv('派生自', a.derivedFrom.join(', ')) : null,
        kv('创建于', fmtTime(a.createdAt))
      )
    }

    // -------------------------------------------------------------------
    // FigureCard: image + provenance + feedback form + rerun editor
    // -------------------------------------------------------------------
    function FigureCard(props) {
      const fig = props.figure
      const art = fig.artifact || {}
      const [feedback, setFeedback] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [showProv, setShowProv] = React.useState(false)
      const [showRerun, setShowRerun] = React.useState(false)
      const [rerunCode, setRerunCode] = React.useState('')
      const [rerunMsg, setRerunMsg] = React.useState('')

      const src = fig.base64 ? ('data:' + fig.mime + ';base64,' + fig.base64) : null

      function submitFeedback() {
        if (!feedback.trim()) return
        host.call('addFeedback', { artifactPath: fig.path, text: feedback.trim() }).then(function () {
          setFeedback('')
          setMsg('反馈已记录 → 在对话里告诉 agent 如何修改，或用下方「重跑」编辑代码。')
          if (props.onChanged) props.onChanged()
        }).catch(function (e) { setMsg('失败: ' + (e && e.message ? e.message : e)) })
      }

      function openRerun() {
        const cellId = art.producedBy
        if (!cellId) return
        host.call('getCellCode', { cellId: cellId }).then(function (c) {
          setRerunCode(c && c.code ? c.code : '')
          setShowRerun(true)
        }).catch(function (e) { setRerunMsg('读取代码失败: ' + (e && e.message ? e.message : e)) })
      }

      function submitRerun() {
        const cellId = art.producedBy
        setRerunMsg('正在重跑…')
        host.call('rerunCell', { cellId: cellId, editedCode: rerunCode }).then(function (r) {
          setRerunMsg('已重跑: ' + r.cellId + ' (' + r.status + ')')
          setShowRerun(false)
          if (props.onChanged) props.onChanged()
        }).catch(function (e) { setRerunMsg('重跑失败: ' + (e && e.message ? e.message : e)) })
      }

      return h('div', { className: 'biowb' },
        h('div', { className: 'mono muted' }, fig.path),
        src ? h('img', { className: 'fig', src: src, alt: fig.path }) : h('div', { className: 'muted' }, '(无图像数据)'),
        h('div', { className: 'row' },
          h('button', { className: 'btn', onClick: function () { setShowProv(!showProv) } }, showProv ? '收起溯源' : '溯源'),
          h('button', { className: 'btn', onClick: openRerun }, '重跑')
        ),
        showProv ? h(Provenance, { artifact: art }) : null,
        h('div', { className: 'fb' },
          h('div', { className: 'row' },
            h('input', { type: 'text', value: feedback, placeholder: '反馈：改 x 轴 / 换配色 / 加 p 值…', onChange: function (e) { setFeedback(e.target.value) } }),
            h('button', { className: 'btn primary', onClick: submitFeedback }, '记录反馈')
          ),
          msg ? h('div', { className: 'muted' }, msg) : null,
          (art.feedback && art.feedback.length) ? h('div', { className: 'muted' },
            (art.feedback || []).map(function (f, i) {
              return h('div', { key: i }, '· ', f.text, ' (', fmtTime(f.at), ')')
            })
          ) : null
        ),
        showRerun ? h('div', { className: 'fb' },
          h('textarea', { rows: 8, value: rerunCode, onChange: function (e) { setRerunCode(e.target.value) } }),
          h('div', { className: 'row', style: { marginTop: 6 } },
            h('button', { className: 'btn primary', onClick: submitRerun }, '运行编辑后的代码'),
            h('button', { className: 'btn', onClick: function () { setShowRerun(false) } }, '取消')
          ),
          rerunMsg ? h('div', { className: 'muted' }, rerunMsg) : null
        ) : null
      )
    }

    // -------------------------------------------------------------------
    // BioWorkbench: the three-panel tab (notebook / artifacts / iterations)
    // -------------------------------------------------------------------
    function BioWorkbench() {
      const { data, error, loading, refresh } = useProject()
      const [name, setName] = React.useState('demo')

      function initProject() {
        host.call('initProject', { name: name }).then(function () { refresh() }).catch(function (e) { console.error(e) })
      }

      if (loading && !data) return h('div', { className: 'biowb muted' }, '加载中…')
      if (error) return h('div', { className: 'biowb muted' }, '错误: ', error)
      const cur = data && data.current

      if (!cur) {
        return h('div', { className: 'biowb' },
          h('div', { className: 'panel' },
            h('h3', null, '初始化分析项目'),
            h('div', { className: 'row' },
              h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value) } }),
              h('button', { className: 'btn primary', onClick: initProject }, '创建项目')
            ),
            h('div', { className: 'muted' }, '项目将创建在 <workspace>/bio-projects/ 下，含 code/ data/ figures/ 与 manifest.json，并 git init + 环境快照。')
          )
        )
      }

      const manifest = cur.manifest || {}
      const cells = manifest.cells || []
      const artifacts = manifest.artifacts || []

      // Iterations = feedback entries + derivedFrom lineage
      const iterations = []
      for (const a of artifacts) {
        for (const f of (a.feedback || [])) iterations.push({ artifact: a.path, at: f.at, text: f.text, kind: 'feedback' })
        if (a.derivedFrom && a.derivedFrom.length) iterations.push({ artifact: a.path, at: a.createdAt, text: '派生自 ' + a.derivedFrom.join(', '), kind: 'derive' })
      }

      return h('div', { className: 'biowb' },
        h('div', { className: 'row' },
          h('strong', null, '项目: ' + cur.name),
          h('span', { className: 'muted mono' }, cur.root),
          h('button', { className: 'btn', onClick: refresh }, loading ? '刷新中…' : '刷新')
        ),

        h('div', { className: 'panel' },
          h('h3', null, '① Notebook（cells）'),
          cells.length === 0 ? h('div', { className: 'muted' }, '还没有 cell。在对话里让 agent 用 bio_run_cell 跑一段分析。') : null,
          cells.map(function (c) {
            return h('div', { className: 'cell ' + (c.status === 'error' ? 'err' : (c.status === 'pending' ? 'pending' : '')), key: c.id },
              h('div', { className: 'row' },
                h('span', { className: 'mono' }, c.id),
                h('strong', null, c.title),
                h('span', { className: 'tag' }, c.status),
                c.derivedFrom ? h('span', { className: 'muted' }, '← ' + c.derivedFrom) : null
              ),
              h('div', { className: 'muted mono' }, c.script),
              (c.artifacts && c.artifacts.length) ? h('div', { className: 'muted' }, '产物: ' + c.artifacts.join(', ')) : null,
              c.stderrTail ? h('pre', { className: 'muted mono', style: { whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' } }, c.stderrTail) : null
            )
          })
        ),

        h('div', { className: 'panel' },
          h('h3', null, '② 产物（Artifacts）'),
          artifacts.length === 0 ? h('div', { className: 'muted' }, '暂无产物。') : null,
          artifacts.map(function (a) {
            return h('div', { key: a.path },
              h('div', { className: 'row' },
                h('span', { className: 'mono' }, a.path),
                h('span', { className: 'tag' }, a.kind),
                h('span', { className: 'muted' }, 'by ' + a.producedBy)
              ),
              h(Provenance, { artifact: a })
            )
          })
        ),

        h('div', { className: 'panel' },
          h('h3', null, '③ 反馈与迭代（Feedback / lineage）'),
          iterations.length === 0 ? h('div', { className: 'muted' }, '还没有反馈记录。') : null,
          iterations.map(function (it, i) {
            return h('div', { key: i, className: 'muted' },
              h('span', { className: 'tag' }, it.kind),
              h('span', { className: 'mono' }, it.artifact),
              ' — ', it.text,
              h('span', null, ' (', fmtTime(it.at), ')')
            )
          })
        )
      )
    }

    // -------------------------------------------------------------------
    // BioRunCellCard: inline card in the conversation flow
    // -------------------------------------------------------------------
    function BioRunCellCard() {
      const { data, error, refresh } = useProject()
      const cur = data && data.current
      const figures = cur && cur.figures ? cur.figures.slice().reverse() : []

      return h('div', { className: 'biowb' },
        error ? h('div', { className: 'muted' }, '错误: ', error) : null,
        figures.length === 0 ? h('div', { className: 'muted' }, '（暂无图 — 用 bio_run_cell 出图后在此内联显示）') : null,
        figures.map(function (f) {
          return h(FigureCard, { key: f.path, figure: f, onChanged: refresh })
        })
      )
    }

    // -------------------------------------------------------------------
    // Slot registrations
    // -------------------------------------------------------------------
    slots.inject('conversation.view', function () {
      slots.register(
        { name: 'conversation.view', id: 'bio-workbench', order: 20, label: '分析工作台' },
        function () { return h(BioWorkbench) }
      )
    })

    slots.inject('tool.call.toolview', function () {
      slots.register(
        { name: 'tool.call.toolview', key: 'bio_run_cell' },
        function () { return h(BioRunCellCard) }
      )
    })
  }
}
