import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faq } from '../entities/faq.entity';
import { CreateFaqDto, UpdateFaqDto } from '../dtos/faq.dto';

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(Faq)
    private readonly faqRepo: Repository<Faq>,
  ) {}

  async create(dto: CreateFaqDto): Promise<Faq> {
    const faq = this.faqRepo.create(dto);
    return this.faqRepo.save(faq);
  }

  async findActive(): Promise<Faq[]> {
    return this.faqRepo.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findAll(): Promise<Faq[]> {
    return this.faqRepo.find({ order: { displayOrder: 'ASC', createdAt: 'ASC' } });
  }

  async update(id: string, dto: UpdateFaqDto): Promise<Faq> {
    const faq = await this.faqRepo.findOne({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');
    Object.assign(faq, dto);
    return this.faqRepo.save(faq);
  }

  async remove(id: string): Promise<void> {
    const faq = await this.faqRepo.findOne({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');
    await this.faqRepo.remove(faq);
  }
}
