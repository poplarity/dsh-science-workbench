#!/usr/bin/env bash
# Local development server for dsh-science-workbench.
#
#   scripts/dev.sh start     boot a host on BIOWB_DEV_PORT (default 5691)
#   scripts/dev.sh stop      stop it
#   scripts/dev.sh restart   host-half code change -> restart (3-5 s)
#   scripts/dev.sh status    pid + url + last log line
#   scripts/dev.sh url       print the tokenized URL
#   scripts/dev.sh log       follow the server log
#
# The server boots the `web` profile, whose dsh-science-workbench dependency is
# a `link:` to this checkout, so it always runs the working tree. It runs from
# .dev/ so project data and settings stay out of the repo and out of the
# desktop app's workspace.
#
# The Client half (lib/client.js) does NOT need a restart: the Host watches the
# bundle and pushes a `rebuilt` event over /plugins/events, so an open page
# swaps the plugin in place. Restart only for lib/index.js changes.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PORT=${BIOWB_DEV_PORT:-5691}
PROFILE=${BIOWB_DEV_PROFILE:-web}
RUN_DIR="$ROOT/.dev"
LOG="$RUN_DIR/dev-server.log"
PIDFILE="$RUN_DIR/dev-server.pid"
URL_RE="http://127[.]0[.]0[.]1:$PORT/[?]token=[A-Za-z0-9_-]*"

mkdir -p "$RUN_DIR"

is_running() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null || true)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

print_url() {
  local url
  url=$(grep -oE "$URL_RE" "$LOG" 2>/dev/null | tail -1 || true)
  if [ -n "$url" ]; then
    echo "$url"
  else
    echo "(no URL yet - see $LOG)"
  fi
}

start() {
  if is_running; then
    echo "already running (pid $(cat "$PIDFILE"))"
    print_url
    return 0
  fi
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $PORT is already in use; set BIOWB_DEV_PORT to another port" >&2
    return 1
  fi
  : > "$LOG"
  ( cd "$RUN_DIR" && exec dsh --profile "$PROFILE" --port "$PORT" --no-open ) >> "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  local i
  for i in $(seq 1 120); do
    if grep -qE "$URL_RE" "$LOG" 2>/dev/null; then break; fi
    if ! is_running; then
      echo "server died during boot; last lines:" >&2
      tail -20 "$LOG" >&2
      return 1
    fi
    sleep 0.5
  done
  echo "started (pid $(cat "$PIDFILE"), profile $PROFILE, port $PORT)"
  print_url
}

stop() {
  if is_running; then
    local pid
    pid=$(cat "$PIDFILE")
    kill "$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 40); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -9 "$pid" 2>/dev/null || true
    echo "stopped (pid $pid)"
  else
    echo "not running"
  fi
  rm -f "$PIDFILE"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status)
    if is_running; then
      echo "running (pid $(cat "$PIDFILE"), port $PORT)"
      print_url
    else
      echo "not running"
    fi
    ;;
  url) print_url ;;
  log) tail -f "$LOG" ;;
  *) echo "usage: $0 {start|stop|restart|status|url|log}" >&2; exit 2 ;;
esac
