# ADR 001 — Adopt `zod` for server-side input validation

- Status: Accepted
- Date: 2026-06-12
- Task: P2 / T-203 (Case-caption form + attestation + court-order flag)

## Context

T-203 introduces the first API route that accepts a multi-field, structured
request body from the browser (`POST /api/service-requests`: case caption,
parties, recipient wallet, court-order flag, attestation). The phase gate is
explicit that **bad input must be rejected before any quota is consumed**, so
the route needs robust, declarative server-side validation that produces
per-field error messages the intake form can surface.

Earlier routes (`/api/checkout`, `/api/admin/comp-grant`) hand-rolled validation
because they take a single scalar field. Hand-rolling validation for a 6-field
object — with trimming, length bounds, a required-`true` literal, and structured
field errors — is verbose and error-prone, and every future intake/admin route
in P2–P5 will face the same need. The T-203 issue specifies `zod` for
server-side validation.

CLAUDE.md requires an ADR before adding any new dependency.

## Decision

Add `zod` (^4) as a production dependency and use it for server-side request-body
validation, starting with `POST /api/service-requests`. Schemas live next to the
route (or in `lib/` when shared) and are parsed with `safeParse`; field errors
are returned to the client via `z.flattenError(...).fieldErrors`.

`zod` is a well-established, dependency-free, TypeScript-first validation library
that infers static types from schemas — keeping the wire contract and the
TypeScript types in one place. It does not replace domain validators that encode
business rules (e.g. `lib/solana/validate-address.ts` for on-curve checks); those
still run after shape validation passes.

## Consequences

- One new runtime dependency (`zod`), zero transitive additions of note.
- Future API routes should prefer a `zod` schema over hand-rolled checks for any
  non-trivial body; the two existing single-field routes may be migrated
  opportunistically but are not required to change.
- Validation error responses gain a consistent `{ error, issues }` shape that
  forms can map to per-field messages.
