import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  MerchantMembershipPurchase,
  MerchantMembershipPurchaseStatus,
} from '../entities/merchant-membership-purchase.entity';
import { BusinessGiftCard } from '../entities/business-giftcard.entity';
import { BusinessGiftCardStatus } from '../enum/gift-card.enum';
import { Business } from '../entities/business.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from '../entities/transaction.entity';
import { PLATFORM_LEDGER_CURRENCY, WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { BusinessWalletService } from './wallet.service';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';

// Sweeps both merchant-created memberships and gift cards for expiry.
// Unredeemed prepaid value is split 50/50 between the business and KHS —
// mirrors LateCancellationForfeiture/ChargebackFee's pattern of crediting
// only the business's share to its wallet and recording KHS's share as a
// standalone walletless Fee Transaction.
@Injectable()
export class PrepaidPoolExpiryCronService {
  private readonly logger = new Logger(PrepaidPoolExpiryCronService.name);

  constructor(
    @InjectRepository(MerchantMembershipPurchase)
    private readonly purchaseRepo: Repository<MerchantMembershipPurchase>,
    @InjectRepository(BusinessGiftCard)
    private readonly giftCardRepo: Repository<BusinessGiftCard>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly walletService: BusinessWalletService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailySweep(): Promise<void> {
    const membershipCount = await this.sweepMemberships();
    const giftCardCount = await this.sweepGiftCards();

    if (membershipCount > 0 || giftCardCount > 0) {
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.INFO,
        type: SlackEventType.CRON_EXECUTION,
        trigger: 'Prepaid pool expiry sweep',
        body: `Daily expiry sweep completed.
• Memberships expired: ${membershipCount}
• Gift cards expired: ${giftCardCount}`,
      });
    }
  }

  private sendExpiryEmail(to: string, name: string, message: string): void {
    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const subject = 'Your prepaid balance has expired';
    const html = this.templateService.render('communication-bulk', {
      businessName: 'Kinky Hairstylist',
      subject,
      clientName: name || 'there',
      message,
      closingRemarks: null,
      frontendUrl,
      year: new Date().getFullYear(),
    });
    this.emailService.sendEmail(to, subject, message, html);
  }

  private async sweepMemberships(): Promise<number> {
    const expired = await this.purchaseRepo.find({
      where: {
        status: MerchantMembershipPurchaseStatus.ACTIVE,
        expiresAt: LessThan(new Date()),
      },
      relations: ['package', 'package.service', 'client'],
    });

    for (const purchase of expired) {
      try {
        if (purchase.remainingSessions > 0 && purchase.package) {
          const unredeemedValue = purchase.remainingSessions * Number(purchase.package.pricePerSession);
          await this.splitAndCredit(
            purchase.businessId,
            unredeemedValue,
            purchase.id,
            'MembershipExpirySplit',
            `expired membership (package ${purchase.packageId})`,
          );

          if (purchase.client?.email) {
            this.sendExpiryEmail(
              purchase.client.email,
              purchase.client.firstName,
              `Your ${purchase.remainingSessions} remaining session(s) on your "${purchase.package.service?.name || 'membership'}" package have expired and are no longer redeemable.`,
            );
          }
        }

        purchase.status = MerchantMembershipPurchaseStatus.EXPIRED;
        purchase.remainingSessions = 0;
        await this.purchaseRepo.save(purchase);
      } catch (error) {
        this.logger.error(
          `Failed to sweep expired membership purchase ${purchase.id}: ${error.message}`,
          error.stack,
        );
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.SYSTEM,
          severity: SlackSeverity.ERROR,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Membership expiry sweep failed (${purchase.id})`,
          body: `Failed to sweep expired membership purchase ${purchase.id}.
• Business: ${purchase.businessId}
• Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return expired.length;
  }

  private async sweepGiftCards(): Promise<number> {
    const expired = await this.giftCardRepo.find({
      where: {
        status: BusinessGiftCardStatus.ACTIVE,
        expiresAt: LessThan(new Date()),
      },
    });

    for (const card of expired) {
      try {
        const unredeemedValue = Number(card.remainingAmount);
        if (unredeemedValue > 0) {
          await this.splitAndCredit(
            card.businessId,
            unredeemedValue,
            card.id,
            'GiftCardExpirySplit',
            `expired gift card (${card.code})`,
          );

          const holderEmail = card.recipientEmail || card.ownerEmail;
          const holderName = card.recipientName || card.ownerFullName || 'there';
          if (holderEmail) {
            this.sendExpiryEmail(
              holderEmail,
              holderName,
              `Your gift card "${card.title}" (${card.code}) with a remaining balance of $${unredeemedValue.toFixed(2)} has expired and is no longer redeemable.`,
            );
          }
        }

        card.status = BusinessGiftCardStatus.EXPIRED;
        card.remainingAmount = 0;
        await this.giftCardRepo.save(card);
      } catch (error) {
        this.logger.error(
          `Failed to sweep expired gift card ${card.id}: ${error.message}`,
          error.stack,
        );
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.SYSTEM,
          severity: SlackSeverity.ERROR,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Gift card expiry sweep failed (${card.id})`,
          body: `Failed to sweep expired gift card ${card.id} (${card.code}).
• Business: ${card.businessId}
• Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return expired.length;
  }

  private async splitAndCredit(
    businessId: string,
    unredeemedValue: number,
    referenceId: string,
    feeSubtype: 'MembershipExpirySplit' | 'GiftCardExpirySplit',
    label: string,
  ): Promise<void> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    const ownerId = business?.ownerId || business?.owner?.id;
    if (!business || !ownerId) {
      this.logger.warn(`No business/owner found for ${businessId} — skipping expiry split for ${label}`);
      // The caller still marks the purchase/card EXPIRED with its
      // remaining value zeroed out regardless of this return — that value
      // evaporates uncredited to either side.
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Expiry split skipped — no business/owner (${businessId})`,
        body: `Prepaid value from a ${label} could not be split — no business or owner found for ${businessId}. This value ($${unredeemedValue}) is now uncredited to either side.
• Reference: ${referenceId}`,
      });
      return;
    }

    const businessShare = Math.round((unredeemedValue / 2) * 100) / 100;
    const khsShare = Math.round((unredeemedValue - businessShare) * 100) / 100;

    if (businessShare > 0) {
      try {
        await this.walletService.getWalletByBusinessId(businessId);
      } catch {
        await this.walletService.createWalletForBusiness({
          businessId,
          ownerId,
          currency: PLATFORM_LEDGER_CURRENCY,
          description: 'Business wallet - auto-created from prepaid-pool expiry split',
        });
      }

      await this.walletService.addFundsPending({
        businessId,
        recipientId: ownerId,
        senderId: ownerId,
        amount: businessShare,
        type: TransactionType.EARNING,
        description: `Business share of ${label}`,
        referenceId,
        currency: WalletCurrency.USD,
        mode: 'System',
        method: PaymentMethod.STRIPE,
      });
    }

    if (khsShare > 0) {
      await this.transactionRepo.save(
        this.transactionRepo.create({
          recipientId: ownerId,
          amount: khsShare,
          type: TransactionType.FEE,
          feeSubtype,
          currency: WalletCurrency.USD,
          description: `KHS share of ${label}`,
          mode: 'System',
          referenceId,
          status: TransactionStatus.COMPLETED,
          method: PaymentMethod.STRIPE,
          service: 'PrepaidPool-Expiry-Fee',
        }),
      );
    }
  }
}
