# Marble Cloudflare DNS cutover

This root owns only `marble.rogi.chat` and `marble-api.rogi.chat`. It cannot manage the zone, other records, proxy settings, certificates, or redirects. `publish_dns=false` is the default and creates no records.

Keep these outside Git with mode 0600:

- an S3 backend file using the approved encrypted/versioned bucket and a new isolated state key such as `rogimarble/prod/cloudflare.tfstate`;
- tfvars containing the existing private `zone_id`, `publish_dns`, and the verified marble EIP;
- saved plans, JSON plan exports, apply logs, and readback evidence.

Authentication is the approved zone-scoped DNS Edit token exported temporarily as `CLOUDFLARE_API_TOKEN`. Do not put it in tfvars, shell profiles, state, plans, logs, user data, or repository files.

Before cutover, run format, validate, and tests without credentials. With the private backend and inputs, inspect a saved plan that must show exactly two creates and zero changes/deletes. Apply only that saved plan. Read back both records through the Cloudflare API and independent public resolvers, then verify Caddy HTTPS for both hostnames. `prevent_destroy` makes removal a separate reviewed maintenance operation.
