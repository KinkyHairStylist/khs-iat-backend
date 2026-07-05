import {
  BadRequestException,
  Controller,
  Get,
  Request,
  HttpStatus,
  HttpException,
  Patch,
  Param,
  Body,
  Post,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import { BusinessSettingsService } from '../services/business-settings.service';
import {
  UpdateBookingDaysDto,
  UpdateBusinessContactDto,
  UpdateBusinessLocationDto,
  UpdateBusinessNameDto,
  UpdateBusinessProfileDto,
} from '../dtos/requests/BusinessSettingsDto';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Business Settings')
@ApiBearerAuth('access-token')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles(Role.Merchant, Role.Staff)
@Controller('business-settings')
export class BusinessSettingsController {
  constructor(
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
    private readonly businessService: BusinessSettingsService,
  ) {}

  @Get('/profile')
  async getBusinessProfile(@Request() req) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const business = await this.businessRepository.findOne({
        where: { ownerId },
      });

      if (!business) {
        throw new BadRequestException(`No business found for this user`);
      }

      return {
        success: true,
        data: business,
        message: 'Business fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to fetch business',
      };
    }
  }

  @Patch(':businessId/name-description')
  @ApiOperation({ summary: 'Update business name and description' })
  @ApiResponse({
    status: 200,
    description: 'Business name and description updated successfully',
    type: Business,
  })
  @ApiResponse({ status: 404, description: 'Business not found' })
  @ApiResponse({ status: 400, description: 'Bad request or unauthorized' })
  async updateBusinessNameAndDescription(
    @Param('businessId') businessId: string,
    @Request() req,
    @Body() updateDto: UpdateBusinessNameDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;
      const business =
        await this.businessService.updateBusinessNameAndDescription(
          businessId,
          ownerId,
          updateDto,
        );

      return {
        success: true,
        data: business,
        message: 'Business updated sucessfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to update business',
      };
    }
  }

  @Patch(':businessId/booking-hours')
  @ApiOperation({ summary: 'Update business booking hours' })
  @ApiResponse({
    status: 200,
    description: 'Business booking hours updated successfully',
    type: Business,
  })
  @ApiResponse({ status: 404, description: 'Business not found' })
  @ApiResponse({ status: 400, description: 'Bad request or unauthorized' })
  async updateBusinessBookingHours(
    @Param('businessId') businessId: string,
    @Request() req,
    @Body() updateDto: UpdateBookingDaysDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      const business = await this.businessService.updateBookingDays(
        businessId,
        ownerId,
        updateDto,
      );

      return {
        success: true,
        data: business,
        message: 'Business booking hours updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to update business booking hours',
      };
    }
  }

  /**
   * Create a business Image
   * POST /products
   */
  @Post(':businessId/add-images')
  async addBusinessImages(
    @Request() req,
    @Param('businessId') businessId: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      let images = req.files?.businessImage;

      // Normalize for service: always array
      const imagesArr = Array.isArray(images)
        ? images
        : [images].filter(Boolean);

      const result = await this.businessService.addBusinessImage(
        ownerId,
        businessId,

        imagesArr,
      );

      return {
        success: true,
        data: result.business,
        message: `${result.newUploads} Image(s) uploaded successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to upload image',
      };
    }
  }

  @Delete(':businessId/delete-image')
  async deleteBusinessImage(
    @Request() req,
    @Param('businessId') businessId: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (!imageUrl) {
        throw new BadRequestException('imageUrl is required');
      }

      const result = await this.businessService.deleteBusinessImage(
        ownerId,
        businessId,
        imageUrl,
      );

      return {
        success: true,
        message: 'Image deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to delete image',
        error: error.message,
      };
    }
  }

  @Patch(':businessId/contact')
  @ApiOperation({ summary: 'Update business contact information' })
  @ApiResponse({
    status: 200,
    description: 'Business contact updated successfully',
    type: Business,
  })
  @ApiResponse({ status: 404, description: 'Business not found' })
  @ApiResponse({ status: 400, description: 'Bad request or unauthorized' })
  async updateBusinessContact(
    @Param('businessId') businessId: string,
    @Request() req,
    @Body() updateDto: UpdateBusinessContactDto,
  ): Promise<Business> {
    const ownerId = req.user.id;
    return this.businessService.updateBusinessContact(
      businessId,
      ownerId,
      updateDto,
    );
  }

  @Patch(':businessId/location')
  @ApiOperation({ summary: 'Update business location' })
  @ApiResponse({
    status: 200,
    description: 'Business location updated successfully',
    type: Business,
  })
  @ApiResponse({ status: 404, description: 'Business not found' })
  @ApiResponse({ status: 400, description: 'Bad request or unauthorized' })
  async updateBusinessLocation(
    @Param('businessId') businessId: string,
    @Request() req,
    @Body() updateDto: UpdateBusinessLocationDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.businessService.updateBusinessLocation(
        businessId,
        ownerId,
        updateDto,
      );

      return {
        success: true,
        message: 'Location updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update location',
        error: error.message,
      };
    }
  }

  @Patch(':businessId/profile')
  @ApiOperation({ summary: 'Edit complete business profile' })
  @ApiResponse({
    status: 200,
    description: 'Business profile updated successfully',
    type: Business,
  })
  @ApiResponse({ status: 404, description: 'Business not found' })
  @ApiResponse({ status: 400, description: 'Bad request or unauthorized' })
  async editBusinessProfile(
    @Param('businessId') businessId: string,
    @Request() req,
    @Body() updateDto: UpdateBusinessProfileDto,
  ): Promise<Business> {
    const ownerId = req.user.id;
    return this.businessService.editBusinessProfile(
      businessId,
      ownerId,
      updateDto,
    );
  }
}
