# Infrastructure preparation

This is the AWS foundation for the first feedback deployment, not evidence that either application is deployed or production-ready. Current deployment evidence, selected private inputs, verified AWS pricing, and remaining gates are recorded in [deployment readiness](deployment-readiness.md).

## Roots, state, and apply order

Use Terraform 1.16.2 with AWS provider 6.65.0. Lock files contain signed checksums for Linux amd64 and Darwin arm64. Each root declares an S3 backend; its approved encrypted, versioned, public-blocked bucket configuration and isolated state key remain outside Git.

Apply in this order:

1. `infrastructure/network` owns the VPC, public subnet, internet gateway, and route.
2. rogimarble `infrastructure/environments/prod` consumes network outputs and owns the marble host and security group.
3. rogi-collector `infrastructure/environments/prod` consumes network outputs and `marble_security_group_id`.

Pass outputs explicitly. No root reads or duplicates another root's resources. Keep tfvars, backend files, state, saved plans, AMI/account values, and secret values outside both repositories. The provider requires the intended 12-digit AWS account ID and refuses another account.

Before apply, run `terraform init`, `terraform fmt -check -recursive`, `terraform validate`, and `terraform test`. Tests use an in-memory mock provider and do not contact AWS. Store a credentialed plan outside Git, export it as JSON, and run `infrastructure/tools/reject-data-ebs-destroy.py PLAN.json`; malformed plans and any EBS delete or replacement are rejected.

## Host bootstrap and storage

The AMI must match Canonical owner `099720109477`, Ubuntu 24.04 Noble GP3, x86_64, HVM, and EBS checks. Terraform still requires a real regional AMI ID. Bootstrap installs the pinned official Docker Noble packages: Docker CE 29.8.1, containerd 2.3.5, Buildx 0.37.1, and Compose 5.5.1. It also installs Python 3, Git, curl, util-linux (`flock` and `findmnt`), and checksum-pinned Node 22.23.2 for runtime manifest validators. It verifies and enables the Canonical AMI's preinstalled SSM agent, supporting both deb and snap units.

Bootstrap creates `/opt/rogimarble/app`, `/etc/rogimarble`, `/run/rogimarble`, `/srv/rogimarble`, and `/usr/local/lib/rogimarble`. It installs a systemd `DOCKER-USER` guard that blocks container traffic to IPv4 and IPv6 EC2 metadata and is reapplied with Docker restarts. EC2 metadata also requires v2 tokens with hop limit 1. Runtime units require this guard before launching containers.

Terraform attaches an encrypted, separately retained data EBS volume but never formats or mounts it. During the authorized first deployment, match the Terraform volume ID to the stable device path and verify that the new volume has no filesystem before creating one. Record its UUID outside Git and mount it at `/srv/rogimarble`. If a filesystem already exists, formatting is prohibited. Replacement hosts attach and mount the existing filesystem. Runtime host preparation must verify the exact mount point and UUID before creating PostgreSQL, Redis, or Caddy bind directories; a missing or wrong mount blocks migration and startup.

## Network, DNS, registry, and cost boundary

There is no public SSH, PostgreSQL, or Redis ingress. The public subnet and public IPv4 enable SSM, package, and registry access. The marble security group exposes only HTTP and HTTPS. Collector TCP 7443 is restricted to the marble security group and remains unusable until application mTLS and RPC gates pass.

The marble root owns an attached EIP and outputs a `dns_records` mapping for `marble.rogi.chat` and `marble-api.rogi.chat`. DNS is managed in Cloudflare outside these AWS roots; an approved operator changes the A records after the EIP and edge certificate configuration are ready. No Route53 zone is created. The existing `.rogi.chat` shared-cookie SSO adapter contract is confirmed; issuer and cookie rollout remains a deployment readiness item rather than Terraform configuration.

Application images are published to private GHCR by the trusted GitHub Actions release workflow and consumed only by immutable digest. Terraform does not create a registry and grants no ECR permissions. After that trusted `main` release succeeds, the separate `private-deploy` workflow uses its job-scoped packages-read `GITHUB_TOKEN`, assumes the repository-scoped AWS role through OIDC, places the exact `{username,token}` value temporarily in the product registry Secrets Manager entry, and invokes the fixed product SSM document. The host uses a root-only Docker config under `/run` for the pull and removes it immediately; the workflow clears the current secret value on exit. EC2 stores no human PAT, persistent registry login, or GitHub credential file. Public GitHub Release assets contain only the checksummed release bundle and metadata; they do not make the GHCR images public. PostgreSQL, Redis, and Caddy use reviewed upstream image digests.

Before applying the GitHub delivery role trust, read the repository OIDC customization endpoint's complete response rather than projecting only legacy fields. When immutable subjects are enabled, use its returned immutable `sub_claim_prefix` plus the exact `:ref:refs/heads/main` suffix as a private Terraform input. Do not copy repository or organization numeric IDs into this public repository, and do not replace the exact subject with a wildcard. The manual `delivery-diagnostics` workflow prints only the public bounded claims `sub`, `aud`, `ref`, `job_workflow_ref`, and `repository`; it never prints the JWT.

The two-repository foundation incurs two EC2 hosts, two public IPv4 allocations, encrypted root and data EBS volumes, GHCR storage and transfer, Secrets Manager containers, and S3 backup storage and requests. Review the verified regional values in deployment readiness before apply. This document does not duplicate a price snapshot.
