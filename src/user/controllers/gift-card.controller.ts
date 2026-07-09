import { Controller, Post, Body, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { RolesGuard } from 'src/middleware/roles.guard';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { GiftCardService } from '../services/gift-card.service';
import { PurchaseBusinessGiftCardDto, ValidateGiftCardDto, RedeemGiftCardDto } from '../dtos/create-gift-card.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';

@ApiTags('Customer Card and Gift Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Client)
@Controller('users/gift-cards')
export class GiftCardController {
  constructor(private readonly giftCardService: GiftCardService) {}

  @Post('purchase')
  @ApiOperation({
    summary: 'Purchase a gift card from available business gift cards',
    description:
      'Customers can only purchase gift cards marked as AVAILABLE. After purchase the gift card will change to "purchased".',
  })
  @ApiResponse({ status: 201, description: 'Payment initialized' })
  @ApiResponse({ status: 400, description: 'Gift card not available or already purchased.' })
  async purchaseGiftCard(@Body() dto: PurchaseBusinessGiftCardDto, @GetUser() sender: User) {
    return await this.giftCardService.purchaseGiftCard(dto, sender);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete gift card purchase after Paystack verification' })
  @ApiResponse({ status: 200, description: 'Gift card purchase completed successfully' })
  async completePurchase(@Body('reference') referenceFromBody: string, @Query('reference') referenceFromQuery: string) {
    const reference = referenceFromBody || referenceFromQuery;
    if (!reference) {
      throw new Error('Transaction reference is required');
    }
    return await this.giftCardService.completeGiftCardPurchase(reference);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate a gift card using its unique code' })
  @ApiResponse({ status: 200, description: 'Gift card validity checked' })
  async validateGiftCard(@Body() dto: ValidateGiftCardDto) {
    return this.giftCardService.validateGiftCard(dto);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem a gift card using its unique code' })
  @ApiResponse({ status: 200, description: 'Gift card redeemed successfully' })
  @ApiResponse({ status: 400, description: 'Gift card already used or invalid' })
  async redeemGiftCard(@Body() dto: RedeemGiftCardDto, @GetUser() user: User) {
    return this.giftCardService.redeemGiftCard(dto, user);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get gift card statistics for the authenticated user',
  })
  async getGiftCardStats(@GetUser() user: User) {
    return this.giftCardService.getGiftCardStatsByUser(user);
  }

  @Get('owned')
  @ApiOperation({
    summary: 'Get all gift cards owned by the authenticated user',
    description: 'Returns gift cards that the user has purchased and owns',
  })
  @ApiResponse({ status: 200, description: 'User owned gift cards retrieved successfully' })
  async getUserOwnedGiftCards(@GetUser() user: User) {
    return this.giftCardService.getUserOwnedGiftCards(user);
  }

  @Get('fee')
  @ApiOperation({
    summary: 'Get the gift card fee from admin platform settings',
  })
  @ApiResponse({ status: 200, description: 'Gift card fee retrieved successfully' })
  async getGiftCardFee() {
    return this.giftCardService.getGiftCardFee();
  }

  @Get()
  @ApiOperation({
    summary: 'List all available gift cards for purchase',
    description: 'Only returns gift cards with soldStatus = AVAILABLE',
  })
  async getAllGiftCards() {
    return await this.giftCardService.getAllAvailableBusinessGiftCards();
  }
}
