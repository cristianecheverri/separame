#!/usr/bin/env bash
# Shared helpers for scripts/dev.sh, scripts/deploy-dev.sh and scripts/deploy-prod.sh.
# Sourced, not executed. Compatible with macOS' bash 3.2 (no associative arrays).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_ACCOUNT="461529379195"
GITHUB_REPO="cristianecheverri/separame"

# The `default` profile points to us-east-2; Sepárame lives in us-east-1 and the
# `personal-admin` profile is the one wired to this account. Override with AWS_PROFILE=…
export AWS_PROFILE="${AWS_PROFILE:-personal-admin}"
export AWS_REGION="us-east-1"
export AWS_DEFAULT_REGION="us-east-1"

step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
done_msg() { printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta '$1'. Instálalo y vuelve a intentar."
}

require_node() {
  require_cmd node
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] || fail "Necesitas Node.js 22 o superior (tienes $(node -v))."
}

# Installs dependencies in every package that has a package.json but no node_modules.
ensure_deps() {
  local dir
  for dir in . cdk frontend/booking frontend/app; do
    [ -f "$REPO_ROOT/$dir/package.json" ] || continue
    [ -d "$REPO_ROOT/$dir/node_modules" ] && continue
    step "Instalando dependencias en $dir"
    if [ -f "$REPO_ROOT/$dir/package-lock.json" ]; then
      (cd "$REPO_ROOT/$dir" && npm ci --no-audit --no-fund)
    else
      (cd "$REPO_ROOT/$dir" && npm install --no-audit --no-fund)
    fi
  done
}

# Fails unless the active AWS profile is logged in to the Sepárame account.
require_aws() {
  require_cmd aws
  local account
  account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
    || fail "No hay sesión de AWS con el perfil '$AWS_PROFILE'. Revisa ~/.aws o usa AWS_PROFILE=<perfil>."
  [ "$account" = "$EXPECTED_ACCOUNT" ] \
    || fail "El perfil '$AWS_PROFILE' apunta a la cuenta $account; Sepárame vive en $EXPECTED_ACCOUNT."
  info "AWS: perfil $AWS_PROFILE · cuenta $account · $AWS_REGION"
}

# CDK needs its bootstrap stack once per account/region (Cartazos already created it).
ensure_cdk_bootstrap() {
  if ! aws cloudformation describe-stacks --stack-name CDKToolkit >/dev/null 2>&1; then
    step "Preparando CDK en la cuenta (bootstrap, solo la primera vez)"
    (cd "$REPO_ROOT/cdk" && npx cdk bootstrap "aws://$EXPECTED_ACCOUNT/$AWS_REGION")
  fi
}

# Same gates as CI: types, lint, unit tests (shared + backend) and CDK tests.
run_checks() {
  step "Verificando: typecheck, lint y tests"
  (cd "$REPO_ROOT" && npm run typecheck && npm run lint && npm test)
  if [ -f "$REPO_ROOT/cdk/package.json" ]; then
    (cd "$REPO_ROOT/cdk" && npm test --if-present)
  fi
}

# Frontend unit tests (the CDK deploy builds the bundles itself).
run_frontend_tests() {
  local dir
  for dir in frontend/booking frontend/app; do
    [ -f "$REPO_ROOT/$dir/package.json" ] || continue
    step "Tests de $dir"
    (cd "$REPO_ROOT/$dir" && npm test --if-present)
  done
}

ssm_exists() {
  aws ssm get-parameter --name "$1" --query Parameter.Name --output text >/dev/null 2>&1
}

# Creates the secrets a stage can generate on its own and lists the ones that need a human.
# Names come from shared/infra.ts (SSM_PARAMS) under /separame/<stage>.
ensure_ssm_params() {
  local stage="$1" prefix="/separame/$1" missing=""

  if ! ssm_exists "$prefix/links/signing-secret"; then
    step "Creando la llave que firma los enlaces de cancelar/reprogramar ($stage)"
    aws ssm put-parameter --name "$prefix/links/signing-secret" --type SecureString \
      --value "$(openssl rand -base64 48 | tr -d '\n')" >/dev/null
  fi

  if [ "$stage" = "dev" ] && ! ssm_exists "$prefix/turnstile/secret-key"; then
    # Cloudflare's always-pass test secret (shared/infra.ts TURNSTILE_TEST_KEYS).
    aws ssm put-parameter --name "$prefix/turnstile/secret-key" --type SecureString \
      --value "1x0000000000000000000000000000000AA" >/dev/null
  fi

  local name
  for name in turnstile/secret-key billing/instructions; do
    ssm_exists "$prefix/$name" || missing="$missing $prefix/$name"
  done

  if [ -n "$missing" ]; then
    warn "Faltan estos parámetros en SSM (la agenda funciona igual; esto habilita antispam y los datos de pago):"
    for name in $missing; do info "  $name"; done
    info "turnstile/secret-key:  aws ssm put-parameter --type SecureString --name $prefix/turnstile/secret-key --value <llave>"
    info "billing/instructions (cómo te pagan los profesionales, JSON):"
    info "  aws ssm put-parameter --type String --name $prefix/billing/instructions --value \\"
    info "  '{\"methods\":[{\"kind\":\"nequi\",\"label\":\"Nequi\",\"detail\":\"300 000 0000\"}],\"holderName\":\"Tu nombre\",\"note\":\"Activamos tu plan el mismo día.\"}'"
  fi
}

site_url() {
  if [ "$1" = "prod" ]; then echo "https://separame.app"; else echo "https://dev.separame.app"; fi
}
