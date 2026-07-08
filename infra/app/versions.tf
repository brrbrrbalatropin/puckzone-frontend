terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # State propio de la app del frontend, separado del de la infra compartida.
  backend "azurerm" {
    resource_group_name  = "puckzone-tfstate-rg"
    storage_account_name = "puckzonetfstate"
    container_name       = "tfstate"
    key                  = "frontend.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
