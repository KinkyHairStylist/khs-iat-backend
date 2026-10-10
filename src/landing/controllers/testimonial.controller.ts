import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TestimonialService } from '../services/testimonial.service';
import { CreateTestimonialDto } from '../dtos/testimonial.dto';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Testimonials')
@Controller('landing/testimonials')
export class TestimonialController {
  constructor(private readonly testimonialService: TestimonialService) {}

  // Reviewing testimonials (approve, reject, edit, delete) moved to
  // khs-iat-staff-be. Here those routes only checked for a login, so any
  // customer account could use them. Submitting and the public list remain.

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
}
