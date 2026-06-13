# T106 - Delivery Worker - Full Pipeline

Status: PENDING
Depends on: T101, T105
Estimated turns: 40

## Goal
Worker polls PAID orders, sends on-chain tx, records HCS/HTS, generates PDF, emails certificate.

## Pipeline (implement in worker/process.ts)
1. Download document from R2
2. Compute SHA-256 hash
3. ChainAdapter.deliverService(recipientAddress, serviceRecord) -> txHash
4. HederaService.submitHCSMessage(deliveryId) [NON-BLOCKING - failure must not fail delivery]
5. HederaService.mintNFT(deliveryId) [NON-BLOCKING]
6. Generate PDF certificate with all fields
7. Upload certificate to R2
8. Send email via Resend (PDF attached or linked)
9. Update ServiceRequest.status = DELIVERED

## PDF Certificate must include
- Case reference, delivery timestamp from block
- Recipient address + ENS display name
- Serving entity + agent ENS name
- TX hash + explorer URL
- HCS sequence number + mirror node URL
- HTS NFT serial number + mirror node URL
- Document SHA-256 hash
- QR code to explorer URL

## Error handling
- Wrap entire job in try/catch
- On failure: status = FAILED, increment attempts, retry up to 3x with exponential backoff
- HCS/HTS in separate try/catch (non-blocking)
- Log all errors with structured JSON

## Steps
1. cat worker/index.ts && cat worker/process.ts
2. Fix/complete process.ts per pipeline above
3. Check lib/certificate-pdf.ts has all required fields
4. Verify Resend sends email with PDF
5. Local test:
   pnpm worker &
   pnpm exec ts-node scripts/create-test-order.ts
   tail -f logs/worker.log
6. Write tests: __tests__/worker/process.test.ts
7. git add -A && git commit -m "feat(T106): delivery worker - full pipeline chain tx -> HCS/HTS -> PDF cert -> email"

## Definition of Done
- Worker processes a PAID order end-to-end
- PDF has all required fields
- HCS/HTS non-blocking (logged on failure, does not fail delivery)
- Email sent via Resend
- Failed jobs: marked FAILED with error, admin alerted
- Unit tests in __tests__/worker/process.test.ts
- Mark this file Status: DONE and commit
