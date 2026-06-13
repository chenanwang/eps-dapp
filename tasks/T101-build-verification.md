# T101 - Build Verification and TypeScript Clean Compile

Status: PENDING
Blocker for: All subsequent tasks
Estimated turns: 30

## Goal
Get pnpm build to exit 0 with zero TypeScript errors and zero ESLint errors.

## Steps

### 1. Install dependencies
pnpm install --no-frozen-lockfile

### 2. TypeScript check
pnpm exec tsc --noEmit 2>&1 | head -80
Fix every error. Common issues:
- Missing types for viem, @ensdomains/ensjs, @hashgraph/sdk, @dynamic-labs-wallet/node, @unlink-xyz/sdk
- any used where strict types expected
- Missing await on async calls in API routes

### 3. ESLint check
pnpm exec eslint . --max-warnings 0 2>&1 | tail -40
Fix all warnings and errors.

### 4. Next.js build
pnpm build 2>&1 | tail -60

### 5. Commit
git add -A
git commit -m "fix(T101): clean compile - zero TS errors, zero ESLint warnings"

## Definition of Done
- pnpm exec tsc --noEmit exits 0
- pnpm build exits 0
- No @ts-ignore added (fix root cause instead)
- Mark this file Status: DONE and commit

## Notes
- Do NOT change any API surface or business logic - only fix types
- If a third-party package has no types, add a types/ declaration file
- lib/payments/UnlinkPrivacy.ts uses dynamic import - ensure the type is correct
- lib/hedera/HederaAgentKit.ts - add @ts-ignore ONLY if no types exist after 2 attempts
