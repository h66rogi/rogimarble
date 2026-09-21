locals {
  allowed_records = toset([
    "marble.rogi.chat",
    "marble-api.rogi.chat",
  ])
}

resource "cloudflare_dns_record" "marble" {
  for_each = var.publish_dns ? local.allowed_records : toset([])

  zone_id = var.zone_id
  name    = each.key
  type    = "A"
  content = var.marble_eip
  proxied = false
  ttl     = 300
  comment = "rogimarble production; direct Caddy HTTPS"

  lifecycle {
    prevent_destroy = true
  }
}

output "published_records" {
  value = { for name, record in cloudflare_dns_record.marble : name => {
    id      = record.id
    content = nonsensitive(record.content)
    proxied = record.proxied
    ttl     = record.ttl
  } }
}
