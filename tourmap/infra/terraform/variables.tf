# ── Liga / desliga ───────────────────────────────────────────────────────────

variable "power" {
  description = "on = instância ligada · off = instância desligada (nada é destruído)"
  type        = string
  default     = "on"

  validation {
    condition     = contains(["on", "off"], var.power)
    error_message = "power deve ser \"on\" ou \"off\"."
  }
}

# ── Infraestrutura ───────────────────────────────────────────────────────────

variable "region" {
  description = "Região AWS. us-east-1 é a mais barata; sa-east-1 (São Paulo) tem menor latência no Brasil, ~50% mais cara."
  type        = string
  default     = "us-east-1"
}

variable "availability_zone" {
  description = "AZ da instância e do disco de dados (precisam ser a mesma). Vazio = primeira AZ da região."
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "t3.medium (4 GB) comporta MySQL + API + modelo fp32. Com sentiment_dtype = q8, t3.small (2 GB) basta."
  type        = string
  default     = "t3.medium"
}

variable "root_volume_gb" {
  description = "Disco do sistema operacional."
  type        = number
  default     = 10
}

variable "data_volume_gb" {
  description = "Disco de dados: banco, imagens Docker, modelos de IA e certificados. Pode crescer depois, nunca diminuir."
  type        = number
  default     = 20
}

variable "backup_retention_days" {
  description = "Quantos snapshots diários do disco de dados manter."
  type        = number
  default     = 7
}

variable "domain_name" {
  description = "Domínio próprio já apontando para o IP. Vazio = usa <ip>.sslip.io (HTTPS gratuito, sem registrar domínio)."
  type        = string
  default     = ""
}

# ── AWS Academy ─────────────────────────────────────────────────────────────

variable "instance_profile_name" {
  description = "Instance profile existente. Vazio = o Terraform cria o seu. AWS Academy: \"LabInstanceProfile\" (lá não é permitido criar roles)."
  type        = string
  default     = ""
}

variable "enable_snapshots" {
  description = "Snapshot diário do disco de dados (cria uma role IAM; desligue no AWS Academy)."
  type        = bool
  default     = true
}

# ── Aplicação ────────────────────────────────────────────────────────────────

variable "sentiment_dtype" {
  description = "Precisão do modelo de sentimento local: fp32 (fiel ao original) ou q8 (4x menor)."
  type        = string
  default     = "fp32"
}

variable "email_host" {
  description = "SMTP opcional. Vazio = verificação de e-mail desligada (o cadastro entra direto). Preenchido = exige o código."
  type        = string
  default     = ""
}

variable "email_port" {
  type    = number
  default = 587
}

variable "email_user" {
  type      = string
  default   = ""
  sensitive = true
}

variable "email_pass" {
  type      = string
  default   = ""
  sensitive = true
}

variable "email_from" {
  type    = string
  default = ""
}

variable "huggingface_api_key" {
  description = "Só necessário com SENTIMENT_ENGINE=api. O padrão roda o modelo localmente."
  type        = string
  default     = ""
  sensitive   = true
}

# ── Custos ───────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "E-mail para alertas de orçamento. Vazio = sem alerta."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  type    = number
  default = 15
}
