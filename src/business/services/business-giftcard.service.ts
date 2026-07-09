import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { BusinessGiftCard } from '../entities/business-giftcard.entity';
import {
  BusinessGiftCardFiltersDto,
  CreateBusinessGiftCardDto,
  RedeemBusinessGiftCardDto,
  UpdateBusinessGiftCardDto,
} from '../dtos/requests/BusinessGiftCardDto';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
  BusinessSentStatus,
} from '../enum/gift-card.enum';
import { Business } from '../entities/business.entity';

@Injectable()
export class BusinessGiftCardsService {
  constructor(
    @InjectRepository(BusinessGiftCard)
    private giftCardRepository: Repository<BusinessGiftCard>,
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
  ) {}

  async create(
    createGiftCardDto: CreateBusinessGiftCardDto,
    ownerId: string,
  ): Promise<BusinessGiftCard> {
    const business = await this.businessRepository.findOne({
      where: { ownerId },
    });

    if (!business) {
      throw new BadRequestException(`No business found for this user`);
    }

    // Validate the gift card code format
    if (!this.isValidCodeFormat(createGiftCardDto.code)) {
      throw new BadRequestException('Invalid gift card code format');
    }

    // Check if code already exists
    const existingCard = await this.giftCardRepository.findOne({
      where: {
        code: createGiftCardDto.code,
        status: Not(BusinessGiftCardStatus.DELETED),
      },
    });

    if (existingCard) {
      throw new ConflictException(
        'Gift card code already exists. Please generate a new code.',
      );
    }

    // Calculate expiry date based on expiryInDays
    const expiryInDays = createGiftCardDto.expiryInDays || 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryInDays);

