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
import { TestimonialService } from '../services/testimonial.service';
import { CreateTestimonialDto, UpdateTestimonialDto } from '../dtos/testimonial.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Testimonials')
@Controller('landing/testimonials')
export class TestimonialController {
  constructor(private readonly testimonialService: TestimonialService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit a testimonial (public)' })
  create(@Body() dto: CreateTestimonialDto) {
    return this.testimonialService.create(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all approved testimonials (public)' })
  findApproved() {
    return this.testimonialService.findApproved();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all testimonials including pending (admin)' })
  findAll() {
    return this.testimonialService.findAll();
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Approve a testimonial (admin)' })
  approve(@Param('id') id: string) {
    return this.testimonialService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reject and delete a testimonial (admin)' })
  reject(@Param('id') id: string) {
    return this.testimonialService.reject(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a testimonial (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateTestimonialDto) {
    return this.testimonialService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a testimonial (admin)' })
  remove(@Param('id') id: string) {
    return this.testimonialService.remove(id);
  }
}
