# AWS infrastructure

Terraform roots under `network` and `environments/prod` define the network and Rogimarble host resources. The separate [rogi-collector](https://github.com/h66rogi/rogi-collector) repository owns its product root. Apply the network root, the Rogimarble root, then the collector root using explicit outputs. Each root has its own state.

Use the Terraform version and provider lock files declared in each root. Keep backend configuration, tfvars, account identifiers, AMI selections, saved plans, state and secret values outside this public repository. Review the plan before applying it. `infrastructure/tools/reject-data-ebs-destroy.py` checks a JSON plan for data volume deletion or replacement.

The host uses an encrypted retained data volume mounted at `/srv/rogimarble`. Terraform attaches the volume but does not format or mount it. Confirm the volume identity and filesystem UUID before host preparation. No public SSH, PostgreSQL or Redis ingress is required; the application edge uses HTTP/HTTPS and the collector link uses restricted internal traffic.

For release and runtime procedures, see [deployment and operations](../docs/deployment.md). `terraform test` uses the mock provider and does not change AWS resources.

## Validation

Run `terraform fmt -check -recursive`, `terraform init`, `terraform validate`, and `terraform test` in each root. Review the credentialed plan outside the repository and pass its JSON form to `infrastructure/tools/reject-data-ebs-destroy.py`. An apply uses the reviewed saved plan for the intended AWS account and region.

The network root owns the VPC, subnet, internet gateway and route. The Rogimarble root owns its host, security group, retained data volume, SSM role, secret containers, backup bucket and CloudWatch host dashboard. Outputs are passed to the collector root explicitly. No root reads another root's Terraform state directly.

## Host storage and access

The instance role is scoped to its runtime secret, deployment command, backup bucket and required service actions. Runtime secrets are loaded into `/run/rogimarble`; the application containers receive only the files they need. The host checks the data mount before creating persistent directories or starting services.

DNS records are created from the selected edge address outside these Terraform roots. Set the domain and certificate inputs in the private runtime overlay before starting the edge. Keep SSH, PostgreSQL and Redis off public ingress; use the managed host access path for administration.
