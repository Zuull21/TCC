# ─────────────────────────────────────────────────────────────────────────────
# Configuração e segredos no SSM Parameter Store (camada padrão é gratuita).
# A cada boot e a cada deploy a instância lê daqui:
#   /tourmap/prod/env/*      → vira o .env do docker compose
#   /tourmap/prod/compose    → vira o docker-compose.yml
#   /tourmap/prod/run-script → script que atualiza e sobe os containers
# Mudou algo aqui? `tourmap.sh deploy` aplica sem recriar a instância.
# ─────────────────────────────────────────────────────────────────────────────

# Senhas geradas uma única vez e guardadas no estado (S3 criptografado).
# Não podem mudar depois: o MySQL só lê a senha na criação do banco.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "random_password" "db_root" {
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

# O SSM não aceita valor vazio: variáveis opcionais em branco simplesmente não
# são criadas, e o docker-compose.yml aplica o padrão. O filtro olha só as
# variáveis de entrada (conhecidas no plan), nunca valores gerados no apply.
locals {
  optional_secrets = {
    EMAIL_USER          = var.email_user
    EMAIL_PASS          = var.email_pass
    HUGGINGFACE_API_KEY = var.huggingface_api_key
  }

  secret_env = merge(
    {
      DB_PASSWORD      = random_password.db.result
      DB_ROOT_PASSWORD = random_password.db_root.result
      JWT_SECRET       = random_password.jwt.result
    },
    local.optional_secrets,
  )

  # Expõe só QUAIS segredos opcionais existem, não os valores
  secret_keys = concat(
    ["DB_PASSWORD", "DB_ROOT_PASSWORD", "JWT_SECRET"],
    nonsensitive([for k, v in local.optional_secrets : k if v != ""]),
  )

  optional_plain = {
    EMAIL_HOST = var.email_host
    EMAIL_FROM = var.email_from
  }

  plain_env = merge(
    {
      DB_NAME        = "tourmap"
      DB_USER        = "tourmap"
      JWT_EXPIRES_IN = "7d"
      EMAIL_PORT     = tostring(var.email_port)
      # Sem SMTP configurado não há como entregar o código: o cadastro entra direto
      EMAIL_VERIFICATION = var.email_host != "" ? "on" : "off"
      SENTIMENT_ENGINE   = "local"
      SENTIMENT_DTYPE    = var.sentiment_dtype
      SITE_ADDRESS       = local.site_address
      FRONTEND_URL       = "https://${local.site_address}"
      REGISTRY           = local.registry
    },
    { for k, v in local.optional_plain : k => v if v != "" },
  )
}

resource "aws_ssm_parameter" "secret_env" {
  for_each = toset(local.secret_keys)

  name  = "${local.param_prefix}/env/${each.key}"
  type  = "SecureString"
  value = local.secret_env[each.key]
}

resource "aws_ssm_parameter" "plain_env" {
  for_each = local.plain_env

  name  = "${local.param_prefix}/env/${each.key}"
  type  = "String"
  value = each.value
}

resource "aws_ssm_parameter" "compose" {
  name  = "${local.param_prefix}/compose"
  type  = "String"
  value = file("${path.module}/../../docker-compose.yml")
}

resource "aws_ssm_parameter" "run_script" {
  name = "${local.param_prefix}/run-script"
  type = "String"
  value = templatefile("${path.module}/templates/run.sh.tftpl", {
    region       = var.region
    param_prefix = local.param_prefix
  })
}
