# Lee los outputs de infra/base (environment, App Insights, etc.), que vive
# en el repo puckzone-game. Este bloque se copia en el infra/app de cada repo.
data "terraform_remote_state" "base" {
  backend = "azurerm"

  config = {
    resource_group_name  = "puckzone-tfstate-rg"
    storage_account_name = "puckzonetfstate"
    container_name       = "tfstate"
    key                  = "base.tfstate"
  }
}
