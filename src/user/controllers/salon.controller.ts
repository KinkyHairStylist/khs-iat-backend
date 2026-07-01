import {
  Controller,
  Get,
  Param,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { SalonService } from '../services/salon.service';
import { CacheInterceptor } from '../../cache/cache.interceptor';

@ApiTags('Salons')
@Controller('salons')
@UseInterceptors(ClassSerializerInterceptor)
export class SalonController {
  constructor(private readonly salonService: SalonService) {}

  @Get()
  @ApiOperation({ summary: 'Get all salons with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'Natural Hair',
  })
  @ApiQuery({
    name: 'location',
    required: false,
    type: String,
    example: 'Sydney',
  })
  @ApiQuery({ name: 'minRating', required: false, type: Number, example: 4.5 })
  @ApiQuery({
    name: 'services',
    required: false,
    type: [String],
    example: ['Haircut', 'Coloring'],
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['bestMatch', 'topRated', 'distance'],
    example: 'bestMatch',
  })
  @ApiQuery({ name: 'lat', required: false, type: Number, example: -33.8688 })
  @ApiQuery({ name: 'lng', required: false, type: Number, example: 151.2093 })
  @ApiResponse({ status: 200, description: 'Return list of salons' })
  @UseInterceptors(CacheInterceptor) //  Apply caching
  async findAll(@Query() query: any) {
    const options = {
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 10,
      search: query.search || '',
      location: query.location || '',
      minRating: parseFloat(query.minRating) || 0,
      services: Array.isArray(query.services)
        ? query.services
        : query.services
          ? [query.services]
          : [],
      sortBy: query.sortBy || 'bestMatch',
      lat: query.lat ? parseFloat(query.lat) : undefined,
      lng: query.lng ? parseFloat(query.lng) : undefined,
    };

    const result = await this.salonService.findAll(options);
    return { success: true, ...result };
  }

  @Get('search')
  @ApiQuery({
    name: 'category',
    required: false,
    example: 'Hair Salon',
    description: 'Filter services by category',
  })
  async getServices(@Query('category') category?: string) {
    return this.salonService.getServices(category);
  }

  @Get('services/:businessId')
  @ApiOperation({ summary: 'Get all services for a business by business ID' })
  @ApiResponse({ status: 200, description: 'Return list of services' })
  async getServicesByBusinessId(@Param('businessId') businessId: string) {
    return this.salonService.getServicesByBusinessId(businessId);
  }
  
  @Get(':id')
  @ApiOperation({ summary: 'Get business by ID with services & available times' })
  @ApiResponse({ status: 200, description: 'Return business details' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getBusiness(
    @Param('id') id: string
  ) {
    return this.salonService.getBusinessById(id);
  }


}
