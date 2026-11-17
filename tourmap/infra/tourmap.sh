#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TourMap — operação na AWS (rode no Git Bash, a partir da pasta tourmap/)
#
#   bash infra/tourmap.sh up       cria o que faltar e LIGA. O que já existe só é religado.
#   bash infra/tourmap.sh down     DESLIGA a instância. Nada é destruído; dados preservados.
#   bash infra/tourmap.sh deploy   publica o código atual (build + push + atualiza a instância)
#   bash infra/tourmap.sh status   estado, URL e health check
#   bash infra/tourmap.sh logs [backend|web|db] [linhas]
#   bash infra/tourmap.sh seed     carga inicial: catálogo de pontos turísticos + eventos (só 1 vez)
#   bash infra/tourmap.sh demo     fotos e avaliações de 8 pontos de SP (MASP etc.)
#   bash infra/tourmap.sh catalogo [--aplicar]  troca os pontos turísticos pelo catálogo curado
#                                  (sem --aplicar só mostra o que faria)
#   bash infra/tourmap.sh init     só prepara o estado remoto (up/down/deploy já chamam)
#
#   -y | --yes   aplica o Terraform sem pedir confirmação
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: não transformar "/tourmap/prod" em "C:/Program Files/Git/..."
export AWS_PAGER=""
# AWS CLI no Windows imprime em cp1252 por padrão e quebra em acentos/símbolos da saída remota
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

# pwd -W (Git Bash) devolve C:/Users/...: os executáveis Windows (terraform, docker)
# não entendem /c/Users/... com a conversão de caminhos desligada acima
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && (pwd -W 2>/dev/null || pwd))"
TF_DIR="$ROOT/infra/terraform"

CMD="${1:-help}"
[ $# -gt 0 ] && shift
AUTO=""
ARGS=()
for a in "$@"; do
  case "$a" in
    -y | --yes) AUTO="-auto-approve" ;;
    *) ARGS+=("$a") ;;
  esac
done

log() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

need() {
  for t in "$@"; do command -v "$t" >/dev/null || die "'$t' não encontrado no PATH."; done
}

tf() { terraform -chdir="$TF_DIR" "$@"; }
out() { tf output -raw "$1"; }

