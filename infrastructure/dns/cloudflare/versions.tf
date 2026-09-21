terraform {
  required_version = "= 1.16.2"
  backend "s3" {}
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.25.0"
    }
  }
}

# Authentication is supplied only as CLOUDFLARE_API_TOKEN by the approved operator.
provider "cloudflare" {}
