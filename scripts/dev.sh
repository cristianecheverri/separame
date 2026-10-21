#!/usr/bin/env bash
# Runs both frontends locally:
#   booking page  → http://localhost:5173
#   panel + admin → http://localhost:5174/app/
#
# Usage:
#   scripts/dev.sh             mock data (no AWS needed)
#   scripts/dev.sh --api       against the deployed dev stage (api.dev.separame.app)
#   scripts/dev.sh --booking   only the booking page   (combinable with --api)
#   scripts/dev.sh --app       only the panel          (combinable with --api)

source "$(dirname "$0")/lib.sh"

MODE="mock"
RUN_BOOKING=1
RUN_APP=1
for arg in "$@"; do
  case "$arg" in
    --api) MODE="api" ;;
    --booking) RUN_APP=0 ;;
    --app) RUN_BOOKING=0 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) fail "Opción desconocida: $arg (usa --help)" ;;
  esac
done

require_node
ensure_deps

BOOKING_PORT=5173
APP_PORT=5174

if [ "$MODE" = "mock" ]; then
  export VITE_MOCK=1
  step "Modo local con datos de prueba (sin AWS)"
else
  # The deployed panel config has the API URL and Cognito ids; reuse it so local
  # matches dev exactly. CORS on the dev API allows localhost:5173/5174.
  CONFIG_URL="https://dev.separame.app/app/config.json"
  step "Modo local contra el ambiente dev ($CONFIG_URL)"
  CONFIG="$(curl -fsS "$CONFIG_URL")" \
    || fail "No pude leer $CONFIG_URL. ¿Ya desplegaste dev? (npm run deploy:dev)"
  read_cfg() { node -e "process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]] ?? ''))" "$CONFIG" "$1"; }
  export VITE_MOCK=0
  export VITE_API_URL="$(read_cfg apiUrl)"
  export VITE_USER_POOL_ID="$(read_cfg userPoolId)"
  export VITE_USER_POOL_CLIENT_ID="$(read_cfg userPoolClientId)"
  export VITE_AWS_REGION="$(read_cfg region)"
  export VITE_STAGE="$(read_cfg stage)"
  export VITE_SITE_URL="$(read_cfg siteUrl)"
  export VITE_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
  info "API: $VITE_API_URL"
fi

PIDS=""
cleanup() {
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null || true
}
trap cleanup EXIT INT TERM

start() { # <name> <dir> <port>
  [ -f "$REPO_ROOT/$2/package.json" ] || { warn "$2 todavía no existe; lo salto."; return; }
  (cd "$REPO_ROOT/$2" && npm run dev -- --port "$3" --strictPort 2>&1 | sed -u "s/^/[$1] /") &
  PIDS="$PIDS $!"
}

[ "$RUN_BOOKING" = 1 ] && start booking frontend/booking "$BOOKING_PORT"
[ "$RUN_APP" = 1 ] && start app frontend/app "$APP_PORT"
[ -n "$PIDS" ] || fail "No hay nada que levantar."

sleep 2
step "Listo — abre en el navegador:"
if [ "$RUN_BOOKING" = 1 ]; then
  info "Página de reserva:   http://localhost:$BOOKING_PORT/dra-laura-perez"
  info "Cancelar/reprogramar: http://localhost:$BOOKING_PORT/c/demo-token"
  info "Inicio:              http://localhost:$BOOKING_PORT/"
fi
if [ "$RUN_APP" = 1 ]; then
  info "Panel profesional:   http://localhost:$APP_PORT/app/"
  if [ "$MODE" = "mock" ]; then
    info "Admin (prueba):      http://localhost:$APP_PORT/app/admin?as=admin"
    info "Plan vencido:        http://localhost:$APP_PORT/app/?state=expired"
  fi
fi
info "Ctrl+C para detener."

wait
