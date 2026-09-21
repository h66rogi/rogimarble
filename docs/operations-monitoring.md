# Production monitoring baseline

This document defines the first two-host monitoring contract. It does not claim that alarms, notifications, backups, or dashboards have been deployed. Current provisioning evidence is tracked in [deployment readiness](deployment-readiness.md).

## Marble host signals

The rogimarble product root should own CloudWatch alarms for its single EC2 instance:

- `StatusCheckFailed_System` and `StatusCheckFailed_Instance`: maximum at least 1 for two consecutive five-minute periods; missing data is `missing`, not a failure.
- `CPUUtilization`: average above 85% for three consecutive five-minute periods. This is capacity pressure, not proof of an application outage.
- `CPUCreditBalance`: minimum below the reviewed reserve for three consecutive five-minute periods on the `t8i.medium` burstable instance. Final threshold must be based on observed broadcast load.

The initial dashboard should show these metrics and the alarm states for the marble and collector instance IDs. Alarm actions remain empty until an existing approved alert destination is identified. Creating an SNS topic, email subscription, Slack webhook, or paging integration without an owner is outside this baseline.

Application and host readiness remain separate. CloudWatch EC2 status does not prove Compose, migration, PostgreSQL, Redis, HTTP readiness, collector connectivity, or backup success. Runtime status helpers and edge checks provide that evidence.

## Backup freshness contract

S3 object storage metrics do not directly establish that the latest application backup is recent and restorable. Each successful, verified backup job should publish `LastSuccessfulBackupAgeSeconds=0` to the custom namespace `Rogi/rogimarble`, then periodically publish its current age or a timestamp-derived age. The instance role may receive `cloudwatch:PutMetricData` only with a namespace condition for `Rogi/rogimarble`.

A freshness alarm is enabled only after the backup job emits this metric and a successful restore baseline exists. It treats missing data as breaching after the agreed startup grace period. Thresholds must follow the measured backup schedule and restore runbook rather than claiming the design RPO as achieved.

## Deployment gate

Before enabling notifications, record the alarm owner, destination, expected response, maintenance suppression process, and test evidence. Verify status alarm behavior with read-only inspection or a controlled later exercise; do not impair a production instance merely to test an alarm.

The periodic updater's successful health/no-op check means only that the deployed receipt still matches a healthy active release; it does not prove that private GHCR credentials are available. New-release deployment is driven by the trusted `private-deploy` workflow while its packages-read job token is temporarily present in the dedicated Secrets Manager entry. Monitor the fixed SSM command result and the receipt SHA returned by `production-status.py` against the triggering release SHA without logging the full private status document. If that run fails, rerun the failed `private-deploy` workflow to mint a new job token. Do not install a human PAT or make an anonymous registry fallback part of recovery.

## Implemented IaC baseline

The product root now creates the four host alarms and a CloudWatch dashboard and outputs `monitoring_dashboard_url` plus `monitoring_alarm_names`. Every `alarm_actions` and `ok_actions` list is empty. The dashboard and alarms may incur CloudWatch charges; deployment readiness must include them in the cost review. Backup freshness remains documentation-only until a real emitter exists.
