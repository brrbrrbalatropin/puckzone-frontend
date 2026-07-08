output "frontend_url" {
  description = "URL publica del frontend; usarla en cors_allowed_origins del gateway"
  value       = "https://${azurerm_container_app.frontend.name}.${data.terraform_remote_state.base.outputs.container_app_environment_default_domain}"
}
