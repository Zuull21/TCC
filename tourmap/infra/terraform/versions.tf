terraform {
  required_version = ">= 1.10" # use_lockfile no backend S3

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # O estado fica num bucket S3 versionado. É ele que faz o Terraform "lembrar"
  # o que já existe na AWS — sem estado remoto, uma máquina nova tentaria recriar tudo.
  # bucket e region vêm de backend.hcl, gerado por `infra/tourmap.sh init`
  # (o nome do bucket inclui o ID da conta, então não pode ficar fixo aqui).
  backend "s3" {
    key          = "tourmap/prod.tfstate"
    encrypt      = true
    use_lockfile = true # trava o estado durante o apply (sem DynamoDB)
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "tourmap"
      ManagedBy = "terraform"
    }
  }
}
