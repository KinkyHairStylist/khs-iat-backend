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
import { describeActor } from '../utils/gift-card-deactivation';
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
import { BusinessGiftCardSoldStatus } from '../enum/gift-card.enum';
import { BusinessGiftCard } from '../entities/business-giftcard.entity';
import { assertCanManageBusiness } from '../utils/business-access';
import { Role } from 'src/middleware/role.enum';

@ApiTags('Business Gift Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Merchant, Role.Staff)
@Controller('business-gift-cards')
export class BusinessGiftCardsController {
  constructor(
    private readonly giftCardsService: BusinessGiftCardsService,

    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
  ) {}

  // A salon can only touch its own gift cards; a platform admin can touch any.
  private async assertCanManageCard(cardId: string, user: any): Promise<BusinessGiftCard> {
    const card = await this.giftCardsService.findOne(cardId);
    const business = await this.businessRepository.findOne({ where: { id: card.businessId } });
    assertCanManageBusiness(user, business);
    return card;
  }

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
      const result = await this.giftCardsService.getBusinessSummary(ownerId);

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

      const result = await this.giftCardsService.getGiftCardsList(filters, ownerId);

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
    await this.assertCanManageCard(id, req.user);
    try {
      const ownerId = req.user.id || req.user.sub;

      if (!ownerId) {
        throw new HttpException(
          'User not authenticated',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const result = await this.giftCardsService.markAsExpired(id, describeActor(req.user));

      return {
        success: true,
        data: result,
        message: 'Gift card deactivated successfully',
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
    await this.assertCanManageCard(id, req.user);
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
        message: 'Gift card deleted',
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
  async findOne(@Request() req, @Param('id') id: string) {
    return this.assertCanManageCard(id, req.user);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get a gift card by code' })
  @ApiResponse({ status: 200, description: 'Gift card found' })
  @ApiResponse({ status: 404, description: 'Gift card not found' })
  async findByCode(@Request() req, @Param('code') code: string) {
    const card = await this.giftCardsService.findByCode(code);
    return this.assertCanManageCard(card.id, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a gift card' })
  @ApiResponse({ status: 200, description: 'Gift card updated successfully' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateGiftCardDto: UpdateBusinessGiftCardDto,
  ) {
    await this.assertCanManageCard(id, req.user);
    try {
      const result = await this.giftCardsService.update(id, updateGiftCardDto);
      return {
        success: true,
        data: result,
        message: 'Gift Card Updated',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message || 'Failed to update gift card',
      };
    }
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a gift card' })
  @ApiResponse({ status: 200, description: 'Gift card redeemed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid redemption request' })
  async redeem(@Request() req, @Body() redeemDto: RedeemBusinessGiftCardDto) {
    // Only the salon that issued a card (or an admin) can redeem it.
    const card = await this.giftCardsService.findByCode(redeemDto.code);
    await this.assertCanManageCard(card.id, req.user);
    return this.giftCardsService.redeem(redeemDto);
  }

  @Patch(':id/mark-sent')
  @ApiOperation({ summary: 'Mark gift card as sent' })
  async markAsSent(@Request() req, @Param('id') id: string) {
    await this.assertCanManageCard(id, req.user);
    return this.giftCardsService.markAsSent(id);
  }

  @Patch(':id/mark-delivered')
  @ApiOperation({ summary: 'Mark gift card as delivered' })
  async markAsDelivered(@Request() req, @Param('id') id: string) {
    await this.assertCanManageCard(id, req.user);
    return this.giftCardsService.markAsDelivered(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a gift card' })
  @ApiResponse({ status: 200, description: 'Gift card cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel redeemed gift card' })
  async cancel(@Request() req, @Param('id') id: string) {
    await this.assertCanManageCard(id, req.user);
    return this.giftCardsService.cancel(id, describeActor(req.user));
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Bring back a gift card this salon deactivated' })
  @ApiResponse({ status: 200, description: 'Gift card reactivated' })
  @ApiResponse({ status: 403, description: 'KHS deactivated this card, so only KHS can reactivate it' })
  async reactivate(@Request() req, @Param('id') id: string) {
    await this.assertCanManageCard(id, req.user);
    return this.giftCardsService.reactivate(id, describeActor(req.user));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a gift card' })
  @ApiResponse({ status: 204, description: 'Gift card deleted successfully' })
  async remove(@Request() req, @Param('id') id: string) {
    const card = await this.assertCanManageCard(id, req.user);
    // A card a customer has bought holds their money; deleting it would wipe their balance.
    if (card.soldStatus === BusinessGiftCardSoldStatus.PURCHASED) {
      throw new BadRequestException('A gift card that has been sold can\'t be deleted. Cancel it instead.');
    }
    return this.giftCardsService.remove(id);
  }

  @Post('check-expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check and update expired gift cards' })
  checkExpired() {
    return this.giftCardsService.checkExpiredCards();
  }
}
