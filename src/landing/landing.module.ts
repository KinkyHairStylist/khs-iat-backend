import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { BlogPost } from './entities/blog-post.entity';
import { Faq } from './entities/faq.entity';
import { Story } from './entities/story.entity';
import { Testimonial } from './entities/testimonial.entity';
import { LandingStat } from './entities/landing-stat.entity';

import { NewsletterService } from './services/newsletter.service';
import { BlogPostService } from './services/blog-post.service';
import { FaqService } from './services/faq.service';
import { StoryService } from './services/story.service';
import { TestimonialService } from './services/testimonial.service';
import { LandingStatService } from './services/landing-stat.service';

import { NewsletterController } from './controllers/newsletter.controller';
import { BlogPostController } from './controllers/blog-post.controller';
import { FaqController } from './controllers/faq.controller';
import { StoryController } from './controllers/story.controller';
import { TestimonialController } from './controllers/testimonial.controller';
import { LandingStatController } from './controllers/landing-stat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NewsletterSubscriber,
      BlogPost,
      Faq,
      Story,
      Testimonial,
      LandingStat,
    ]),
  ],
  controllers: [
    NewsletterController,
    BlogPostController,
    FaqController,
    StoryController,
    TestimonialController,
    LandingStatController,
  ],
  providers: [
    NewsletterService,
    BlogPostService,
    FaqService,
    StoryService,
    TestimonialService,
    LandingStatService,
  ],
})
export class LandingModule {}
