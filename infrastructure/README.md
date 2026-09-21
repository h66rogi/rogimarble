# AWS infrastructure roots

These roots prepare a two-host feedback deployment. `network` owns only the shared VPC and public subnet. `environments/prod` owns the rogimarble host, its security group, retained data EBS volume, SSM role, empty Secrets Manager containers, and backup bucket.

State, backend configuration, AMI IDs, account-specific names, plans, and tfvars stay outside this repository. Apply `network` first, then rogimarble `environments/prod`, then the collector root using the `marble_security_group_id` output.

Terraform never formats the data volume or writes secret values. Follow [infrastructure preparation](../docs/infrastructure-preparation.md) before an apply.

`terraform test` uses the AWS mock provider. Its `apply` runs only against in-memory mock resources and never contacts or mutates AWS. Credentialed saved plans and every real apply remain approved-operator actions outside this repository.
