import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Card } from '../../all_user_entities/card.entity';
import { CreateCardDto } from '../dtos/create-card.dto';
import { User } from '../../all_user_entities/user.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { PaystackService } from 'src/payment/paystack.service';

@Injectable()
export class CardService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    @InjectRepository(MembershipSubscription)
    private readonly subscriptionRepo: Repository<MembershipSubscription>,
    private readonly paystackService: PaystackService,
  ) {}

  // `dto.reference` is the Paystack transaction reference from a small
  // verification charge run client-side, directly against Paystack's popup
  // (see AddPaymentMethodModal on the frontend) — the raw card number/CVV
  // never reach this backend at all. We verify the charge really happened
  // with Paystack directly, then save only the reusable authorization code.
  async createCard(dto: CreateCardDto, user: User): Promise<Card> {
    const verification = await this.paystackService.verifyPayment(dto.reference);

    if (verification?.status !== 'success') {
      throw new BadRequestException('Card verification failed');
    }

    const authorization = verification.authorization;
    if (!authorization?.authorization_code) {
      throw new BadRequestException(
        'Card verification did not return a reusable authorization',
      );
    }

    // Paystack returns card_type as a lowercase scheme name ("visa",
    // "mastercard") — capitalized here so it displays cleanly.
    const providerName = authorization.card_type
      ? authorization.card_type.charAt(0).toUpperCase() + authorization.card_type.slice(1)
      : 'Card';

    const newCard = this.cardRepo.create({
      providerName,
      type: 'credit',
      cardHolderName: `${user.firstName ?? ''} ${user.surname ?? ''}`.trim(),
      expiryMonth: authorization.exp_month,
      expiryYear: authorization.exp_year,
      lastFourDigits: authorization.last4,
      paystackAuthorizationCode: authorization.authorization_code,
      paystackEmail: verification.customer?.email,
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
