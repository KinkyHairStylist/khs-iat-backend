import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Public } from 'src/business/middlewares/public.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { BusinessServicesService } from '../services/business-services.service';

@ApiTags('Customer Business Services')
@Controller('business')
@UseInterceptors(ClassSerializerInterceptor)
export class BusinessServicesController {
  constructor(private readonly businessServicesService: BusinessServicesService) {}

  /**
   * Fetch all services across all businesses (public, no auth required).
   * GET /business/services
   */
  @Public()
  @Get('services')
  @ApiOperation({ summary: 'Get all services across all businesses with pagination (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'List of all services returned successfully.',
  })
  async getAllServices(@Query() query: any) {
    const options = {
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 20,
    };
    return this.businessServicesService.getAllServices(options);
  }

  /**
   * Fetch all services offered by a specific business.
   * GET /business/:businessId/services
   */
  @Public()
  @Get(':businessId/services')
  @ApiOperation({ summary: 'Get all services offered by a business' })
  @ApiParam({
    name: 'businessId',
    type: String,
    description: 'The UUID of the business whose services you want to retrieve',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'List of services for the specified business returned successfully.',
  })
  @ApiResponse({ status: 404, description: 'Business not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getBusinessServices(@Param('businessId') businessId: string) {
    return this.businessServicesService.getServicesByBusinessId(businessId);
  }
}
