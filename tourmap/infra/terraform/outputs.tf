output "url" {
  description = "Endereço público do TourMap"
  value       = "https://${local.site_address}"
}

output "public_ip" {
  value = aws_eip.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}

output "power" {
  value = var.power
}

output "region" {
  value = var.region
}

output "registry" {
  description = "Registro ECR (docker login / push)"
  value       = local.registry
}