# Região: a de terraform.tfvars, senão o padrão do Terraform (us-east-1)
tf_region() {
  local r
  r=$(sed -nE 's/^[[:space:]]*region[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$TF_DIR/terraform.tfvars" 2>/dev/null | head -1)
  echo "${r:-us-east-1}"
}

# ── Estado remoto ────────────────────────────────────────────────────────────
# O estado do Terraform fica num bucket S3 versionado. É ele que garante que
# nada seja recriado: o Terraform sabe exatamente o que já existe na conta.
cmd_init() {
  need terraform aws
  local account region bucket
  account=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
    || die "Credenciais AWS inválidas ou expiradas. AWS Academy: inicie o lab, copie de novo o bloco de AWS Details > AWS CLI para ~/.aws/credentials. Conta normal: aws configure"
  region=$(tf_region)
  bucket="tourmap-tfstate-$account"

  if aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    # usa a região real do bucket, mesmo que a região dos recursos mude depois
    region=$(aws s3api get-bucket-location --bucket "$bucket" --query LocationConstraint --output text)
    [ "$region" = "None" ] && region="us-east-1"
  else
    log "Criando bucket de estado $bucket ($region)"
    if [ "$region" = "us-east-1" ]; then
      aws s3api create-bucket --bucket "$bucket" --region "$region" >/dev/null
    else
      aws s3api create-bucket --bucket "$bucket" --region "$region" \
        --create-bucket-configuration "LocationConstraint=$region" >/dev/null
    fi
    aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
    aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  fi

  printf 'bucket = "%s"\nregion = "%s"\n' "$bucket" "$region" >"$TF_DIR/backend.hcl"
  tf init -input=false -backend-config=backend.hcl >/dev/null
  ok "Estado remoto: s3://$bucket"
}

apply_power() {
  log "Terraform: cria só o que não existe e coloca a instância em '$1'"
  tf apply -input=false -var "power=$1" $AUTO
}

instance_state() {
  aws ec2 describe-instances --region "$(out region)" --instance-ids "$(out instance_id)" \
    --query 'Reservations[0].Instances[0].State.Name' --output text
}

# ── Imagens ──────────────────────────────────────────────────────────────────
image_exists() {
  aws ecr describe-images --region "$(out region)" --repository-name "tourmap-$1" \
    --image-ids imageTag=latest >/dev/null 2>&1
}

build_push() {
  need docker git
  docker info >/dev/null 2>&1 || die "Docker não está rodando. Abra o Docker Desktop e tente de novo."
  local reg region tag
  reg=$(out registry)
  region=$(out region)
  tag=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
  [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ] && tag="$tag-dirty"

  aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$reg" >/dev/null
  for svc in backend frontend; do
    log "Build e push de $svc ($tag)"
    docker build --platform linux/amd64 -t "$reg/tourmap-$svc:$tag" -t "$reg/tourmap-$svc:latest" "$ROOT/$svc"
    docker push --quiet "$reg/tourmap-$svc:$tag" >/dev/null
    docker push --quiet "$reg/tourmap-$svc:latest" >/dev/null
  done
  ok "Imagens publicadas ($tag)"
}

# ── Comandos remotos (SSM, sem SSH) ──────────────────────────────────────────
wait_ssm() {
  local id region status
  id=$(out instance_id)
  region=$(out region)
  log "Aguardando a instância responder ao SSM"
  for _ in $(seq 1 60); do
    status=$(aws ssm describe-instance-information --region "$region" \
      --filters "Key=InstanceIds,Values=$id" \
      --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
    [ "$status" = "Online" ] && return 0
    sleep 5
  done
  die "Instância não respondeu ao SSM em 5 minutos."
}

remote() {
  local id region params cmd_id status
  id=$(out instance_id)
  region=$(out region)
  params=$(node -e 'console.log(JSON.stringify({ commands: [process.argv[1]] }))' "$1")
  cmd_id=$(aws ssm send-command --region "$region" --instance-ids "$id" \
    --document-name AWS-RunShellScript --timeout-seconds 1800 \
    --parameters "$params" --query Command.CommandId --output text)

  status=Pending
  for _ in $(seq 1 360); do
    status=$(aws ssm get-command-invocation --region "$region" --command-id "$cmd_id" \
      --instance-id "$id" --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Success | Failed | Cancelled | TimedOut) break ;; esac
    sleep 5
  done

  aws ssm get-command-invocation --region "$region" --command-id "$cmd_id" --instance-id "$id" \
    --query StandardOutputContent --output text
  if [ "$status" != "Success" ]; then
    aws ssm get-command-invocation --region "$region" --command-id "$cmd_id" --instance-id "$id" \
      --query StandardErrorContent --output text >&2
    die "Comando remoto terminou com status $status"
  fi
}

refresh_app() {
  wait_ssm
  log "Atualizando containers na instância"
  # cloud-init: no primeiro boot, espera a instalação do Docker terminar
  remote "cloud-init status --wait >/dev/null; \
    if systemctl is-active --quiet tourmap; then systemctl reload tourmap; else systemctl restart tourmap; fi; \
    cd /opt/tourmap && docker compose ps --format 'table {{.Service}}\t{{.Status}}'"
}

wait_healthy() {
  local url
  url=$(out url)
  log "Aguardando $url/api/health (primeira vez: certificado HTTPS + download do modelo)"
  for _ in $(seq 1 120); do
    if curl -fsS --max-time 5 "$url/api/health" >/dev/null 2>&1; then
      ok "No ar: $url"
      return 0
    fi
    sleep 5
  done
  warn "Ainda não respondeu em 10 min. Veja: bash infra/tourmap.sh logs"
}

# ── Comandos ─────────────────────────────────────────────────────────────────
cmd_up() {
  cmd_init
  apply_power on
  local missing=0
  for svc in backend frontend; do image_exists "$svc" || missing=1; done
  [ "$missing" = 1 ] && { log "Primeira vez: imagens ainda não existem no ECR"; build_push; }
  refresh_app
  wait_healthy
}

cmd_deploy() {
  cmd_init
  apply_power on # mantém compose/config no SSM em dia; liga se estiver desligada
  build_push
  refresh_app
  wait_healthy
}

cmd_down() {
  cmd_init
  apply_power off
  ok "Desligado. Instância, disco, banco, IP e imagens continuam lá — 'up' religa tudo."
  echo "  Custo parado: ~US\$ 6/mês em us-east-1 (discos + IP fixo + snapshots)."
}

cmd_status() {
  cmd_init
  echo "  URL:        $(out url)"
  echo "  IP:         $(out public_ip)"
  echo "  Instância:  $(out instance_id) — $(instance_state)"
  if curl -fsS --max-time 5 "$(out url)/api/health" 2>/dev/null; then echo; ok "API respondendo"; else warn "API não respondeu"; fi
}

cmd_logs() {
  cmd_init
  [ "$(instance_state)" = "running" ] || die "Instância desligada. Rode: bash infra/tourmap.sh up"
  remote "cd /opt/tourmap && docker compose logs --no-color --tail=${ARGS[1]:-100} ${ARGS[0]:-}"
}

cmd_seed() {
  cmd_init
  [ "$(instance_state)" = "running" ] || die "Instância desligada. Rode: bash infra/tourmap.sh up"
  log "Pontos turísticos (OpenStreetMap) e depois eventos de demonstração — pode levar alguns minutos"
  remote "cd /opt/tourmap && docker compose exec -T backend node src/config/syncDb.js && docker compose exec -T backend node scripts/seed-events.js"
}

cmd_catalogo() {
  cmd_init
  [ "$(instance_state)" = "running" ] || die "Instância desligada. Rode: bash infra/tourmap.sh up"
  local flag=""
  for a in "${ARGS[@]:-}"; do [ "$a" = "--aplicar" ] && flag="--aplicar"; done
  log "Catálogo de pontos turísticos ${flag:-(simulação)}"
  remote "cd /opt/tourmap && docker compose exec -T backend node scripts/sync-tourist-catalog.js $flag"
}

cmd_demo() {
  cmd_init
  [ "$(instance_state)" = "running" ] || die "Instância desligada. Rode: bash infra/tourmap.sh up"
  log "Fotos e avaliações dos pontos turísticos de SP (o modelo classifica cada uma)"
  remote "cd /opt/tourmap && docker compose exec -T backend node scripts/seed-demo-tourism.js"
}

case "$CMD" in
  init) cmd_init ;;
  up) cmd_up ;;
  down) cmd_down ;;
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  seed) cmd_seed ;;
  demo) cmd_demo ;;
  catalogo) cmd_catalogo ;;
  *) sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
esac
