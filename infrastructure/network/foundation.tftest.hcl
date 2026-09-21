mock_provider "aws" {}

run "network_contract" {
  command = plan
  variables {
    aws_account_id    = "123456789012"
    region            = "ap-northeast-2"
    availability_zone = "ap-northeast-2a"
  }
  assert {
    condition     = aws_vpc.main.enable_dns_support && aws_vpc.main.enable_dns_hostnames
    error_message = "VPC DNS must be enabled."
  }
  assert {
    condition     = aws_subnet.public.map_public_ip_on_launch
    error_message = "Public subnet must provide outbound public addressing."
  }
  assert {
    condition     = aws_route.internet.destination_cidr_block == "0.0.0.0/0"
    error_message = "Public route is missing."
  }
}
