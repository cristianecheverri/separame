#!/usr/bin/env bash
# Deploys the dev stage (dev.separame.app / api.dev.separame.app) from this machine.
#
# Usage:
#   scripts/deploy-dev.sh                 checks + full deploy of every dev stack
#   scripts/deploy-dev.sh --fast          Lambda code only via hotswap (seconds; falls back to a
#                                         full deploy when the change isn't hotswappable). Never prod.
#   scripts/deploy-dev.sh --skip-checks   skip typecheck/lint/tests (not recommended)
#   scripts/deploy-dev.sh --only Api      deploy a single stack (SeparameDev<Name>), e.g. Api, Data

source "$(dirname "$0")/lib.sh"

FAST=0
CHECKS=1
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --fast) FAST=1 ;;
    --skip-checks) CHECKS=0 ;;
    --only) shift; ONLY="${1:-}"; [ -n "$ONLY" ] || fail "--only necesita el nombre del stack (p. ej. Api)" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) fail "Opción desconocida: $1 (usa --help)" ;;
  esac
  shift
done

require_node
require_aws
ensure_deps
[ "$CHECKS" = 1 ] && run_checks

ensure_cdk_bootstrap
ensure_ssm_params dev

TARGET="--all"
[ -n "$ONLY" ] && TARGET="SeparameDev$ONLY"

ARGS="deploy $TARGET -c stage=dev --require-approval never --concurrency 4 --outputs-file outputs-dev.json"
if [ "$FAST" = 1 ]; then
  ARGS="$ARGS --hotswap-fallback"
  step "Desplegando dev (rápido: solo código de Lambdas cuando se puede)"
else
  step "Desplegando dev"
fi

START=$(date +%s)
# shellcheck disable=SC2086
(cd "$REPO_ROOT/cdk" && npx cdk $ARGS)
ELAPSED=$(( $(date +%s) - START ))


done_msg "dev desplegado en ${ELAPSED}s"
info "Sitio:  $(site_url dev)"
info "Panel:  $(site_url dev)/app/"
info "API:    https://api.dev.separame.app"
info "Salidas de CloudFormation: cdk/outputs-dev.json"
