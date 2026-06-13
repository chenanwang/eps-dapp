import { vi, describe, it, expect, beforeEach } from 'vitest';
vi.mock('resend');
const mockSend = vi.fn().mockResolvedValue({ id: 'test' });
vi.mock('../lib/email/resend-client', () => ({ resend: { emails: { send: mockSend } } }));
vi.mock('../lib/prisma', () => ({ prisma: { notice: { findUnique: vi.fn().mockResolvedValue({ id: '1', caseRef: 'REF-001', service: { recipientEmail: 'test@example.com' } }) } } }));
import { sendNotifiedReceipt } from '../lib/email/send-notified-receipt';
import { sendFirstAccessAlert } from '../lib/email/send-first-access-alert';
describe('email helpers', () => {
  beforeEach(() => { mockSend.mockClear(); });
  it('sendNotifiedReceipt calls resend', async () => { await sendNotifiedReceipt('1'); expect(mockSend).toHaveBeenCalledOnce(); });
  it('sendFirstAccessAlert calls resend', async () => { await sendFirstAccessAlert('1'); expect(mockSend).toHaveBeenCalledOnce(); });
});
