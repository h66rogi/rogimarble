provider "aws" {

  region = var.region

  allowed_account_ids = [var.aws_account_id]
}
locals {
  tags = merge(var.tags, {
    Project = "rogimarble", Environment = "prod", ManagedBy = "terraform"
  })
}
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = merge(local.tags, {
    Name = "${var.name}-vpc"
  })
}
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags = merge(local.tags, {
    Name = "${var.name}-igw"
  })
}
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true
  tags = merge(local.tags, {
    Name = "${var.name}-public"
  })
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags = merge(local.tags, {
    Name = "${var.name}-public"
  })
}
resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
output "vpc_id" {
  value = aws_vpc.main.id
}
output "public_subnet_id" {
  value = aws_subnet.public.id
}
output "availability_zone" {
  value = aws_subnet.public.availability_zone
}
