variable "aws_account_id" {
  type = string
  validation {

    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "AWS account ID must be 12 digits."
  }
}

variable "region" {
  type = string
}

variable "name" {
  type    = string
  default = "rogimarble-prod"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.42.1.0/24"
}

variable "availability_zone" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
