<!-- EPS dApp — phase-gate PR template. Fill in every section. -->

## Summary
<!-- What changed and why. Link the task ID from docs/PHASES.md. -->

- Task: T-XXX
- Phase: PX

## Definition of Done (per CLAUDE.md)
- [ ] Code + tests written; `pnpm lint && pnpm typecheck && pnpm test` green locally
- [ ] Integration tests green if this touches chain, Stripe, storage, or the worker
- [ ] Prisma migration included if schema changed; seed updated
- [ ] `docs/PHASES.md` task row updated (Status, commit SHA, Notes)
- [ ] Conventional commit; one logical change per commit

## Security / compliance checklist (hard rules)
- [ ] No private key, seed phrase, or API secret in code, fixtures, logs, or DB
- [ ] No code/test/script points at `mainnet-beta`; `assertNotMainnet()` guard intact
- [ ] No document bytes in logs; storage objects private + encrypted at rest
- [ ] Tx signature persisted BEFORE awaiting confirmation; confirmed at `finalized`
- [ ] Every state transition writes an `AuditLog` row in the same DB transaction
- [ ] Stripe in test mode only (no live-mode keys/products)
- [ ] Legal copy unchanged, or PR tagged `needs-legal-copy-review` for human review

## Phase gate
<!-- Paste the gate criteria for this phase from docs/PHASES.md and confirm they are met. -->
- [ ] Phase gate criteria met
- [ ] CI fully green (lint, typecheck, unit, integration as applicable, gitleaks, mainnet-grep)

## Notes
<!-- ADRs, blockers, follow-ups. -->
