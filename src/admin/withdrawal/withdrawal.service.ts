import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction, TransactionType, TransactionStatus } from 'src/business/entities/transaction.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';

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
  ) {}

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
    withdrawal.status = 'Processing';
    await this.withdrawalRepo.save(withdrawal);

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

  // Get the wallet ID from the withdrawal's bankDetails
  const walletId = withdrawal.bankDetails.walletId;

  const wallet = await this.walletRepo.findOne({
    where: { id: walletId },
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

  return this.withdrawalRepo.save(withdrawal);
}

  // Get pending withdrawals
  async getPending(): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({ where: { status: 'Pending' } });
  }

  // Delete all withdrawal requests
  async deleteAll(): Promise<{ message: string }> {
    await this.withdrawalRepo.clear();
    return {
      message: 'All withdrawal requests have been deleted successfully',
    };
  }
}
