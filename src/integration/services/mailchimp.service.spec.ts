import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { MailchimpService } from './mailchimp.service';

jest.mock('axios');
jest.mock('src/admin/platform-settings/utils/settings-encryption.util', () => ({
  encrypt: (v: string) => `enc(${v})`,
  decrypt: (v: string) => v.replace(/^enc\((.*)\)$/, '$1'),
}));

// Built at runtime: a literal key-shaped string in the source trips GitHub's secret scanning.
const KEY = `${'0123456789abcdef'.repeat(2)}-us21`;

describe('MailchimpService.connect', () => {
  let credsRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let ownerSettings: { update: jest.Mock };
  let access: { assertOwnsBusiness: jest.Mock };
  let get: jest.Mock;
  let service: MailchimpService;

  beforeEach(() => {
    credsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };
    ownerSettings = { update: jest.fn().mockResolvedValue(undefined) };
    access = { assertOwnsBusiness: jest.fn().mockResolvedValue(undefined) };
    get = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ get, put: jest.fn() });
    service = new MailchimpService(credsRepo as any, {} as any, ownerSettings as any, access as any);
  });

  const lists = (...names: string[]) =>
    get.mockImplementation(async (path: string) =>
      path === '/ping'
        ? { data: {} }
        : { data: { lists: names.map((name, i) => ({ id: `aud-${i + 1}`, name })) } },
    );

  it("checks the caller owns the salon before anything else", async () => {
    access.assertOwnsBusiness.mockRejectedValue(new Error('forbidden'));
    await expect(service.connect('owner-1', 'biz-9', { apiKey: KEY })).rejects.toThrow('forbidden');
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects something that is not a Mailchimp key without calling Mailchimp', async () => {
    await expect(service.connect('owner-1', 'biz-1', { apiKey: 'nope' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('connects straight away when the account has one audience, storing the key encrypted', async () => {
    lists('Salon list');
    const result = await service.connect('owner-1', 'biz-1', { apiKey: KEY });
    expect(result).toEqual({ connected: true, audienceName: 'Salon list' });
    expect(credsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: `enc(${KEY})`, serverPrefix: 'us21', audienceId: 'aud-1' }),
    );
    expect(ownerSettings.update).toHaveBeenCalledWith('owner-1', 'biz-1', {
      integrations: { mailChimp: true },
    });
  });

  it('asks which audience to use when there are several, and saves nothing yet', async () => {
    lists('One', 'Two');
    const result = await service.connect('owner-1', 'biz-1', { apiKey: KEY });
    expect(result).toEqual({
      connected: false,
      needsAudience: true,
      audiences: [
        { id: 'aud-1', name: 'One' },
        { id: 'aud-2', name: 'Two' },
      ],
    });
    expect(credsRepo.save).not.toHaveBeenCalled();
  });

  it('connects to the audience the merchant picked', async () => {
    lists('One', 'Two');
    const result = await service.connect('owner-1', 'biz-1', { apiKey: KEY, audienceId: 'aud-2' });
    expect(result).toEqual({ connected: true, audienceName: 'Two' });
    expect(credsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ audienceId: 'aud-2' }));
  });

  it('refuses an audience that is not in the merchant\'s account', async () => {
    lists('One');
    await expect(
      service.connect('owner-1', 'biz-1', { apiKey: KEY, audienceId: 'aud-99' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('explains when Mailchimp rejects the key', async () => {
    get.mockRejectedValue({ response: { status: 401 } });
    await expect(service.connect('owner-1', 'biz-1', { apiKey: KEY })).rejects.toThrow(
      'Mailchimp did not accept that API key.',
    );
    expect(credsRepo.save).not.toHaveBeenCalled();
  });

  it('explains when the account has no audience', async () => {
    lists();
    await expect(service.connect('owner-1', 'biz-1', { apiKey: KEY })).rejects.toThrow(
      /no audience/,
    );
  });
});
