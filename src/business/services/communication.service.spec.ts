import { ForbiddenException } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { CommunicationService } from './communication.service';

// SendGrid is replaced, so nothing here sends a real email.
jest.mock('@sendgrid/mail', () => ({ __esModule: true, default: { setApiKey: jest.fn(), send: jest.fn() } }));

const send = sgMail.send as unknown as jest.Mock;

const OWNER = { id: 'owner-1' };
const OTHER_OWNER = { id: 'owner-2' };
const ADMIN = { id: 'admin-1', isStaff: true };

type C = { id: string; email: string; firstName: string; lastName: string; ownerId: string; isActive: boolean };
const client = (id: string, email: string, over: Partial<C> = {}): C => ({
  id, email, firstName: 'Ada', lastName: 'Obi', ownerId: 'owner-1', isActive: true, ...over,
});

const businesses = [
  { id: 'biz-1', ownerId: 'owner-1', businessName: 'Da Liv' },
  { id: 'biz-2', ownerId: 'owner-2', businessName: 'Other Salon' },
];

function build(clients: C[]) {
  const clientRepo = {
    find: jest.fn(async ({ where }: any) =>
      clients.filter(
        (c) =>
          (where.id.value as string[]).includes(c.id) &&
          c.isActive === where.isActive &&
          (where.ownerId === undefined || c.ownerId === where.ownerId),
      ),
    ),
  };
  const businessRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      businesses.find((b) => (where.id ? b.id === where.id : b.ownerId === where.ownerId)) ?? null,
    ),
  };
  const communicationRepo = { create: jest.fn((v) => ({ ...v })), save: jest.fn(async (v) => v) };
  const templateService = { render: jest.fn(() => '<html></html>') };
  const service = new CommunicationService(communicationRepo as any, clientRepo as any, businessRepo as any, templateService as any);
  return { service, communicationRepo, templateService };
}

const recipient = (c: { id: string; email: string }, name = 'Ada Obi') => ({ clientId: c.id, clientEmail: c.email, clientName: name });
const bulk = (recipients: any[], over: object = {}) => ({ recipients, message: 'Hello everyone', messageSubject: 'sale on friday', messageType: 'email', ...over }) as any;

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  process.env.SENDGRID_API_KEY = 'test-key';
  process.env.SENDGRID_FROM_EMAIL = 'noreply@khs.test';
  send.mockReset();
  send.mockResolvedValue([{ statusCode: 202 }]);
});

