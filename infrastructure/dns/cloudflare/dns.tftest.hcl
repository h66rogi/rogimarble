mock_provider "cloudflare" {}

run "disabled_by_default" {
  command = plan
  variables { zone_id = "11111111111111111111111111111111" }
  assert {
    condition     = length(cloudflare_dns_record.marble) == 0
    error_message = "DNS must remain dormant without explicit publish_dns."
  }
}

run "exact_public_records" {
  command = apply
  variables {
    zone_id     = "11111111111111111111111111111111"
    publish_dns = true
    marble_eip  = "203.0.113.10"
  }
  assert {
    condition     = toset(keys(cloudflare_dns_record.marble)) == toset(["marble.rogi.chat", "marble-api.rogi.chat"])
    error_message = "Only the two approved marble records may be managed."
  }
  assert {
    condition     = alltrue([for record in cloudflare_dns_record.marble : record.type == "A" && record.content == "203.0.113.10" && !record.proxied && record.ttl == 300])
    error_message = "Records must be DNS-only A records with TTL 300 to the reviewed EIP."
  }
}
