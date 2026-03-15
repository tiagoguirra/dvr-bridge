#!/usr/bin/env bash
# DVR Proxy CLI
# Usage: dvr.sh <command> [args...]

set -eu

CONFIG_FILE="${DVR_CONFIG:-$(dirname "$0")/dvr.conf}"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a; source "$CONFIG_FILE"; set +a
fi

: "${DVR_URL:?Set DVR_URL or configure $CONFIG_FILE}"

cmd="${1:-help}"
shift || true

api() {
  local url="$1"; shift || true
  local -a args=(curl -sS --max-time 15)
  if [[ -n "${CF_CLIENT_ID:-}" ]]; then
    args+=(-H "CF-Access-Client-Id: $CF_CLIENT_ID")
  fi
  if [[ -n "${CF_CLIENT_SECRET:-}" ]]; then
    args+=(-H "CF-Access-Client-Secret: $CF_CLIENT_SECRET")
  fi

  local tmp http_code
  tmp=$(mktemp)
  http_code=$("${args[@]}" -o "$tmp" --write-out "%{http_code}" "$url" "$@") || {
    echo "curl error (exit $?) — verifique URL e conectividade" >&2
    rm -f "$tmp"
    return 1
  }

  if [[ "$http_code" -ge 400 ]]; then
    echo "HTTP $http_code" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    return 1
  fi

  cat "$tmp"
  rm -f "$tmp"
}

api_file() {
  local url="$1" out="$2"
  local -a args=(curl -sS --max-time 15)
  if [[ -n "${CF_CLIENT_ID:-}" ]]; then
    args+=(-H "CF-Access-Client-Id: $CF_CLIENT_ID")
  fi
  if [[ -n "${CF_CLIENT_SECRET:-}" ]]; then
    args+=(-H "CF-Access-Client-Secret: $CF_CLIENT_SECRET")
  fi
  "${args[@]}" -o "$out" "$url"
}

json() {
  if command -v jq &>/dev/null; then jq; else cat; fi
}

case "$cmd" in
  health)
    api "$DVR_URL/health" | json
    ;;

  cameras)
    api "$DVR_URL/cameras" | json
    ;;


  snapshot)
    # dvr.sh snapshot <id> [out.jpg]
    id="${1:?Usage: dvr.sh snapshot <id> [out.jpg]}"
    out="${2:-snapshot-${id}-$(date +%Y%m%d%H%M%S).jpg}"
    api_file "$DVR_URL/cameras/$id/snapshot" "$out"
    echo "✓ Snapshot salvo em $out"
    ;;

  recordings)
    # dvr.sh recordings <id> [date] [page] [limit]
    id="${1:?Usage: dvr.sh recordings <id> [date] [page] [limit]}"
    date="${2:-}"; page="${3:-}"; limit="${4:-}"
    url="$DVR_URL/cameras/$id/recordings?"
    [[ -n "$date"  ]] && url+="date=${date}&" || true
    [[ -n "$page"  ]] && url+="page=${page}&" || true
    [[ -n "$limit" ]] && url+="limit=${limit}&" || true
    api "${url%&}" | json
    ;;

  frame)
    # dvr.sh frame <id> <date> <time> [out.jpg]
    id="${1:?Usage: dvr.sh frame <id> <date> <time> [out.jpg]}"
    date="${2:?Usage: dvr.sh frame <id> <date> <time> [out.jpg]}"
    time="${3:?Usage: dvr.sh frame <id> <date> <time> [out.jpg]}"
    out="${4:-frame-${id}-${date}-${time//:/-}.jpg}"
    api_file "$DVR_URL/cameras/$id/frames?date=${date}&time=${time}" "$out"
    echo "✓ Frame salvo em $out"
    ;;

  analyze)
    # dvr.sh analyze <id> [query...]
    id="${1:?Usage: dvr.sh analyze <id> [query]}"
    shift || true
    if [[ $# -gt 0 ]]; then
      query=$(printf '%s ' "$@" | python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip()))" 2>/dev/null \
        || printf '%s ' "$@" | sed 's/ /%20/g;s/?/%3F/g;s/&/%26/g;s/"/%22/g')
      api "$DVR_URL/cameras/$id/analyze?query=${query}" | json
    else
      api "$DVR_URL/cameras/$id/analyze" | json
    fi
    ;;

  events)
    # dvr.sh events [camera_id] [date] [page] [limit]
    camera="${1:-}"; date="${2:-}"; page="${3:-}"; limit="${4:-}"
    if [[ -n "$camera" ]]; then
      url="$DVR_URL/cameras/$camera/events?"
    else
      url="$DVR_URL/cameras/events?"
    fi
    [[ -n "$date"  ]] && url+="date=${date}&"   || true
    [[ -n "$page"  ]] && url+="page=${page}&"   || true
    [[ -n "$limit" ]] && url+="limit=${limit}&" || true
    api "${url%&}" | json
    ;;

  debug)
    # dvr.sh debug [path]  ex: dvr.sh debug /cameras
    path="${1:-/health}"
    echo "URL:    $DVR_URL$path"
    echo "CF-ID:  ${CF_CLIENT_ID:-<not set>}"
    echo "CF-SEC: ${CF_CLIENT_SECRET:+<set>}"
    echo "---"
    curl -v --max-time 15 \
      ${CF_CLIENT_ID:+-H "CF-Access-Client-Id: $CF_CLIENT_ID"} \
      ${CF_CLIENT_SECRET:+-H "CF-Access-Client-Secret: $CF_CLIENT_SECRET"} \
      "$DVR_URL$path" 2>&1
    ;;

  help|*)
    cat <<EOF
DVR Proxy CLI

Usage: dvr.sh <command> [args...]

Commands:
  health                              Status da API
  cameras                             Lista todas as câmeras
  snapshot <id> [out.jpg]             Salva snapshot em arquivo
  recordings <id> [date] [pg] [lim]   Lista gravações de uma câmera
  frame <id> <date> <time> [out.jpg]  Extrai frame de um horário
  analyze <id> [query]                Analisa imagem atual via IA
  events [camera] [date] [pg] [lim]   Lista eventos
  debug [path]                        Mostra request/response completo

Environment:
  DVR_URL           URL da API
  CF_CLIENT_ID      Cloudflare Access Client ID
  CF_CLIENT_SECRET  Cloudflare Access Client Secret
  DVR_CONFIG        Caminho para o config (padrão: ./dvr.conf)

Examples:
  dvr.sh cameras
  dvr.sh snapshot 1
  dvr.sh recordings 1 2024-01-15
  dvr.sh frame 1 2024-01-15 14:30:00
  dvr.sh analyze 1
  dvr.sh analyze 1 Tem alguém no portão?
  dvr.sh events
  dvr.sh events 1 2024-01-15
EOF
    ;;
esac
