import { BadRequestException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { SystemAlertAudience, SystemAlertSeverity } from './entities/system-alert.entity';

const build = () => {
  const repo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'a1', ...v })),
  };
  return { service: new AlertsService(repo as any), repo };
};

const base = { title: 'Maintenance', message: 'Tonight', severity: SystemAlertSeverity.INFO, audience: SystemAlertAudience.ALL };

describe('publishing a platform alert', () => {
  it('records who published it', async () => {
    const { service, repo } = build();
    await service.create(base, 'admin-1');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'admin-1' }));
  });

  it('refuses an expiry that has already passed', async () => {
    const { service, repo } = build();
    await expect(service.create({ ...base, expiresAt: new Date(Date.now() - 60_000).toISOString() }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('accepts a future expiry and no expiry at all', async () => {
    const { service, repo } = build();
    await service.create({ ...base, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, 'admin-1');
    await service.create(base, 'admin-1');
    expect(repo.save).toHaveBeenCalledTimes(2);
  });
});
