#!/usr/bin/env bash
# End-to-end smoke test against a running dev host (scripts/dev.sh start).
#
# Exercises the whole Host contract the workbench depends on, without a browser:
#   listProjects -> setProjectsDir -> initProject -> runCell -> getProject
#   -> addFeedback -> rerunCell -> deleteCell -> markCellFinal
#
# Everything happens under .dev/smoke-projects, which is wiped first, so real
# projects are never touched. Exits non-zero if any assertion fails.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PORT=${BIOWB_DEV_PORT:-5691}
BASE="http://127.0.0.1:$PORT"
SMOKE_ROOT="$ROOT/.dev/smoke-projects"
fails=0

api() { # api <method>   (JSON payload on stdin)
  curl -sS -X POST "$BASE/biowb/$1" -H 'content-type: application/json' --data-binary @-
}

payload() { # payload <python dict literal>
  python3 -c "import json; print(json.dumps($1))"
}

check() { # check <label> <python-assertion-over-d>   (body on stdin)
  local label="$1" expr="$2" body
  body=$(cat)
  if printf '%s' "$body" | python3 -c "import json,sys
d=json.load(sys.stdin)
assert 'error' not in d, d
assert $expr, d" 2>/dev/null; then
    echo "  ok   $label"
  else
    echo "  FAIL $label"
    printf '       %.300s\n' "$body"
    fails=$((fails + 1))
  fi
}

say_ok() { echo "  ok   $1"; }
say_fail() { echo "  FAIL $1"; fails=$((fails + 1)); }

CELL_CODE='from pathlib import Path
Path("figures").mkdir(exist_ok=True)
Path("results").mkdir(exist_ok=True)
Path("figures/smoke.svg").write_text("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\"><rect width=\"20\" height=\"20\" fill=\"#333\"/></svg>")
Path("results/smoke.txt").write_text("ok\n")
print("smoke cell ran")'

V2_CODE='from pathlib import Path
Path("figures").mkdir(exist_ok=True)
Path("figures/smoke_v2.svg").write_text("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\"><circle cx=\"15\" cy=\"15\" r=\"10\" fill=\"#c33\"/></svg>")
print("smoke cell reran")'

echo "smoke: $BASE"
if ! curl -sS -o /dev/null --max-time 5 "$BASE/biowb/listProjects"; then
  echo "host not reachable — run scripts/dev.sh start first" >&2
  exit 1
fi

rm -rf "$SMOKE_ROOT"
mkdir -p "$SMOKE_ROOT"

echo "[1] listProjects"
out=$(payload '{}' | api listProjects)
check "returns a list" "isinstance(d, list)" <<<"$out"

echo "[2] setProjectsDir"
out=$(payload "{'dir': '$SMOKE_ROOT'}" | api setProjectsDir)
check "points at .dev/smoke-projects" "d.get('projectsRoot','').endswith('.dev/smoke-projects')" <<<"$out"

echo "[3] initProject"
out=$(payload "{'name': 'smoke'}" | api initProject)
check "project created" "d.get('name')=='smoke'" <<<"$out"
[ -d "$SMOKE_ROOT/smoke/.git" ] && say_ok "git repo initialised" || say_fail "git repo initialised"
[ -f "$SMOKE_ROOT/smoke/manifest.json" ] && say_ok "manifest.json written" || say_fail "manifest.json written"

echo "[4] runCell"
out=$(CELL_CODE="$CELL_CODE" python3 -c "import json,os; print(json.dumps({'name':'smoke','title':'smoke cell','code':os.environ['CELL_CODE']}))" | api runCell)
check "figure + results product registered" "d.get('status')=='ok' and any('figures/cell_0001_' in a for a in d.get('artifacts',[])) and any(a.startswith('results/') for a in d.get('artifacts',[]))" <<<"$out"

echo "[5] getProject"
out=$(payload '{"name":"smoke"}' | api getProject)
check "one cell, figure prefixed with cell id" "len(d['current']['manifest']['cells'])==1 and any('figures/cell_0001_' in a['path'] for a in d['current']['manifest']['artifacts'])" <<<"$out"

echo "[6] addFeedback"
out=$(payload "{'name':'smoke','artifactPath':'figures/cell_0001_smoke.svg','text':'redraw: make the square red'}" | api addFeedback)
check "feedback recorded on the artifact" "d.get('ok') is True and d.get('feedbackCount')==1" <<<"$out"

echo "[7] rerunCell"
out=$(recode="$V2_CODE" python3 -c "import json,os; print(json.dumps({'name':'smoke','cellId':'cell_0001','editedCode':os.environ['recode']}))" | api rerunCell)
check "derived cell version created" "d.get('cellId')=='cell_0001_v2'" <<<"$out"

echo "[8] markCellFinal + deleteCell"
out=$(payload "{'name':'smoke','cellId':'cell_0001_v2','final':True}" | api markCellFinal)
check "marked final" "d.get('final') is True" <<<"$out"
out=$(payload "{'name':'smoke','cellId':'cell_0001_v2'}" | api deleteCell)
check "final cell deleted" "d.get('ok') is True" <<<"$out"
out=$(payload '{"name":"smoke"}' | api getProject)
check "back to one cell" "len(d['current']['manifest']['cells'])==1" <<<"$out"

echo
if [ "$fails" -eq 0 ]; then
  echo "smoke: PASS"
else
  echo "smoke: $fails failed"
  exit 1
fi
