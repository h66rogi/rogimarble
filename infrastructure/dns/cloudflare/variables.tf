variable "zone_id" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.zone_id))
    error_message = "zone_id must be a Cloudflare zone identifier."
  }
}
variable "publish_dns" {
  type        = bool
  default     = false
  description = "Explicit cutover gate. False produces no DNS resources."
}
variable "marble_eip" {
  type      = string
  sensitive = true
  default   = null
  validation {
    condition     = !var.publish_dns || can(cidrnetmask("${var.marble_eip}/32"))
    error_message = "Publishing requires the verified marble IPv4 EIP."
  }
}
