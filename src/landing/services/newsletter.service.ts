import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsletterSubscriber } from '../entities/newsletter-subscriber.entity';
import { SubscribeNewsletterDto } from '../dtos/subscribe-newsletter.dto';

@Injectable()
export class NewsletterService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
  ) {}

  async subscribe(dto: SubscribeNewsletterDto): Promise<{ message: string }> {
    const existing = await this.subscriberRepo.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('This email is already subscribed');
    }

    const subscriber = this.subscriberRepo.create({ email: dto.email });
    await this.subscriberRepo.save(subscriber);

    return { message: 'Successfully subscribed to the newsletter' };
  }

  async findAll(): Promise<NewsletterSubscriber[]> {
    return this.subscriberRepo.find({ order: { subscribedAt: 'DESC' } });
  }
}
