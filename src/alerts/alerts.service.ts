import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { SystemAlert, SystemAlertAudience } from './entities/system-alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(SystemAlert)
    private readonly alertRepo: Repository<SystemAlert>,
  ) {}

  async create(dto: CreateAlertDto, createdBy?: string): Promise<SystemAlert> {
    // An alert that has already expired would say "published" and never be shown.
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date()) {
      throw new BadRequestException('The expiry must be in the future.');
    }
    const alert = this.alertRepo.create({
      title: dto.title,
      message: dto.message,
      severity: dto.severity,
      audience: dto.audience,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdBy: createdBy ?? null,
    });
    return this.alertRepo.save(alert);
  }

  async findAllForAdmin(): Promise<SystemAlert[]> {
    return this.alertRepo.find({ order: { createdAt: 'DESC' } });
  }

  // Active, not expired, and visible to this audience (ALL alerts show
  // to everyone; a MERCHANT/CUSTOMER alert only shows to that audience).
  async findActiveForAudience(audience: SystemAlertAudience): Promise<SystemAlert[]> {
    const now = new Date();
    const alerts = await this.alertRepo.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    return alerts.filter(
      (a) =>
        (a.audience === audience || a.audience === SystemAlertAudience.ALL) &&
        (!a.expiresAt || a.expiresAt > now),
    );
  }

  async deactivate(id: string): Promise<SystemAlert> {
    const alert = await this.alertRepo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    alert.isActive = false;
    return this.alertRepo.save(alert);
  }
}
