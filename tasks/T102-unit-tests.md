# T102 - Unit Tests (Vitest) - All Green

Status: DONE
Depends on: T101
Estimated turns: 40

## Result (2026-06-13)
- 138 unit tests green (97 existing + 41 new), `vitest run` exits 0.
- New test files: __tests__/ens/ENSResolver.test.ts, __tests__/hedera/HederaService.test.ts,
  __tests__/payments/DynamicFlow.test.ts, __tests__/payments/UnlinkPrivacy.test.ts,
  __tests__/chain/EVMAdapter.test.ts.
- Coverage (new modules): stmts 94.8% / lines 95.4% / funcs 100% — all ≥80%.
  Per-file lines: ENSResolver 92.3%, HederaService 100%, DynamicFlow 100%,
  UnlinkPrivacy 81.8%, EVMAdapter 94.2%.
- Install fix: removed unused phantom dep `@dynamic-labs/sdk-api@^3.0.0` (imported
  nowhere; no such version on npm — it blocked `pnpm install`).
- Added dev tooling: `@vitest/coverage-v8@4.1.8` (version-matched to vitest).
- Tested the REAL exported APIs (resolveENS, submitToHCS/mintProofNFT, validateAddress,
  createFlowSession/parseFlowWebhook, depositToPrivateAccount) which differ from the
  brief's placeholder names; modules degrade gracefully (return null) rather than throw.
- Out of scope / pre-existing: `pnpm typecheck` still reports T101 debt in
  lib/hedera/HederaService.ts, lib/agents/DynamicServerWallet.ts, lib/payments/UnlinkPrivacy.ts,
  scripts/*, and existing certificate-pdf/post-confirm-verify tests. New test files are
  type-clean and lint-clean.

## Goal
pnpm test exits 0. Every Vitest unit test passes. Coverage for new modules >= 80%.

## Steps

### 1. Run existing tests
pnpm test --run 2>&1
Note every failure.

### 2. Fix failing tests
Fix root cause in source or test. Do NOT skip tests with .skip.

### 3. Write missing unit tests for new modules

#### lib/ens/ENSResolver.ts -> __tests__/ens/ENSResolver.test.ts
- Mock createEnsPublicClient with vi.mock
- Test: resolveAddress('vitalik.eth') returns { address: '0xd8dA...', displayName: 'vitalik.eth' }
- Test: resolveAddress('0xd8dA...') returns primary name via reverse lookup
- Test: invalid input throws ENSResolutionError

#### lib/hedera/HederaService.ts -> __tests__/hedera/HederaService.test.ts
- Mock @hashgraph/sdk Client, TopicMessageSubmitTransaction, TokenMintTransaction
- Test: submitHCSMessage(deliveryId) returns { sequenceNumber, consensusTimestamp, mirrorUrl }
- Test: mintNFT returns { serialNumber, mirrorUrl }
- Test: graceful error when SDK throws (returns null, does not throw)

#### lib/payments/DynamicFlow.ts -> __tests__/payments/DynamicFlow.test.ts
- Mock fetch
- Test: createFlowSession returns null when DYNAMIC_BEARER_TOKEN is unset
- Test: parseFlowWebhook extracts { amount, currency, payer }

#### lib/payments/UnlinkPrivacy.ts -> __tests__/payments/UnlinkPrivacy.test.ts
- Mock dynamic import of @unlink-xyz/sdk
- Test: depositToPrivateAccount calls deposit() with correct args
- Test: graceful failure when SDK throws

#### lib/chain/EVMAdapter.ts -> __tests__/chain/EVMAdapter.test.ts
- Mock viem createPublicClient, createWalletClient
- Test: validateRecipientAddress('0x...') returns { valid: true, normalised: '0x...' }
- Test: validateRecipientAddress('notanaddress') returns { valid: false }

### 4. Run coverage
pnpm test --run --coverage 2>&1 | tail -30

### 5. Commit
git add -A
git commit -m "test(T102): vitest unit tests - all green, coverage >=80% for new modules"

## Definition of Done
- pnpm test --run exits 0
- No .skip or .todo added without explanation
- All new modules have test files
- Mark this file Status: DONE and commit
