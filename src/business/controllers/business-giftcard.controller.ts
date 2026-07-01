import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Request,
  HttpException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BusinessGiftCardsService } from '../services/business-giftcard.service';
import {
  BusinessGiftCardFiltersDto,
  CreateBusinessGiftCardDto,
  RedeemBusinessGiftCardDto,
  UpdateBusinessGiftCardDto,
} from '../dtos/requests/BusinessGiftCardDto';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from '../entities/business.entity';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';

@ApiTags('Business Gift Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Business, Role.SuperAdmin)
@Controller('business-gift-cards')
export class BusinessGiftCardsController {
  constructor(
    private readonly giftCardsService: BusinessGiftCardsService,

    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Create a new gift card' })
  @ApiResponse({ status: 201, description: 'Gift card created successfully' })
  async create(
    @Request() req,
    @Body() createGiftCardDto: CreateBusinessGiftCardDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.giftCardsService.create(
        createGiftCardDto,
        ownerId,
      );

      return {
        success: true,
        data: result,
        message: 'Gift Card Created',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to create gift card',
      };
    }
  }

  @Get('business')
  async getBusiness(@Request() req) {
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

  @Get('summary')
  @ApiOperation({ summary: 'Get the gift cards summary' })
  @ApiResponse({ status: 200, description: 'Gift cards summary fetched' })
  async getBusinessGiftCardSummary(@Request() req) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const result = await this.giftCardsService.getBusinessSummary();

      return {
        success: true,
        data: result,
        message: 'Gift cards summary fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to get gift cards summary',
      };
    }
  }

  /**
   * Get product list with filters
   * GET /business-gift-cards?status=xxx&sentStatus=brow&page=1&limit=20&search=xxx
   */
  @Get('list')
  @ApiOperation({ summary: 'Get all gift cards with optional filters' })
  async getBusinessGiftCardsList(
    @Request() req,
    @Query() filters: BusinessGiftCardFiltersDto,
  ) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.giftCardsService.getGiftCardsList(filters);

      return {
        success: true,
        data: result,
        message: 'Gift Cards List fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to get gift cards list',
      };
    }
  }

  @Patch(':id/mark-expired')
  @ApiOperation({ summary: 'Mark gift card as expired' })
  async markAsExpired(@Request() req, @Param('id') id: string) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.giftCardsService.markAsExpired(id);

      return {
        success: true,
        data: result,
        message: 'Gift card marked has expired',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to mark gift card as exipred',
      };
    }
  }

  @Patch(':id/mark-deleted')
  @ApiOperation({ summary: 'Mark gift card as deleted' })
  async markAsDeleted(@Request() req, @Param('id') id: string) {
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.giftCardsService.markAsDelete(id);

      return {
        success: true,
        data: result,
        message: 'Gift deleted',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to deolete gift card',
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a gift card by ID' })
  @ApiResponse({ status: 200, description: 'Gift card found' })
  @ApiResponse({ status: 404, description: 'Gift card not found' })
  findOne(@Param('id') id: string) {
    return this.giftCardsService.findOne(id);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get a gift card by code' })
  @ApiResponse({ status: 200, description: 'Gift card found' })
  @ApiResponse({ status: 404, description: 'Gift card not found' })
  findByCode(@Param('code') code: string) {
    return this.giftCardsService.findByCode(code);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a gift card' })
  @ApiResponse({ status: 200, description: 'Gift card updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateGiftCardDto: UpdateBusinessGiftCardDto,
  ) {
    return this.giftCardsService.update(id, updateGiftCardDto);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a gift card' })
  @ApiResponse({ status: 200, description: 'Gift card redeemed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid redemption request' })
  redeem(@Body() redeemDto: RedeemBusinessGiftCardDto) {
    return this.giftCardsService.redeem(redeemDto);
  }

  @Patch(':id/mark-sent')
  @ApiOperation({ summary: 'Mark gift card as sent' })
  markAsSent(@Param('id') id: string) {
    return this.giftCardsService.markAsSent(id);
  }

  @Patch(':id/mark-delivered')
  @ApiOperation({ summary: 'Mark gift card as delivered' })
  markAsDelivered(@Param('id') id: string) {
    return this.giftCardsService.markAsDelivered(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a gift card' })
  @ApiResponse({ status: 200, description: 'Gift card cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel redeemed gift card' })
  cancel(@Param('id') id: string) {
    return this.giftCardsService.cancel(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a gift card' })
  @ApiResponse({ status: 204, description: 'Gift card deleted successfully' })
  remove(@Param('id') id: string) {
    return this.giftCardsService.remove(id);
  }

  @Post('check-expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check and update expired gift cards' })
  checkExpired() {
    return this.giftCardsService.checkExpiredCards();
  }
}
