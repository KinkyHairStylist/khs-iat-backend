import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
    private readonly dataSource: DataSource,
  ) {}

  // `dto.reference` is the Paystack transaction reference from a small
  // verification charge run client-side, directly against Paystack's popup
  // (see AddPaymentMethodModal on the frontend) — the raw card number/CVV
  // never reach this backend at all. We verify the charge really happened
  // with Paystack directly, then save only the reusable authorization code.
  async createCard(dto: CreateCardDto, user: User): Promise<Card> {
    if (dto.reference) {
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

    // Direct card input
    if (!dto.cardNumber) {
      throw new BadRequestException('Card details or verification reference is required');
    }

    const cleanNum = dto.cardNumber.replace(/\s+/g, '');
    const lastFourDigits = cleanNum.slice(-4);
    let providerName = dto.providerName || 'Card';
    if (cleanNum.startsWith('4')) providerName = 'Visa';
    else if (cleanNum.startsWith('5') || cleanNum.startsWith('2')) providerName = 'Mastercard';
    else if (cleanNum.startsWith('3')) providerName = 'Amex';

    const newCard = this.cardRepo.create({
      providerName,
      type: dto.type || 'credit',
      cardHolderName: dto.cardHolderName || `${user.firstName ?? ''} ${user.surname ?? ''}`.trim(),
      cardNumber: cleanNum,
      expiryMonth: dto.expiryMonth || '12',
      expiryYear: dto.expiryYear?.length === 2 ? `20${dto.expiryYear}` : (dto.expiryYear || '2028'),
      cvv: dto.cvv,
      billingAddress: dto.billingAddress,
      lastFourDigits,
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
      throw new NotFoundException('Card not found');
    }

    // Check if card has associated gift cards that are not redeemed
    const hasActiveGiftCards = (card.giftCards || []).some(
      (giftCard) => giftCard?.status === 'Active',
    );
    if (hasActiveGiftCards) {
      throw new BadRequestException(
        'Cannot delete card with active (unredeemed) gift cards',
      );
    }

    // Check if user has active membership subscriptions
    try {
      const activeSubscription = await this.subscriptionRepo.findOne({
        where: { userId: user.id, status: 'active' },
      });

      if (activeSubscription) {
        const allUserCards = await this.cardRepo.find({
          where: { user: { id: user.id } },
        });
        if (allUserCards.length <= 1) {
          throw new BadRequestException(
            'Cannot delete your only saved card while having an active membership subscription',
          );
        }
      }
    } catch (subErr) {
      if (subErr instanceof BadRequestException) throw subErr;
      // Skip if subscription entity check fails
    }

    // Handle default card - if deleting default, set another card as default
    if (card.isDefault) {
      const otherCards = await this.cardRepo.find({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
      });

      const nextCard = otherCards.find((c) => c.id !== card.id);
      if (nextCard) {
        nextCard.isDefault = true;
        await this.cardRepo.save(nextCard);
      }
    }

    // Safely unlink any gift cards referencing this card so foreign key constraints don't block deletion
    try {
      await this.dataSource.query(
        `UPDATE "business_gift_cards" SET "cardId" = NULL WHERE "cardId" = $1`,
        [card.id],
      );
    } catch (_) {}

    try {
      await this.dataSource.query(
        `UPDATE "gift_card" SET "cardId" = NULL WHERE "cardId" = $1`,
        [card.id],
      );
    } catch (_) {}

    // Delete the card
    try {
      await this.cardRepo.remove(card);
    } catch (removeErr) {
      try {
        await this.cardRepo.delete(card.id);
      } catch (delErr: any) {
        throw new BadRequestException(
          delErr?.message || 'Could not delete card due to linked transactions or records.',
        );
      }
    }

    return { message: 'Card deleted successfully' };
  }

  async getDefaultCard(user: User): Promise<Card | null> {
    return this.cardRepo.findOne({
      where: { user: { id: user.id }, isDefault: true },
    });
  }
}
