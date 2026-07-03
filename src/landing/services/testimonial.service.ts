import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Testimonial } from '../entities/testimonial.entity';
import { CreateTestimonialDto, UpdateTestimonialDto } from '../dtos/testimonial.dto';

@Injectable()
export class TestimonialService {
  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonialRepo: Repository<Testimonial>,
  ) {}

  async create(dto: CreateTestimonialDto): Promise<{ message: string }> {
    const testimonial = this.testimonialRepo.create(dto);
    await this.testimonialRepo.save(testimonial);
    return { message: 'Testimonial submitted and pending approval' };
  }

  async findApproved(): Promise<Testimonial[]> {
    return this.testimonialRepo.find({
      where: { isApproved: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Testimonial[]> {
    return this.testimonialRepo.find({ order: { createdAt: 'DESC' } });
  }

  async approve(id: string): Promise<Testimonial> {
    const testimonial = await this.testimonialRepo.findOne({ where: { id } });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    testimonial.isApproved = true;
    return this.testimonialRepo.save(testimonial);
  }

  async reject(id: string): Promise<void> {
    const testimonial = await this.testimonialRepo.findOne({ where: { id } });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    await this.testimonialRepo.remove(testimonial);
  }

  async update(id: string, dto: UpdateTestimonialDto): Promise<Testimonial> {
    const testimonial = await this.testimonialRepo.findOne({ where: { id } });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    Object.assign(testimonial, dto);
    return this.testimonialRepo.save(testimonial);
  }

  async remove(id: string): Promise<void> {
    const testimonial = await this.testimonialRepo.findOne({ where: { id } });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    await this.testimonialRepo.remove(testimonial);
  }
}
