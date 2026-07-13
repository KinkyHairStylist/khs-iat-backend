import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Card } from '../../all_user_entities/card.entity';
import { CreateCardDto } from '../dtos/create-card.dto';
import { User } from '../../all_user_entities/user.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';

@Injectable()
export class CardService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    @InjectRepository(MembershipSubscription)
    private readonly subscriptionRepo: Repository<MembershipSubscription>,
  ) {}

  async createCard(dto: CreateCardDto, user: User): Promise<Card> {
    // derive last four digits
    const lastFour = dto.cardNumber.slice(-4);

    const newCard = this.cardRepo.create({
      providerName: dto.providerName,
      type: dto.type,
      cardHolderName: dto.cardHolderName,
      cardNumber: dto.cardNumber, // will be encrypted automatically
      expiryMonth: dto.expiryMonth,
      expiryYear: dto.expiryYear,
      cvv: dto.cvv,
      billingAddress: dto.billingAddress,
      lastFourDigits: lastFour,
      user,
    });

    return await this.cardRepo.save(newCard);
  }

  async getAllAuthCards(user: User): Promise<Card[]> {
    return this.cardRepo.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' }, // optional: show most recent first
    });
  }

  async getAllCards(): Promise<Card[]> {
    return this.cardRepo.find();
  }

  async setCardAsDefault(cardId: string, user: User): Promise<Card> {
    // First, unset all other cards as default for this user
    await this.cardRepo.update(
      { user: { id: user.id } },
      { isDefault: false }
    );

    // Set the specified card as default
    const card = await this.cardRepo.findOne({
      where: { id: cardId, user: { id: user.id } },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    card.isDefault = true;
    return await this.cardRepo.save(card);
  }

  async deleteCard(cardId: string, user: User): Promise<{ message: string }> {
    // Find the card and ensure it belongs to the user
    const card = await this.cardRepo.findOne({
      where: { id: cardId, user: { id: user.id } },
      relations: ['giftCards'],
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Check if card has associated gift cards that are not redeemed
    const hasActiveGiftCards = card.giftCards.some(giftCard => giftCard.status === 'Active');
    if (hasActiveGiftCards) {
      throw new Error('Cannot delete card with active (unredeemed) gift cards');
    }

    // Check if user has active membership subscriptions
    const activeSubscription = await this.subscriptionRepo.findOne({
      where: { userId: user.id, status: 'active' },
    });

    if (activeSubscription) {
      throw new Error('Cannot delete card with active membership subscription');
    }

    // Handle default card - if deleting default, set another card as default
    if (card.isDefault) {
      const otherCards = await this.cardRepo.find({
        where: { user: { id: user.id }, isDefault: false },
        order: { createdAt: 'DESC' },
      });

      if (otherCards.length > 0) {
        otherCards[0].isDefault = true;
        await this.cardRepo.save(otherCards[0]);
      }
    }

    // Delete the card
    await this.cardRepo.remove(card);

    return { message: 'Card deleted successfully' };
  }

  async getDefaultCard(user: User): Promise<Card | null> {
    return this.cardRepo.findOne({
      where: { user: { id: user.id }, isDefault: true },
    });
  }
}