describe('sending a bulk message', () => {
  it("emails the merchant's own clients, from their own salon, at the address on file", async () => {
    const a = client(ID1, 'ada@example.com');
    const { service, templateService } = build([a]);

    const result = await service.sendBulkCustomMessages(bulk([recipient(a)]), OWNER);

    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com', subject: 'Sale On Friday' }));
    expect(templateService.render).toHaveBeenCalledWith('communication-bulk', expect.objectContaining({ businessName: 'Da Liv' }));
  });

  it("does not email another merchant's client", async () => {
    const theirs = client(ID2, 'bo@example.com', { ownerId: 'owner-2' });
    const { service } = build([theirs]);

    const result: any = await service.sendBulkCustomMessages(bulk([recipient(theirs, 'Bo')]), OWNER);

    expect(result.success).toBe(false);
    expect(result.invalidRecipients).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends to the valid ones and reports the rest', async () => {
    const mine = client(ID1, 'ada@example.com');
    const theirs = client(ID2, 'bo@example.com', { ownerId: 'owner-2' });
    const { service } = build([mine, theirs]);

    const result: any = await service.sendBulkCustomMessages(bulk([recipient(mine), recipient(theirs, 'Bo')]), OWNER);

    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.message).toMatch(/Sent to 1 of 2|sent to 1 of 2/i);
    expect(result.message).toContain('bo@example.com');
  });

  it('does not email a client who was deleted', async () => {
    const gone = client(ID1, 'ada@example.com', { isActive: false });
    const { service } = build([gone]);
    const result: any = await service.sendBulkCustomMessages(bulk([recipient(gone)]), OWNER);
    expect(result.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not email an address that is not the one on file', async () => {
    const a = client(ID1, 'ada@example.com');
    const { service } = build([a]);
    const result: any = await service.sendBulkCustomMessages(bulk([{ clientId: a.id, clientName: 'Ada', clientEmail: 'someone.else@example.com' }]), OWNER);
    expect(result.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('matches the address without caring about capital letters', async () => {
    const a = client(ID1, 'Ada@Example.com');
    const { service } = build([a]);
    const result: any = await service.sendBulkCustomMessages(bulk([{ clientId: a.id, clientName: 'Ada', clientEmail: 'ada@example.COM' }]), OWNER);
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'Ada@Example.com' }));
  });

  it('sends only once to a client who is listed twice', async () => {
    const a = client(ID1, 'ada@example.com');
    const { service } = build([a]);
    await service.sendBulkCustomMessages(bulk([recipient(a), recipient(a)]), OWNER);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses to send as someone else's salon, and sends nothing", async () => {
    const a = client(ID1, 'ada@example.com');
    const { service } = build([a]);
    await expect(service.sendBulkCustomMessages(bulk([recipient(a)], { businessId: 'biz-2' }), OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(send).not.toHaveBeenCalled();
  });

  it('lets a merchant name their own salon', async () => {
    const a = client(ID1, 'ada@example.com');
    const { service, templateService } = build([a]);
    const result = await service.sendBulkCustomMessages(bulk([recipient(a)], { businessId: 'biz-1' }), OWNER);
    expect(result.success).toBe(true);
    expect(templateService.render).toHaveBeenCalledWith('communication-bulk', expect.objectContaining({ businessName: 'Da Liv' }));
  });

  it('lets a platform admin message any merchant\'s client', async () => {
    const theirs = client(ID2, 'bo@example.com', { ownerId: 'owner-2' });
    const { service } = build([theirs]);
    const result = await service.sendBulkCustomMessages(bulk([recipient(theirs, 'Bo')]), ADMIN);
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one recipient fails, and records only those it reached', async () => {
    const a = client(ID1, 'ada@example.com');
    const b = client(ID2, 'bo@example.com', { firstName: 'Bo' });
    const { service, communicationRepo } = build([a, b]);
    send.mockImplementation(async (msg: any) => {
      if (msg.to === 'bo@example.com') throw new Error('mailbox full');
      return [{ statusCode: 202 }];
    });

    const result: any = await service.sendBulkCustomMessages(bulk([recipient(a), recipient(b, 'Bo')]), OWNER);

    expect(result.success).toBe(true);
    expect(result.message).toContain('bo@example.com');
    const saved = communicationRepo.save.mock.calls[0][0];
    expect(saved.recipients.map((r: any) => r.clientEmail)).toEqual(['ada@example.com']);
    expect(saved.businessId).toBe('biz-1');
  });

  it('says so, and saves nothing, when every send fails', async () => {
    const a = client(ID1, 'ada@example.com');
    const { service, communicationRepo } = build([a]);
    send.mockRejectedValue(new Error('unauthorized'));

    const result: any = await service.sendBulkCustomMessages(bulk([recipient(a)]), OWNER);

    expect(result.success).toBe(false);
    expect(result.failedRecipients).toHaveLength(1);
    expect(communicationRepo.save).not.toHaveBeenCalled();
  });

  it('asks for at least one recipient', async () => {
    const { service } = build([]);
    const result: any = await service.sendBulkCustomMessages(bulk([]), OWNER);
    expect(result.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('sending a direct message', () => {
  const direct = (c: { id: string; email: string }, over: object = {}) =>
    ({ clientId: c.id, clientEmail: c.email, clientName: 'Ada Obi', message: 'Hi Ada', messageSubject: 'your booking', messageType: 'email', ...over }) as any;

  it("emails the merchant's own client", async () => {
    const a = client(ID1, 'ada@example.com');
    const { service } = build([a]);
    const result = await service.sendDirectMessage(direct(a), OWNER);
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com', subject: 'Your Booking' }));
  });

  it("refuses another merchant's client", async () => {
    const theirs = client(ID2, 'bo@example.com', { ownerId: 'owner-2' });
    const { service } = build([theirs]);
    const result = await service.sendDirectMessage(direct(theirs), OWNER);
    expect(result.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses to send as someone else's salon", async () => {
    const a = client(ID1, 'ada@example.com');
    const { service } = build([a]);
    await expect(service.sendDirectMessage(direct(a, { businessId: 'biz-2' }), OTHER_OWNER.id ? { id: 'owner-3' } : OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(send).not.toHaveBeenCalled();
  });
});
