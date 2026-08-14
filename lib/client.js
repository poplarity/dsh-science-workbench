// Browser Client half of dsh-science, hand-written in the
// `window.__ModuleLoader__.load` bundle format the DSH client-modules scan
// serves at /plugins/dsh-science/client.js. It talks to the Host half
// over same-origin fetch('/biowb/...') (no typert Remote bridge), so it does
// NOT depend on the harness monorepo build.

window.__ModuleLoader__.load({
  id: "dsh-science",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var name = "dsh-science";
    var inject = ["slots"];

    var CSS = "\n.biowb { font-family: var(--dsw-font-family, ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif); color: var(--dsw-alias-label-primary); line-height: 1.55; font-size: 13px; padding: 4px 12px 8px; }\n.biowb * { box-sizing: border-box; }\n.biowb-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }\n.biowb-title { font-size: 14px; font-weight: 600; }\n.biowb-section { border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; padding: 16px; margin-bottom: 14px; background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-shadow-lv2, 0 2px 8px rgba(15,17,21,.06)); }\n.biowb-section > h3 { margin: 0 0 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dsw-alias-label-secondary); font-weight: 600; }\n.biowb-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.biowb-cols { display: flex; gap: 14px; align-items: flex-start; }\n.biowb-col-left { flex: 0 0 300px; }\n.biowb-col-right { flex: 1 1 auto; min-width: 0; }\n@media (max-width: 720px) { .biowb-cols { flex-direction: column; } .biowb-col-left { flex: 1 1 auto; width: 100%; } }\n.biowb-fig { max-width: 100%; max-height: 640px; display: block; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; margin: 10px 0; cursor: zoom-in; }\n.biowb-pdf { width: 100%; height: 560px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; margin: 10px 0; background: #fff; cursor: zoom-in; }\n.biowb-btn { cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 500; line-height: 1.4; transition: background .12s ease, border-color .12s ease; }\n.biowb-btn:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l2); }\n.biowb-btn.primary { border-color: transparent; background: var(--dsw-alias-button-info-fill); color: #fff; }\n.biowb-btn.primary:hover { background: var(--dsw-alias-button-info-hover, var(--dsw-alias-button-info-fill)); }\n.biowb-input, .biowb-textarea, .biowb-select { border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 7px 14px; font-size: 12px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); transition: border-color .12s ease; }\n.biowb-input:focus, .biowb-textarea:focus, .biowb-select:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }\n.biowb-input { width: 100%; }\n.biowb-muted { color: var(--dsw-alias-label-secondary); font-size: 11px; }\n.biowb-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }\n.biowb-tag { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 10px; font-weight: 600; line-height: 1.5; }\n.biowb-tag.ok { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }\n.biowb-tag.error { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }\n.biowb-tag.kind { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }\n.biowb-step { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 10px 14px; margin-bottom: 8px; cursor: pointer; background: var(--dsw-alias-bg-layer-2); transition: border-color .12s ease, background .12s ease; }\n.biowb-step:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }\n.biowb-step.active { border-color: var(--dsw-alias-state-business-primary); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent); }\n.biowb-kv { display: flex; gap: 10px; margin: 3px 0; }\n.biowb-kv-key { flex: 0 0 74px; color: var(--dsw-alias-label-secondary); }\n.biowb-step-title { font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.biowb-spacer { flex: 1 1 auto; }\n.biowb-fb-list { margin: 6px 0; }\n.biowb-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); padding: 12px; border-radius: 10px; overflow: auto; max-height: 240px; white-space: pre-wrap; margin: 8px 0; }\n.biowb-seg { display: inline-flex; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 2px; }\n.biowb-seg-item { border: none; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 4px 14px; font-size: 12px; cursor: pointer; transition: background .12s ease, color .12s ease; }\n.biowb-seg-item.active { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 2px rgba(15,17,21,.08); }\n.biowb-iconbtn { cursor: pointer; border: none; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 6px 9px; font-size: 13px; line-height: 1; transition: background .12s ease, color .12s ease; }\n.biowb-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }\n.biowb-lb { position: fixed; inset: 0; background: rgba(0,0,0,.82); display: flex; align-items: center; justify-content: center; z-index: 9999; cursor: zoom-out; }\n.biowb-lb-img { max-width: 92vw; max-height: 92vh; border-radius: 12px; cursor: default; box-shadow: 0 8px 40px rgba(0,0,0,.5); }\n.biowb-lb-pdf { width: 88vw; height: 88vh; border: none; border-radius: 12px; background: #fff; cursor: default; }\n.biowb-lb-close { position: fixed; top: 18px; right: 20px; background: rgba(255,255,255,.14); border: none; color: #fff; font-size: 20px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; }\n";

    var h = react.createElement;

    function apply(ctx) {
      var slots = ctx.slots;
      if (slots === undefined) return;

      if (typeof document !== "undefined" && document.querySelector("style[data-biowb-css]") === null) {
        var tag = document.createElement("style");
        tag.setAttribute("data-biowb-css", "1");
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }

      function httpCall(method, args) {
        return fetch("/biowb/" + method, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args || {})
        }).then(function (r) {
          return r.json().catch(function () { return null });
        });
      }

      function useProject() {
        var dataState = react.useState(null);
        var data = dataState[0], setData = dataState[1];
        var selState = react.useState(null);
        var selectedName = selState[0], setSelectedName = selState[1];
        var errState = react.useState(null);
        var error = errState[0], setError = errState[1];
        var loadState = react.useState(false);
        var loading = loadState[0], setLoading = loadState[1];

        function fetch(name) {
          setLoading(true);
          httpCall("getProject", name ? { name: name } : {}).then(function (d) {
            setData(d);
            setError(null);
            if (!name) {
              if (d && d.current && d.current.name) setSelectedName(d.current.name);
              else if (d && d.projects && d.projects.length === 1) setSelectedName(d.projects[0].name);
            }
          }).catch(function (e) {
            setError(String(e && e.message ? e.message : e));
          }).finally(function () {
            setLoading(false);
          });
        }

        function call(method, args) {
          var a = Object.assign({}, args || {});
          if (selectedName && a.name === undefined) a.name = selectedName;
          return httpCall(method, a);
        }

        function select(name) { setSelectedName(name); fetch(name); }

        function createProject(newName) {
          return httpCall("initProject", { name: newName }).then(function () {
            setSelectedName(newName);
            return fetch(newName);
          });
        }

        function setDir(dir) {
          return httpCall("setProjectsDir", { dir: dir }).then(function () {
            setSelectedName(null);
            return fetch(null);
          });
        }

        function reveal(path, isDir) {
          return call("revealInFinder", { path: path, isDir: isDir }).catch(function (e) { console.error(e); });
        }

        function refresh() { fetch(selectedName); }

        react.useEffect(function () { fetch(null); }, []);

        var projects = (data && data.projects) || [];
        return { data: data, error: error, loading: loading, selectedName: selectedName, projects: projects, select: select, createProject: createProject, setDir: setDir, reveal: reveal, refresh: refresh, call: call };
      }

      function fmtTime(iso) {
        if (!iso) return "";
        try { return String(iso).replace("T", " ").slice(0, 19); } catch (e) { return String(iso); }
      }

      function figureOf(figures, path) {
        if (!figures) return null;
        for (var i = 0; i < figures.length; i++) if (figures[i].path === path) return figures[i];
        return null;
      }

      function Lightbox(props) {
        if (!props.item) return null;
        var it = props.item;
        return h("div", { className: "biowb-lb", onClick: props.onClose },
          it.mime === "application/pdf"
            ? h("iframe", { className: "biowb-lb-pdf", src: it.src, title: "preview", onClick: function (e) { e.stopPropagation(); } })
            : h("img", { className: "biowb-lb-img", src: it.src, alt: "preview", onClick: function (e) { e.stopPropagation(); } }),
          h("button", { className: "biowb-lb-close", onClick: props.onClose }, "✕")
        );
      }

      function FigureImage(props) {
        var f = props.figure;
        if (!f || !f.base64) return h("div", { className: "biowb-muted" }, "(无预览)");
        var src = "data:" + f.mime + ";base64," + f.base64;
        if (f.mime === "application/pdf") {
          return h("iframe", { className: "biowb-pdf", src: src, title: f.path, onClick: function () { props.onZoom({ src: src, mime: f.mime }); } });
        }
        return h("img", { className: "biowb-fig", src: src, alt: f.path, onClick: function () { props.onZoom({ src: src, mime: f.mime }); } });
      }

      function kv(label, value) {
        return h("div", { className: "biowb-kv" },
          h("span", { className: "biowb-kv-key" }, label),
          h("span", { className: "biowb-mono" }, typeof value === "string" ? value : JSON.stringify(value)));
      }

      function Provenance(props) {
        var a = props.artifact || {};
        return h("div", { className: "biowb-muted" },
          kv("产出 cell", a.producedBy || ""),
          kv("输出哈希", (a.outputHash || "").slice(0, 18) + "…"),
          kv("参数", a.params || {}),
          kv("seed", a.seed),
          a.derivedFrom && a.derivedFrom.length ? kv("派生自", a.derivedFrom.join(", ")) : null,
          kv("创建于", fmtTime(a.createdAt))
        );
      }

      function FeedbackBox(props) {
        var textState = react.useState("");
        var text = textState[0], setText = textState[1];
        var msgState = react.useState("");
        var msg = msgState[0], setMsg = msgState[1];

        function submit() {
          var t = text.trim();
          if (!t) return;
          props.call("addFeedback", { artifactPath: props.artifactPath, text: t }).then(function () {
            setText("");
            setMsg("已记录并发送给 agent");
            if (props.inputActions) {
              try {
                props.inputActions.setDraft("用户对 " + props.artifactPath + " 的反馈：" + t + "。请据此修改代码并重跑出图。");
                props.inputActions.submit();
              } catch (e) {}
            }
            if (props.onChanged) props.onChanged();
          }).catch(function (e) { setMsg("失败: " + (e && e.message ? e.message : e)); });
        }

        return h("div", { style: { marginTop: 10 } },
          (props.feedback && props.feedback.length) ? h("div", { className: "biowb-fb-list" },
            (props.feedback || []).map(function (f, i) {
              return h("div", { key: i, className: "biowb-muted" }, "💬 ", f.text, " · ", fmtTime(f.at));
            })
          ) : null,
          h("div", { className: "biowb-row", style: { marginTop: 4 } },
            h("input", { className: "biowb-input", type: "text", value: text, placeholder: "反馈：改 x 轴 / 换配色 / 加 p 值…", onChange: function (e) { setText(e.target.value); } }),
            h("button", { className: "biowb-btn primary", onClick: submit }, "让 agent 重画")
          ),
          msg ? h("div", { className: "biowb-muted" }, msg) : null
        );
      }

      function ArtifactDetail(props) {
        var art = props.artifact;
        var fig = figureOf(props.figures, art.path);
        var panelState = react.useState(null);
        var panel = panelState[0], setPanel = panelState[1];
        var codeState = react.useState(null);
        var code = codeState[0], setCode = codeState[1];

        function toggleCode() {
          if (panel !== "code") {
            if (code === null) {
              props.call("getCellCode", { cellId: art.producedBy }).then(function (r) {
                setCode(r && r.code ? r.code : "(无代码)");
              }).catch(function () { setCode("(读取失败)"); });
            }
            setPanel("code");
          } else {
            setPanel(null);
          }
        }

        return h("div", { style: { padding: "6px 0 12px" } },
          h("div", { className: "biowb-row" },
            h("span", { className: "biowb-mono" }, art.path),
            h("span", { className: "biowb-tag kind" }, art.kind),
            h("span", { className: "biowb-muted" }, "by " + art.producedBy),
            h("span", { className: "biowb-spacer" }),
            h("button", { className: "biowb-btn", onClick: function () { props.reveal(art.path, false); } }, "📁 " + (props.fmLabel || "Finder"))
          ),
          fig ? h(FigureImage, { figure: fig, onZoom: props.onZoom }) : null,
          h("div", { className: "biowb-row", style: { marginTop: 6 } },
            h("div", { className: "biowb-seg" },
              h("button", { className: "biowb-seg-item" + (panel === "prov" ? " active" : ""), onClick: function () { setPanel(panel === "prov" ? null : "prov"); } }, "溯源"),
              h("button", { className: "biowb-seg-item" + (panel === "code" ? " active" : ""), onClick: toggleCode }, "代码")
            )
          ),
          panel === "prov" ? h(Provenance, { artifact: art }) : null,
          panel === "code" ? h("pre", { className: "biowb-code" }, code) : null,
          art.kind === "figure" ? h(FeedbackBox, { artifactPath: art.path, feedback: art.feedback, call: props.call, inputActions: props.inputActions, onChanged: props.onChanged }) : null
        );
      }

      function StepItem(props) {
        var c = props.cell;
        return h("div", { className: "biowb-step" + (props.active ? " active" : ""), onClick: function () { props.onSelect(c.id); } },
          h("div", { className: "biowb-row" },
            h("span", { className: "biowb-mono" }, c.id),
            h("span", { className: "biowb-tag " + (c.status === "error" ? "error" : "ok") }, c.status)
          ),
          h("div", { className: "biowb-step-title" }, c.title),
          c.derivedFrom ? h("div", { className: "biowb-muted" }, "← " + c.derivedFrom) : null
        );
      }

      function DeleteCellButton(props) {
        var confirmState = react.useState(false);
        var confirming = confirmState[0], setConfirming = confirmState[1];
        if (!confirming) {
          return h("button", { className: "biowb-btn", onClick: function () { setConfirming(true); } }, "删除");
        }
        return h("div", { className: "biowb-row" },
          h("span", { className: "biowb-muted" }, "删除该步骤及其产物？"),
          h("button", { className: "biowb-btn primary", onClick: function () { props.onDelete(); setConfirming(false); } }, "确定"),
          h("button", { className: "biowb-btn", onClick: function () { setConfirming(false); } }, "取消")
        );
      }

      function ProjectHeader(props) {
        var showNewState = react.useState(false);
        var showNew = showNewState[0], setShowNew = showNewState[1];
        var showDirState = react.useState(false);
        var showDir = showDirState[0], setShowDir = showDirState[1];
        var newNameState = react.useState("");
        var newName = newNameState[0], setNewName = newNameState[1];
        var dirState = react.useState("");
        var dir = dirState[0], setDir = dirState[1];

        function create() {
          var n = newName.trim();
          if (!n) return;
          props.createProject(n).then(function () { setShowNew(false); setNewName(""); }).catch(function (e) { console.error(e); });
        }

        function applyDir() {
          var d = dir.trim();
          if (!d) return;
          props.setDir(d).then(function () { setShowDir(false); setDir(""); }).catch(function (e) { console.error(e); });
        }

        return h("div", null,
          h("div", { className: "biowb-head" },
            h("span", { className: "biowb-title" }, "项目"),
            h("select", { className: "biowb-select", value: props.selectedName || "", onChange: function (e) { props.select(e.target.value); } },
              (props.projects || []).map(function (p) { return h("option", { key: p.name, value: p.name }, p.name); })
            ),
            h("button", { className: "biowb-btn", onClick: function () { setShowNew(!showNew); setShowDir(false); } }, showNew ? "取消" : "＋ 新建"),
            h("span", { className: "biowb-spacer" }),
            h("button", { className: "biowb-iconbtn", title: "设置存储目录", onClick: function () { setShowDir(!showDir); setShowNew(false); } }, "⚙"),
            h("button", { className: "biowb-iconbtn", title: "在" + (props.fmLabel || "Finder") + "打开项目目录", onClick: function () { props.reveal("", true); } }, "📁"),
            h("button", { className: "biowb-iconbtn", title: "刷新", onClick: props.refresh }, props.loading ? "…" : "↻")
          ),
          showNew ? h("div", { className: "biowb-row", style: { marginBottom: 12 } },
            h("input", { className: "biowb-input", type: "text", value: newName, placeholder: "项目名（如 chip_tss）", style: { maxWidth: 240 }, onChange: function (e) { setNewName(e.target.value); } }),
            h("button", { className: "biowb-btn primary", onClick: create }, "创建")
          ) : null,
          showDir ? h("div", { className: "biowb-row", style: { marginBottom: 12 } },
            h("input", { className: "biowb-input", type: "text", value: dir, placeholder: "绝对路径，如 ~/bio-projects", style: { maxWidth: 420 }, onChange: function (e) { setDir(e.target.value); } }),
            h("button", { className: "biowb-btn primary", onClick: applyDir }, "设置目录")
          ) : null
        );
      }

      function BioWorkbench(props) {
        var p = useProject();
        var cur = p.data && p.data.current;
        var cells = cur ? (cur.manifest.cells || []) : [];
        var figures = cur ? (cur.figures || []) : [];
        var cellState = react.useState(null);
        var selectedCellId = cellState[0], setSelectedCellId = cellState[1];
        var lbState = react.useState(null);
        var lightbox = lbState[0], setLightbox = lbState[1];
        var fmLabel = (p.data && p.data.platform === "win32") ? "资源管理器" : "Finder";

        var effectiveCellId = selectedCellId && cells.some(function (c) { return c.id === selectedCellId; })
          ? selectedCellId
          : (cells.length ? cells[cells.length - 1].id : null);

        var selectedCell = cells.find(function (c) { return c.id === effectiveCellId; });

        if (p.loading && !p.data) return h("div", { className: "biowb" }, h("div", { className: "biowb-muted" }, "加载中…"));
        if (p.error) return h("div", { className: "biowb" }, h("div", { className: "biowb-muted" }, "错误: ", p.error));

        return h("div", { className: "biowb" },
          h(Lightbox, { item: lightbox, onClose: function () { setLightbox(null); } }),

          h(ProjectHeader, {
            projects: p.projects, selectedName: p.selectedName, select: p.select,
            createProject: p.createProject, setDir: p.setDir, reveal: p.reveal,
            refresh: p.refresh, loading: p.loading, fmLabel: fmLabel
          }),

          p.projects.length === 0 ? h("div", { className: "biowb-section" },
            h("div", { className: "biowb-muted" }, "还没有项目。点「＋ 新建」创建第一个，或在对话里让 agent 用 bio_init_project。")
          ) : (!cur ? h("div", { className: "biowb-section" },
            h("div", { className: "biowb-muted" }, "请从下拉选择一个项目。")
          ) : h("div", null,
            h("div", { className: "biowb-cols" },
              h("div", { className: "biowb-col-left biowb-section" },
                h("h3", null, "分析步骤"),
                cells.length === 0 ? h("div", { className: "biowb-muted" }, "暂无步骤。") : null,
                cells.map(function (c) {
                  return h(StepItem, { key: c.id, cell: c, active: c.id === effectiveCellId, onSelect: setSelectedCellId });
                })
              ),
              h("div", { className: "biowb-col-right biowb-section" },
                h("h3", null, "产物详情"),
                selectedCell ? h("div", null,
                  h("div", { className: "biowb-row", style: { marginBottom: 6 } },
                    h("span", { className: "biowb-mono" }, selectedCell.id),
                    h("strong", null, selectedCell.title),
                    h("span", { className: "biowb-spacer" }),
                    h("button", { className: "biowb-btn", onClick: function () { p.reveal(selectedCell.script, false); } }, "脚本"),
                    h(DeleteCellButton, { onDelete: function () { p.call("deleteCell", { cellId: selectedCell.id }).then(function () { setSelectedCellId(null); p.refresh(); }); } })
                  ),
                  (selectedCell.artifacts && selectedCell.artifacts.length)
                    ? selectedCell.artifacts.map(function (ap) {
                        var art = (cur.manifest.artifacts || []).find(function (a) { return a.path === ap; });
                        return art ? h(ArtifactDetail, { key: ap, artifact: art, figures: figures, call: p.call, inputActions: props.inputActions, onChanged: p.refresh, reveal: p.reveal, onZoom: setLightbox, fmLabel: fmLabel }) : null;
                      })
                    : h("div", { className: "biowb-muted" }, "该步骤暂无产物。")
                ) : h("div", { className: "biowb-muted" }, "选择左侧步骤查看详情。")
              )
            )
          ))
        );
      }

      function BioRunCellCard(props) {
        var p = useProject();
        var cur = p.data && p.data.current;
        var figures = cur && cur.figures ? cur.figures.slice().reverse() : [];
        var lbState = react.useState(null);
        var lightbox = lbState[0], setLightbox = lbState[1];
        var fmLabel = (p.data && p.data.platform === "win32") ? "资源管理器" : "Finder";

        return h("div", { className: "biowb" },
          h(Lightbox, { item: lightbox, onClose: function () { setLightbox(null); } }),
          p.error ? h("div", { className: "biowb-muted" }, "错误: ", p.error) : null,
          figures.length === 0 ? h("div", { className: "biowb-muted" }, "（暂无图 — 用 bio_run_cell 出图后在此内联显示）") : null,
          figures.map(function (f) {
            return h(ArtifactDetail, { key: f.path, artifact: f.artifact, figures: figures, call: p.call, inputActions: props.inputActions, onChanged: p.refresh, reveal: p.reveal, onZoom: setLightbox, fmLabel: fmLabel });
          })
        );
      }

      slots.inject("conversation.view", function () {
        slots.register(
          { name: "conversation.view", id: "dsh-science", order: 20, label: "分析工作台" },
          function (props) { return h(BioWorkbench, { inputActions: props && props.inputActions }); }
        );
      });

      slots.inject("tool.call.toolview", function () {
        slots.register(
          { name: "tool.call.toolview", key: "bio_run_cell" },
          function (props) { return h(BioRunCellCard, { inputActions: props && props.inputActions }); }
        );
      });
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
