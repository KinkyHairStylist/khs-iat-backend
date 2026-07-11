import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NewsletterService } from '../services/newsletter.service';
import { SubscribeNewsletterDto } from '../dtos/subscribe-newsletter.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Newsletter')
@Controller('landing/newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @Public()
  @ApiOperation({ summary: 'Subscribe to newsletter (public)' })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto);
  }

  @Get('subscribers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all newsletter subscribers (admin)' })
  findAll() {
    return this.newsletterService.findAll();
  }
}
