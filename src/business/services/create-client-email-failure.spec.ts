import { ClientService } from './client.service';

// createClient's welcome email is sent after the client + login account are
// already committed to the database. If sending it fails (SendGrid down, bad
// address, whatever), that must never be reported back as "failed to create
// the client" -- the client and a real, working login already exist at that
// point. A merchant seeing a failure message would retry with the same email
// and hit a confusing "Client already exists" instead.

function setup(overrides: Partial<Record<string, any>> = {}) {
  const service: any = Object.create(ClientService.prototype);

  const savedClient = { id: 'client-1', email: 'new.client@example.com' };
  const newUser = { id: 'user-1', email: 'new.client@example.com', firstName: 'New', surname: 'Client' };

  service.businessRepo = { findOne: jest.fn().mockResolvedValue({ id: 'biz-1', businessName: 'Gold Salon' }) };
  service.clientRepo = { findOne: jest.fn().mockResolvedValue(null) }; // no existing client for this email/owner
  service.dataSource = {
    transaction: jest.fn((fn: any) =>
      fn({
        findOne: jest.fn().mockResolvedValue(null), // no existing client inside the transaction
        // Handles both call shapes createClient actually uses:
        // manager.save(ClientSchema, {...profile}) and manager.save(newUser).
        save: jest.fn(async (a: any, b?: any) =>
          b !== undefined
            ? { ...b, id: b.id ?? savedClient.id }
            : { ...a, id: a.id ?? newUser.id },
        ),
        insert: jest.fn(),
        create: jest.fn((_entity: any, data: any) => ({ ...data })),
      }),
    ),
  };
  service.getClientWithRelations = jest.fn().mockResolvedValue({ profile: savedClient });
  service.sendWelcomeClientAccountEmail = jest.fn().mockRejectedValue(new Error('SendGrid is down'));

  Object.assign(service, overrides);
  return service;
}

const clientData: any = {
  profile: {
    firstName: 'New',
    lastName: 'Client',
    email: 'new.client@example.com',
    gender: 'MALE',
    pronouns: 'other',
    clientType: 'regular',
    clientSource: 'walk-in',
  },
};

describe('createClient — welcome email failure', () => {
  it('still reports success when the client and login were created but the welcome email fails to send', async () => {
    const service = setup();

    const result = await service.createClient(clientData, 'owner-1', null);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Client created successfully');
    expect(service.sendWelcomeClientAccountEmail).toHaveBeenCalled();
  });

  it('logs the email failure instead of swallowing it silently', async () => {
    const service = setup();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await service.createClient(clientData, 'owner-1', null);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send welcome email'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
