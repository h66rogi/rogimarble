# Rogimarble repository guidance

Read `README.md` and the relevant contract documents under `docs/` before changing behavior. The authoritative behavior is the executable code and tests; update the matching public documentation when contracts change.

- Keep game results server authoritative. Browser animation callbacks and OBS connectivity never commit game state.
- Match donation rules by exact registered count. Consecutive rolls require explicit activation and a separate count-to-rollCount rule.
- Keep board cell IDs, path, display text and typed effects independent. Reject unresolved effects when publishing or starting a session.
- Preserve published configuration versions and accepted request snapshots. Record manual changes as operator commands and ledger entries rather than synthetic donations.
- Keep the collector in its own repository and communicate through authenticated gRPC. Do not copy secrets, private deployment state, user data or unrelated source history into this repository.
- Preserve the existing console shell. Use shared Shadcn UI components for new controls and run `pnpm --filter @rogimarble/web lint:design` with web typecheck, tests and build for UI changes.
- From this workspace, source `../.tools/use-node22.sh` before Node commands. The lockfile specifies pnpm 12.5.1.
