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
import { LandingStatService } from '../services/landing-stat.service';
import { CreateLandingStatDto, UpdateLandingStatDto } from '../dtos/landing-stat.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Statistics')
@Controller('landing/statistics')
export class LandingStatController {
  constructor(private readonly landingStatService: LandingStatService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all active statistics (public)' })
  findActive() {
    return this.landingStatService.findActive();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all statistics including inactive (admin)' })
  findAll() {
    return this.landingStatService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a statistic card (admin)' })
  create(@Body() dto: CreateLandingStatDto) {
    return this.landingStatService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a statistic card (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateLandingStatDto) {
    return this.landingStatService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a statistic card (admin)' })
  remove(@Param('id') id: string) {
    return this.landingStatService.remove(id);
  }
}
