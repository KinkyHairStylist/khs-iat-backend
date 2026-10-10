import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NewsletterService } from '../services/newsletter.service';
import { SubscribeNewsletterDto } from '../dtos/subscribe-newsletter.dto';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Newsletter')
@Controller('landing/newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  // The subscriber list moved to khs-iat-staff-be. Here it only checked for a
  // login, so any customer account could read every subscriber's email.

  @Post('subscribe')
  @Public()
  @ApiOperation({ summary: 'Subscribe to newsletter (public)' })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto);
  }
}
