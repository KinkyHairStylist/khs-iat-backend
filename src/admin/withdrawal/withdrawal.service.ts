import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction, TransactionType, TransactionStatus } from 'src/business/entities/transaction.entity';
import { Business } from 'src/business/entities/business.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';

@Injectable()
export class WithdrawalService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(BusinessGiftCard)
    private readonly giftCardRepo: Repository<BusinessGiftCard>, // 👈 inject giftcard repo

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  private async sendWithdrawalEmail(
    businessId: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business?.ownerEmail) return;

    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const html = this.templateService.render('communication-bulk', {
      businessName: business.businessName,
      subject,
      clientName: business.ownerName || 'there',
      message,
      closingRemarks: null,
      frontendUrl,
      year: new Date().getFullYear(),
    });
    this.emailService.sendEmail(business.ownerEmail, subject, message, html);
  }

  // Only a request nobody has decided yet can be approved or rejected.
  private assertPending(withdrawal: Withdrawal): void {
    if (withdrawal.status !== 'Pending') {
      throw new BadRequestException(`This withdrawal request is already ${withdrawal.status.toLowerCase()}`);
    }
  }

  // ✅ Get all withdrawals
  async findAll(): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ✅ Get withdrawal details by ID
  async findOne(id: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    return withdrawal;
  }

  // ✅ Create a new withdrawal request

  async create(dto: CreateWithdrawalDto): Promise<Withdrawal> {
    const businessName = dto.businessName.trim();

    const giftcard = await this.giftCardRepo.findOne({
      where: { business: { businessName: businessName } },
    });

    if (!giftcard) {
      throw new NotFoundException(
        `Gift card not found for business: ${dto.businessName}`,
      );
    }

    if (giftcard.amount < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    giftcard.remainingAmount -= dto.amount;
    await this.giftCardRepo.save(giftcard);

    const withdrawal = this.withdrawalRepo.create({
      ...dto,
      status: 'Pending',
      currentBalance: giftcard.remainingAmount,
      requestDate: new Date().toISOString(),
    });

    return this.withdrawalRepo.save(withdrawal);
  }

  // ✅ Approve and process payout
  async approve(id: string): Promise<Withdrawal> {
    const withdrawal = await this.findOne(id);
    this.assertPending(withdrawal);
    withdrawal.status = 'Processing';
    await this.withdrawalRepo.save(withdrawal);

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_SUCCESS,
      trigger: `Payout approved: ${withdrawal.businessName}`,
      body: `A merchant payout was approved and is processing.
• Business: ${withdrawal.businessName}
• Amount: $${withdrawal.amount}
• Withdrawal ID: ${withdrawal.id}`,
    });
    this.sendWithdrawalEmail(
      withdrawal.businessId,
      'Your payout is on its way',
      `Your withdrawal request for $${withdrawal.amount} has been approved and is now processing.`,
    );

    // Simulate payout processing delay
    setTimeout(async () => {
      withdrawal.status = 'Completed';
      await this.withdrawalRepo.save(withdrawal);
    }, 3000);

    return withdrawal;
  }

  // ✅ Reject withdrawal
  async reject(id: string): Promise<Withdrawal> {
  const withdrawal = await this.findOne(id);

  if (!withdrawal) {
    throw new NotFoundException('Withdrawal not found');
  }
  // Rejecting twice would credit the wallet twice.
  this.assertPending(withdrawal);

  // The wallet the money came out of: the one behind the payout account, or failing that the
  // business's own wallet (the payout account can be removed after the request is made).
  const walletId = withdrawal.bankDetails?.walletId;

  const wallet = await this.walletRepo.findOne({
    where: walletId ? { id: walletId } : { businessId: withdrawal.businessId },
  });

  if (!wallet) {
    throw new NotFoundException('Wallet not found');
  }

  const amount = Number(withdrawal.amount);

  // Refund wallet balance
  wallet.balance = Number(wallet.balance) + amount;

  await this.walletRepo.save(wallet);

  // Update withdrawal status
  withdrawal.status = 'Rejected';

  // Create refund transaction
  await this.transactionRepo.save({
    walletId: wallet.id,
    amount: amount,
    type: TransactionType.REFUND,
    status: TransactionStatus.COMPLETED,
    description: `Refund for rejected withdrawal`,
    currency: wallet.currency,
  });

  SlackService.notify({
    node: SlackNode.PAYMENT,
    provider: SlackProvider.SYSTEM,
    severity: SlackSeverity.INFO,
    type: SlackEventType.PAYMENT_FAILURE,
    trigger: `Payout rejected: ${withdrawal.businessName}`,
    body: `A merchant payout was rejected and the amount refunded back to the business's wallet.
• Business: ${withdrawal.businessName}
• Amount: $${amount}
• Withdrawal ID: ${withdrawal.id}`,
  });
  this.sendWithdrawalEmail(
    withdrawal.businessId,
    'Your withdrawal request was declined',
    `Your withdrawal request for $${amount} was declined, and the amount has been credited back to your wallet balance.`,
  );

  return this.withdrawalRepo.save(withdrawal);
}

  // Get pending withdrawals
  async getPending(): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({ where: { status: 'Pending' } });
  }
}
