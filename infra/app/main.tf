resource "azurerm_container_app" "frontend" {
  name                         = "puckzone-frontend"
  resource_group_name          = data.terraform_remote_state.base.outputs.resource_group_name
  container_app_environment_id = data.terraform_remote_state.base.outputs.container_app_environment_id
  revision_mode                = "Single"

  template {
    # SPA estatica servida por nginx: sin estado, pero 1 replica basta para el
    # proyecto y mantiene el costo minimo.
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "frontend"
      image  = var.image
      # nginx sirviendo estaticos: mucho mas liviano que un servicio Spring.
      cpu    = 0.25
      memory = "0.5Gi"

      liveness_probe {
        transport = "HTTP"
        port      = 80
        path      = "/"
      }
      readiness_probe {
        transport = "HTTP"
        port      = 80
        path      = "/"
      }
    }
  }

  # Externo: es la cara publica de la plataforma; el navegador del usuario la
  # carga directo. Azure termina TLS con certificado administrado.
  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  lifecycle {
    # El pipeline actualiza la imagen con az containerapp update; sin esto,
    # cada terraform apply intentaria devolver la app a la imagen inicial.
    ignore_changes = [template[0].container[0].image]
  }
}
