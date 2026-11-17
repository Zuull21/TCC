# ─────────────────────────────────────────────────────────────────────────────
# TourMap na AWS — uma EC2 rodando docker compose (MySQL + API + Caddy).
#
# Regra do projeto: NADA é recriado. Ligar/desligar é parar/iniciar a instância.
#   · prevent_destroy        → terraform se recusa a apagar instância, disco, IP e ECR
#   · disable_api_termination→ a AWS recusa terminar a instância, mesmo pelo console
#   · ignore_changes (ami)   → uma AMI nova não força recriar a instância
#   · disco de dados separado→ banco e modelos sobrevivem a qualquer coisa na instância
#
# Por que não ECS + ALB + NAT: ALB e NAT Gateway não podem ser desligados, só
# destruídos (custariam ~US$ 50/mês mesmo parados). Uma EC2 parada não cobra computação.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  name         = "tourmap"
  param_prefix = "/tourmap/prod"
  az           = coalesce(var.availability_zone, data.aws_availability_zones.available.names[0])
  create_iam   = var.instance_profile_name == ""
  registry     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  # sslip.io resolve 54-12-34-56.sslip.io → 54.12.34.56: HTTPS gratuito sem registrar domínio
  site_address = var.domain_name != "" ? var.domain_name : "${replace(aws_eip.app.public_ip, ".", "-")}.sslip.io"
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

# VPC padrão: existe em toda conta e é gratuita. Evita NAT Gateway e subnets privadas.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "selected" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = local.az
  default_for_az    = true
}

# Amazon Linux 2023 mais recente (já traz AWS CLI e SSM Agent)
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# ── Rede ─────────────────────────────────────────────────────────────────────
# Só HTTP/HTTPS abertos. Sem porta 22: acesso administrativo é pelo SSM.

resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "TourMap: HTTP/HTTPS publico"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description      = "HTTP (redireciona para HTTPS e valida o certificado)"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTP/3"
    from_port        = 443
    to_port          = 443
    protocol         = "udp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# IP fixo: o domínio sslip.io e o certificado HTTPS dependem dele não mudar
# entre desligar e religar. (Cobra ~US$ 3,60/mês, ligado ou não.)
resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = "${local.name}-ip" }

  lifecycle {
    prevent_destroy = true
  }
}

# ── Permissões da instância ──────────────────────────────────────────────────

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# No AWS Academy não é permitido criar roles: usa-se o LabInstanceProfile existente
# (var.instance_profile_name) e nenhum recurso IAM abaixo é criado.
resource "aws_iam_role" "instance" {
  count              = local.create_iam ? 1 : 0
  name               = "${local.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Permite comandos remotos (deploy, logs) e sessão de terminal sem SSH
resource "aws_iam_role_policy_attachment" "ssm_core" {
  count      = local.create_iam ? 1 : 0
  role       = aws_iam_role.instance[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_read" {
  count      = local.create_iam ? 1 : 0
  role       = aws_iam_role.instance[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "read_params" {
  statement {
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.param_prefix}*"]
  }
}

resource "aws_iam_role_policy" "read_params" {
  count  = local.create_iam ? 1 : 0
  name   = "read-tourmap-params"
  role   = aws_iam_role.instance[0].id
  policy = data.aws_iam_policy_document.read_params.json
}

resource "aws_iam_instance_profile" "instance" {
  count = local.create_iam ? 1 : 0
  name  = "${local.name}-instance"
  role  = aws_iam_role.instance[0].name
}

# ── Registro de imagens Docker ───────────────────────────────────────────────

resource "aws_ecr_repository" "app" {
  for_each = toset(["backend", "frontend"])

  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE" # :latest é sobrescrita a cada deploy

  image_scanning_configuration {
    scan_on_push = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém só as 5 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

# ── Disco de dados ───────────────────────────────────────────────────────────
# Banco MySQL, imagens Docker, modelos de IA e certificados ficam aqui.

resource "aws_ebs_volume" "data" {
  availability_zone = local.az
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name   = "${local.name}-data"
    Backup = local.name # selecionado pela política de snapshot (backups.tf)
  }

  lifecycle {
    prevent_destroy = true
  }
}

# ── Instância ────────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  ami                     = nonsensitive(data.aws_ssm_parameter.al2023.value)
  instance_type           = var.instance_type
  subnet_id               = data.aws_subnet.selected.id
  vpc_security_group_ids  = [aws_security_group.web.id]
  iam_instance_profile    = local.create_iam ? aws_iam_instance_profile.instance[0].name : var.instance_profile_name
  disable_api_termination = true

  # Roda só no primeiro boot: instala Docker, formata/monta o disco de dados e
  # registra o serviço que sobe a aplicação a cada boot.
  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    region           = var.region
    data_volume_id   = replace(aws_ebs_volume.data.id, "-", "")
    run_script_param = aws_ssm_parameter.run_script.name
  })

  metadata_options {
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 1          # containers não precisam das credenciais da instância
  }

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = "${local.name}-app" }

  lifecycle {
    prevent_destroy = true
    # AMI nova ou user_data alterado NÃO recriam a instância.
    # A lógica que muda com frequência fica no SSM (ssm.tf) e é lida a cada boot.
    ignore_changes = [ami, user_data]
  }
}

resource "aws_volume_attachment" "data" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.data.id
  instance_id                    = aws_instance.app.id
  stop_instance_before_detaching = true
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

# O interruptor: liga ou desliga sem destruir nada
resource "aws_ec2_instance_state" "app" {
  instance_id = aws_instance.app.id
  state       = var.power == "on" ? "running" : "stopped"

  depends_on = [aws_volume_attachment.data, aws_eip_association.app]
}
