import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LandingStat } from '../entities/landing-stat.entity';
import { CreateLandingStatDto, UpdateLandingStatDto } from '../dtos/landing-stat.dto';

@Injectable()
export class LandingStatService {
  constructor(
    @InjectRepository(LandingStat)
    private readonly statRepo: Repository<LandingStat>,
  ) {}

  async create(dto: CreateLandingStatDto): Promise<LandingStat> {
    const stat = this.statRepo.create(dto);
    return this.statRepo.save(stat);
  }

  async findActive(): Promise<LandingStat[]> {
    return this.statRepo.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findAll(): Promise<LandingStat[]> {
    return this.statRepo.find({ order: { displayOrder: 'ASC', createdAt: 'ASC' } });
  }

  async update(id: string, dto: UpdateLandingStatDto): Promise<LandingStat> {
    const stat = await this.statRepo.findOne({ where: { id } });
    if (!stat) throw new NotFoundException('Stat not found');
    Object.assign(stat, dto);
    return this.statRepo.save(stat);
  }

  async remove(id: string): Promise<void> {
    const stat = await this.statRepo.findOne({ where: { id } });
    if (!stat) throw new NotFoundException('Stat not found');
    await this.statRepo.remove(stat);
  }
}
