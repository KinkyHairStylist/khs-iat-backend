import { Controller, Post, Body, Get, UseGuards, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { CardService } from '../services/card.service';
import { CreateCardDto } from '../dtos/create-card.dto';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';


@ApiTags('Customer Card and Gift Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Client)
@Controller('users/cards')
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Post('add')
  @ApiOperation({ summary: 'Add a new payment card' })
  @ApiResponse({ status: 201, description: 'Card successfully added' })
  async addCard(@Body() dto: CreateCardDto, @GetUser() user: User) {
    return this.cardService.createCard(dto, user);
  }

  @Get('my-card')
  @ApiOperation({ summary: 'Get all saved cards for the authenticated user' })
  async getAuthCards(@GetUser() user: User) {
    return this.cardService.getAllAuthCards(user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all saved cards' })
  async getCards() {
    return this.cardService.getAllCards();
  }

  @Patch(':cardId/default')
  @ApiOperation({ summary: 'Set a card as default payment method' })
  @ApiResponse({ status: 200, description: 'Card set as default successfully' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async setCardAsDefault(@Param('cardId') cardId: string, @GetUser() user: User) {
    const card = await this.cardService.setCardAsDefault(cardId, user);
    return {
      success: true,
      data: card,
      message: 'Card set as default successfully',
    };
  }

  @Delete(':cardId')
  @ApiOperation({ summary: 'Delete a user card' })
  @ApiResponse({ status: 200, description: 'Card deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete card with active gift cards' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async deleteCard(@Param('cardId') cardId: string, @GetUser() user: User) {
    const result = await this.cardService.deleteCard(cardId, user);
    return {
      success: true,
      message: result.message,
    };
  }
}