    const giftCard = this.giftCardRepository.create({
      ...createGiftCardDto,
      expiresAt,
      businessId: business.id,
    });
    return await this.giftCardRepository.save(giftCard);
  }

  async getBusinessSummary(): Promise<any> {
    // Fetch all cards EXCEPT deleted
    const allCards = await this.giftCardRepository
      .createQueryBuilder('giftCard')
      .where('giftCard.status != :deleted', { deleted: 'deleted' })
      .getMany();

    const now = new Date();

    // Calculate total cards that have not expired yet
    const activeCards = allCards.filter((card) => card.expiresAt > now);
    const totalCards = activeCards.length;

    // Calculate total value (sum of all amounts)
    const totalValue = allCards.reduce((sum, card) => {
      return sum + parseFloat(card.amount.toString());
    }, 0);

    // Calculate total remaining value
    const totalRemainingValue = allCards.reduce((sum, card) => {
      return sum + parseFloat(card.remainingAmount.toString());
    }, 0);

    // Calculate total redeemed value
    const totalRedeemedValue = totalValue - totalRemainingValue;

    // Count redeemed cards
    const totalRedeemedCards = allCards.filter(
      (card) => card.status === BusinessGiftCardStatus.USED,
    ).length;

    // Count pending cards (sent status is pending)
    const totalPendingCards = allCards.filter(
      (card) => card.sentStatus === BusinessSentStatus.PENDING,
    ).length;

    // Count sold cards (sent status is pending)
    const totalSoldCards = allCards.filter(
      (card) => card.soldStatus === BusinessGiftCardSoldStatus.PURCHASED,
    ).length;

    // Count available cards (not redeemed, not expired)
    const totalAvailableCards = allCards.filter(
      (card) =>
        card.status === BusinessGiftCardStatus.ACTIVE && card.expiresAt > now,
    ).length;

    // Count expired cards
    const totalExpiredCards = allCards.filter(
      (card) =>
        card.status === BusinessGiftCardStatus.EXPIRED || card.expiresAt <= now,
    ).length;

    return {
      totalCards,
      totalValue: parseFloat(totalValue.toFixed(2)),
      totalRedeemedCards,
      totalSoldCards,
      totalPendingCards,
      totalAvailableCards,
      totalExpiredCards,
      totalRemainingValue: parseFloat(totalRemainingValue.toFixed(2)),
      totalRedeemedValue: parseFloat(totalRedeemedValue.toFixed(2)),
    };
  }

  private isValidCodeFormat(code: string): boolean {
    const pattern = /^KSH[A-Z0-9]{5}$/;
    return pattern.test(code);
  }

  /**
   * Get gift card list with filtering and pagination
   */
  async getGiftCardsList(filters: BusinessGiftCardFiltersDto) {
    const {
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 6,
      status,
      sentStatus,
    } = filters;

    const queryBuilder = this.giftCardRepository.createQueryBuilder('giftCard');

    /* --------- ALWAYS exclude deleted ---------- */
    queryBuilder.andWhere('giftCard.status != :deletedStatus', {
      deletedStatus: 'deleted',
    });

    /* --------- RELATIONS ---------- */
    queryBuilder.leftJoinAndSelect('giftCard.business', 'business');

    /* --------- FILTERS ---------- */
    if (sentStatus && sentStatus !== 'All') {
      queryBuilder.andWhere('giftCard.sentStatus = :sentStatus', {
        sentStatus,
      });
    }

    if (status && status !== 'All') {
      queryBuilder.andWhere('giftCard.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        `(giftCard.title ILIKE :searchTerm 
        OR giftCard.description ILIKE :searchTerm 
        OR giftCard.recipientName ILIKE :searchTerm
        OR giftCard.recipientEmail ILIKE :searchTerm
      )`,
        { searchTerm: `%${search}%` },
      );
    }

    /* --------- SORTING (APPLIED ONCE!) ---------- */

    // Otherwise follow user-defined sortBy and sortOrder
    queryBuilder.orderBy(
      `giftCard.${sortBy}`,
      sortOrder.toUpperCase() as 'ASC' | 'DESC',
    );

    /* --------- PAGINATION ---------- */
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    /* --------- EXECUTE ---------- */
    const [giftCards, total] = await queryBuilder.getManyAndCount();

    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit + 1;
    const endIndex = Math.min(page * limit, total);

    return {
      giftCards,
      meta: {
        total,
        page,
        limit,
        totalPages,
        startIndex,
        endIndex,
      },
    };
  }

  async findOne(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.giftCardRepository.findOne({ where: { id } });
    if (!giftCard) {
      throw new NotFoundException(`Gift card with ID ${id} not found`);
    }
    return giftCard;
  }

  async findOneByOwnerId(ownerId: string): Promise<BusinessGiftCard> {
    const giftCard = await this.giftCardRepository.findOne({
      where: { businessId: ownerId },
    });
    if (!giftCard) {
      throw new NotFoundException(`Gift card not found`);
    }
    return giftCard;
  }

  async findByCode(code: string): Promise<BusinessGiftCard> {
    const giftCard = await this.giftCardRepository.findOne({
      where: { code },
    });
    if (!giftCard) {
      throw new NotFoundException(`Gift card with code ${code} not found`);
    }
    return giftCard;
  }

  async update(
    id: string,
    updateGiftCardDto: UpdateBusinessGiftCardDto,
  ): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    Object.assign(giftCard, updateGiftCardDto);
    return await this.giftCardRepository.save(giftCard);
  }

  async redeem(
    redeemDto: RedeemBusinessGiftCardDto,
  ): Promise<BusinessGiftCard> {
    const giftCard = await this.findByCode(redeemDto.code);

    // Validate gift card can be redeemed
    if (giftCard.status === BusinessGiftCardStatus.USED) {
      throw new BadRequestException(
        'Gift card has already been fully redeemed',
      );
    }

    if (giftCard.status === BusinessGiftCardStatus.EXPIRED) {
      throw new BadRequestException('Gift card has expired');
    }

    if (giftCard.status === BusinessGiftCardStatus.INACTIVE) {
      throw new BadRequestException('Gift card has been cancelled');
    }

    if (new Date() > giftCard.expiresAt) {
      giftCard.status = BusinessGiftCardStatus.EXPIRED;
      await this.giftCardRepository.save(giftCard);
      throw new BadRequestException('Gift card has expired');
    }

    const amountToRedeem = redeemDto.amountToRedeem || giftCard.remainingAmount;

    if (amountToRedeem > giftCard.remainingAmount) {
      throw new BadRequestException(
        `Cannot redeem ${amountToRedeem}. Only ${giftCard.remainingAmount} remaining`,
      );
    }

    giftCard.remainingAmount -= amountToRedeem;

    if (giftCard.remainingAmount === 0) {
      giftCard.status = BusinessGiftCardStatus.USED;
      giftCard.redeemedAt = new Date();
    }

    return await this.giftCardRepository.save(giftCard);
  }

  async markAsSent(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.sentStatus = BusinessSentStatus.SENT;
    return await this.giftCardRepository.save(giftCard);
  }

  async markAsDelete(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.status = BusinessGiftCardStatus.DELETED;
    return await this.giftCardRepository.save(giftCard);
  }

  async markAsExpired(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.status = BusinessGiftCardStatus.INACTIVE;
    return await this.giftCardRepository.save(giftCard);
  }

  async markAsDelivered(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.sentStatus = BusinessSentStatus.DELIVERED;
    return await this.giftCardRepository.save(giftCard);
  }

  async cancel(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);

    if (giftCard.status === BusinessGiftCardStatus.USED) {
      throw new BadRequestException('Cannot cancel a redeemed gift card');
    }

    giftCard.status = BusinessGiftCardStatus.INACTIVE;
    return await this.giftCardRepository.save(giftCard);
  }

  async remove(id: string): Promise<void> {
    const result = await this.giftCardRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Gift card with ID ${id} not found`);
    }
  }

  async checkExpiredCards(): Promise<number> {
    const now = new Date();
    const result = await this.giftCardRepository
      .createQueryBuilder()
      .update(BusinessGiftCard)
      .set({ status: BusinessGiftCardStatus.EXPIRED })
      .where('expiresAt < :now', { now })
      .andWhere('status = :status', {
        status: BusinessGiftCardStatus.ACTIVE,
      })
      .execute();

    return result.affected || 0;
  }

  async creditWalletFromGiftCard(
    businessId: string,
    amount: number,
    reference: string,
  ) {
    // await this.addFunds({
    //   businessId,
    //   amount,
    //   type: 'credit',
    //   description: `Gift card purchase via Paystack`,
    //   referenceId: reference,
    // });
  }
}
