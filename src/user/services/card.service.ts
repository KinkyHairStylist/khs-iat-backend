import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Card } from '../../all_user_entities/card.entity';
import { CreateCardDto } from '../dtos/create-card.dto';
import { User } from '../../all_user_entities/user.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { PAYMENT_PROVIDER } from 'src/payment/payment-provider.interface';
import type { PaymentProvider } from 'src/payment/payment-provider.interface';

@Injectable()
export class CardService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    @InjectRepository(MembershipSubscription)
    private readonly subscriptionRepo: Repository<MembershipSubscription>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  // The card number/CVV never reach this backend. `dto.reference` is the
  // Paystack transaction ID from a small (50 kobo) verification charge run
  // client-side, directly against Paystack's popup. We verify that charge
  // really happened, pull the reusable authorization_code out of Paystack's
  // response, save only that, then refund the charge.
  async createCard(dto: CreateCardDto, user: User): Promise<Card> {
    const verification = await this.paymentProvider.verifyPayment(dto.reference);

    if (verification.status !== 'success') {
      throw new BadRequestException('Card verification failed');
    }

    if (!verification.authorizationCode) {
      throw new BadRequestException(
        'Card verification did not return a reusable authorization',
      );
    }

    // Paystack returns card_type as a lowercase scheme name ("visa",
    // "mastercard") — capitalized here so it displays cleanly and matches
    // the brand-icon detection the frontend already does on this field.
    const providerName = verification.cardType
      ? verification.cardType.charAt(0).toUpperCase() + verification.cardType.slice(1)
      : 'Card';

    const newCard = this.cardRepo.create({
      providerName,
      type: 'credit',
      cardHolderName: `${user.firstName ?? ''} ${user.surname ?? ''}`.trim(),
      expiryMonth: verification.cardExpiryMonth,
      expiryYear: verification.cardExpiryYear,
      lastFourDigits: verification.cardLast4,
      paystackAuthorizationCode: verification.authorizationCode,
      paystackEmail: verification.customerEmail,
      user,
    });

    const savedCard = await this.cardRepo.save(newCard);

    // Best-effort — the card is already saved even if this hiccups.
    await this.paymentProvider.refundTransaction(dto.reference);

    return savedCard;
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
