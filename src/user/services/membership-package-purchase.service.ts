import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { MerchantMembershipPackage } from 'src/business/entities/merchant-membership-package.entity';
import {
  MerchantMembershipPurchase,
  MerchantMembershipPurchaseStatus,
} from 'src/business/entities/merchant-membership-purchase.entity';
import { User } from 'src/all_user_entities/user.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from 'src/business/entities/transaction.entity';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { StripeService } from 'src/payment/stripe.service';
import { PurchaseMembershipPackageDto } from '../dtos/membership-package.dto';
import { SlackService } from 'src/slack/slack.service';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';
import { Business, BusinessStatus } from 'src/business/entities/business.entity';
import { escapeLike, toMarketplaceItem } from 'src/helpers/membership-marketplace.helper';

@Injectable()
export class MembershipPackagePurchaseService {
  constructor(
    @InjectRepository(MerchantMembershipPackage)
    private readonly packageRepo: Repository<MerchantMembershipPackage>,
    @InjectRepository(MerchantMembershipPurchase)
    private readonly purchaseRepo: Repository<MerchantMembershipPurchase>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly slackService: SlackService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  // ------------------------------------------------------
  // Step 1 — Initialize purchase via Stripe. No purchase row is created
  // here — the full session-count is only granted once the PaymentIntent
  // is confirmed succeeded, via completePurchase() below. No commission
  // is taken at this stage: the full amount enters the prepaid pool, and
  // KHS's 12%-equivalent commission is only skimmed per-session at
  // redemption time (see booking.service.ts's confirmBooking).
  // ------------------------------------------------------
  async initPurchase(packageId: string, dto: PurchaseMembershipPackageDto, purchaser: User) {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId },
      relations: ['business'],
    });
    if (!pkg) throw new NotFoundException('Membership package not found');
    if (!pkg.isActive) throw new BadRequestException('Membership package is no longer available');

    const amount = Number(pkg.pricePerSession) * pkg.sessionCount;

    const paymentIntent = await this.stripeService.createPaymentIntent({
      amount: Math.round(amount * 100),
      currency: 'usd',
      customerEmail: purchaser.email,
      metadata: {
        packageId: pkg.id,
        purchaserId: purchaser.id,
        cardId: dto.cardId ?? '',
      },
    });

    const reference = paymentIntent.id;

    const purchaseTx = this.transactionRepo.create({
      senderId: purchaser.id,
      recipientId: pkg.business?.ownerId,
      amount,
      type: TransactionType.DEBIT,
      currency: WalletCurrency.USD,
      description: `Purchase of membership package (${pkg.sessionCount} sessions)`,
      mode: 'Web',
      referenceId: reference,
      status: TransactionStatus.PENDING,
      method: PaymentMethod.STRIPE,
      service: 'Membership-Purchase',
      customerName: `${purchaser.firstName} ${purchaser.surname}`,
    });
    await this.transactionRepo.save(purchaseTx);

    return {
      message: 'Payment initialized',
      amount,
      sessionCount: pkg.sessionCount,
      clientSecret: paymentIntent.client_secret,
      reference,
    };
  }

  // ------------------------------------------------------
  // Step 2 — Verify the PaymentIntent succeeded, then create the actual
  // MerchantMembershipPurchase row. Idempotent: a purchase row already
  // existing for this stripePaymentIntentId means a prior call (FE retry)
  // already completed it.
  // ------------------------------------------------------
  async completePurchase(reference: string, purchaser: User) {
    const existing = await this.purchaseRepo.findOne({
      where: { stripePaymentIntentId: reference },
    });
    if (existing) {
      return { message: 'Membership purchase already completed', purchase: existing, alreadyCompleted: true };
    }

    const intent = await this.stripeService.retrievePaymentIntent(reference);
    const meta = (intent?.metadata ?? {}) as Record<string, string>;

    if (!intent || intent.status !== 'succeeded') {
      await this.transactionRepo.update(
        { referenceId: reference, service: 'Membership-Purchase' },
        { status: TransactionStatus.FAILED },
      );
      this.slackService.notify(
        `⚠️ *Membership Package Purchase Verification Failed*\n` +
        `• *Purchaser*: ${purchaser.firstName || 'Customer'} ${purchaser.surname || ''} (${purchaser.email})\n` +
        `• *Reference*: \`${reference}\`\n` +
        `• *Stripe Status*: ${intent?.status || 'not found'}`,
      );
      throw new BadRequestException('Payment verification failed');
    }

    const pkg = await this.packageRepo.findOne({
      where: { id: meta.packageId },
      relations: ['service'],
    });
    if (!pkg) throw new NotFoundException('Membership package not found');
    const packageName = pkg.service?.name || 'membership package';

    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.expiryDays);

    const purchase = await this.dataSource.manager.transaction(async (manager) => {
      const row = manager.create(MerchantMembershipPurchase, {
        packageId: pkg.id,
        businessId: pkg.businessId,
        clientId: purchaser.id,
        remainingSessions: pkg.sessionCount,
        purchasedAt,
        expiresAt,
        status: MerchantMembershipPurchaseStatus.ACTIVE,
        stripePaymentIntentId: reference,
      });
      const saved = await manager.save(MerchantMembershipPurchase, row);

      await manager.update(
        Transaction,
        { referenceId: reference, service: 'Membership-Purchase' },
        { status: TransactionStatus.COMPLETED },
      );

      return saved;
    });

    this.slackService.notify(
      `⭐ *Membership Package Purchased*\n` +
      `• *Customer*: ${purchaser.firstName || 'Customer'} ${purchaser.surname || ''} (${purchaser.email})\n` +
      `• *Package*: ${packageName} (${pkg.sessionCount} sessions)\n` +
      `• *Amount*: $${(Number(pkg.pricePerSession) * pkg.sessionCount).toFixed(2)}\n` +
      `• *Expires*: ${expiresAt.toLocaleDateString('en-US')}`,
    );

    if (purchaser.email) {
      const business = await this.businessRepo.findOne({ where: { id: pkg.businessId } });
      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const message = `Your purchase of "${packageName}" (${pkg.sessionCount} sessions) at ${business?.businessName || 'the salon'} is confirmed. Your sessions are valid until ${expiresAt.toLocaleDateString('en-US')}.`;
      const html = this.templateService.render('communication-bulk', {
        businessName: business?.businessName || 'Kinky Hairstylist',
        subject: 'Your membership package purchase is confirmed',
        clientName: purchaser.firstName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(purchaser.email, 'Your membership package purchase is confirmed', message, html);
    }

    return { message: 'Membership purchase completed successfully', purchase };
  }

  // The customer's memberships, with the salon's name so they can be shown and linked. The salon
  // record itself is stripped out: it carries owner details a customer must never receive.
  async getOwnedPurchases(clientId: string) {
    const purchases = await this.purchaseRepo.find({
      where: { clientId },
      relations: ['package', 'package.service', 'package.business'],
      order: { createdAt: 'DESC' },
    });
    return purchases.map((purchase) => ({
      ...purchase,
      businessName: purchase.package?.business?.businessName ?? null,
      package: purchase.package ? { ...purchase.package, business: undefined } : purchase.package,
    }));
  }

  // Every active package from approved salons, for the customer marketplace. `search` matches the
  // salon or the service; `businessId` narrows it to one salon.
  async listMarketplace(filters: { search?: string; businessId?: string } = {}) {
    const query = this.packageRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.business', 'b')
      .innerJoinAndSelect('p.service', 's')
      .where('p.isActive = :active', { active: true })
      .andWhere('b.status = :approved', { approved: BusinessStatus.APPROVED });

    if (filters.businessId) query.andWhere('b.id = :businessId', { businessId: filters.businessId });

    const term = filters.search?.trim();
    if (term) {
      query.andWhere('(b.businessName ILIKE :term OR s.name ILIKE :term)', {
        term: `%${escapeLike(term)}%`,
      });
    }

    const packages = await query
      .orderBy('b.businessName', 'ASC')
      .addOrderBy('p.createdAt', 'DESC')
      .take(300)
      .getMany();
    return packages.map(toMarketplaceItem);
  }

  async listPackagesForBusiness(businessId: string) {
    return this.packageRepo.find({
      where: { businessId, isActive: true },
      relations: ['service'],
      order: { createdAt: 'DESC' },
    });
  }
}
