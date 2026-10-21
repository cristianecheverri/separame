#!/usr/bin/env bash
# Ships to production (separame.app).
#
# Normal path: production is deployed by GitHub Actions on every push to `main`.
# This script runs the same checks locally, asks for confirmation and pushes.
#
# Usage:
#   scripts/deploy-prod.sh            checks + push main → GitHub Actions deploys prod
#   scripts/deploy-prod.sh --local    deploy prod directly from this machine (first deploy,
#                                     or if CI is down). Asks you to type "prod".
#   scripts/deploy-prod.sh --cicd     one-time: create the GitHub OIDC deploy role
#                                     (SeparameCiCd) and print how to set the repo secret.

source "$(dirname "$0")/lib.sh"

MODE="push"
for arg in "$@"; do
  case "$arg" in
    --local) MODE="local" ;;
    --cicd) MODE="cicd" ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) fail "Opción desconocida: $arg (usa --help)" ;;
  esac
done

require_node
ensure_deps

confirm() { # <exact word> <prompt>
  local answer
  printf '\n\033[1;33m%s\033[0m ' "$2"
  read -r answer
  [ "$answer" = "$1" ] || fail "Cancelado."
}

if [ "$MODE" = "cicd" ]; then
  require_aws
  ensure_cdk_bootstrap
  step "Creando el rol de despliegue para GitHub Actions (SeparameCiCd)"
  (cd "$REPO_ROOT/cdk" && npx cdk deploy SeparameCiCd -c stage=prod -c cicd=true \
    --require-approval never --outputs-file outputs-cicd.json)
  ROLE_ARN="$(node -e "const o=require('$REPO_ROOT/cdk/outputs-cicd.json');const s=Object.values(o)[0]||{};process.stdout.write(Object.entries(s).find(([k])=>/RoleArn/i.test(k))?.[1]||'')")"
  done_msg "Rol creado"
  info "Guarda este ARN como secreto del repo con el nombre AWS_DEPLOY_ROLE_ARN:"
  info "  ${ROLE_ARN:-<mira cdk/outputs-cicd.json>}"
  info "  https://github.com/$GITHUB_REPO/settings/secrets/actions/new"
  exit 0
fi

# Production only ships what is committed on main and in sync with GitHub.
cd "$REPO_ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || fail "Estás en '$BRANCH'. Producción sale solo desde main."
[ -z "$(git status --porcelain)" ] || fail "Hay cambios sin commit. Haz commit (o stash) antes de desplegar."
git fetch --quiet origin main
BEHIND="$(git rev-list --count HEAD..origin/main)"
[ "$BEHIND" = "0" ] || fail "Tu main está $BEHIND commit(s) detrás de origin/main. Haz git pull primero."

run_checks
run_frontend_tests

AHEAD="$(git rev-list --count origin/main..HEAD)"

if [ "$MODE" = "push" ]; then
  if [ "$AHEAD" = "0" ]; then
    warn "No hay commits nuevos para subir; GitHub ya tiene esta versión."
    info "Para re-desplegar lo mismo: https://github.com/$GITHUB_REPO/actions/workflows/deploy.yml → Run workflow"
    exit 0
  fi
  step "Commits que van a producción:"
  git --no-pager log --oneline origin/main..HEAD | sed 's/^/  /'
  confirm "si" "¿Subir a main y desplegar producción? Escribe 'si':"
  git push origin main
  done_msg "Subido. GitHub Actions está desplegando producción."
  info "Sigue el progreso: https://github.com/$GITHUB_REPO/actions"
  info "Sitio: $(site_url prod)"
  exit 0
fi

# --local
require_aws
ensure_cdk_bootstrap
ensure_ssm_params prod
warn "Vas a desplegar PRODUCCIÓN desde tu máquina (commit $(git rev-parse --short HEAD))."
confirm "prod" "Escribe 'prod' para continuar:"
step "Desplegando prod"
(cd "$REPO_ROOT/cdk" && npx cdk deploy --all -c stage=prod --require-approval never \
  --concurrency 4 --outputs-file outputs-prod.json)
done_msg "Producción desplegada"
info "Sitio: $(site_url prod)  ·  Panel: $(site_url prod)/app/  ·  API: https://api.separame.app"
