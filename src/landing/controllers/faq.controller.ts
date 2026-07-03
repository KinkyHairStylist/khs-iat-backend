import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FaqService } from '../services/faq.service';
import { CreateFaqDto, UpdateFaqDto } from '../dtos/faq.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';

@ApiTags('Landing - FAQ')
@Controller('landing/faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active FAQs (public)' })
  findActive() {
    return this.faqService.findActive();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all FAQs including inactive (admin)' })
  findAll() {
    return this.faqService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a FAQ (admin)' })
  create(@Body() dto: CreateFaqDto) {
    return this.faqService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a FAQ (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.faqService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a FAQ (admin)' })
  remove(@Param('id') id: string) {
    return this.faqService.remove(id);
  }
}
