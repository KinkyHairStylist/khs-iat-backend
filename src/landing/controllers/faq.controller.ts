import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FaqService } from '../services/faq.service';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - FAQ')
@Controller('landing/faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  // Managing this content (drafts, create, edit, delete, uploads) moved to
  // khs-iat-staff-be. Here those routes only checked for a login, so any
  // customer account could use them. Only the public routes remain.

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all active FAQs (public)' })
  findActive() {
    return this.faqService.findActive();
  }
}
