import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from 'src/business/entities/transaction.entity';
import { TopEarningsQueryDto, TopEarningsResponseDto  } from './dto/top-earnings-query.dto';
import { TransactionType, TransactionStatus } from 'src/business/entities/transaction.entity'
@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  async getAllWalletTransactions(): Promise<any[]> {
    const transactions = await this.transactionRepo.find({
      relations: ['sender', 'recipient'],
      order: { createdAt: 'DESC' },
    });

    const capitalize = (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    return transactions.map((tx) => ({
      id: tx.id,

      user: tx.sender
        ? `${tx.sender.firstName || ''} ${tx.sender.surname || ''}`.trim()
        : 'System',

      sender: tx.sender
        ? `${tx.sender.firstName || ''} ${tx.sender.surname || ''}`.trim()
        : null,

      recipient: tx.recipient
        ? `${tx.recipient.firstName || ''} ${tx.recipient.surname || ''}`.trim()
        : null,

      type: capitalize(tx.type),
      amount: Number(tx.amount),
      description: tx.description,
      status: capitalize(tx.status),
      currency: tx.currency || null,
      service: tx.service || null,

      // Only return the enum value
      method: tx.method, // ← this is your PaymentMethod enum

      referenceId: tx.referenceId || null,

      date: tx.createdAt.toISOString().split('T')[0],
      time: tx.createdAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    }));
  }

  async getTopEarningBusinesses(): Promise<TopEarningsResponseDto[]> {
    const limit = 5;

    // Total earnings across all businesses
    const totalEarningsResult = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'total')
      .where('txn.type = :earning', { earning: TransactionType.EARNING })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .getRawOne();

    const overallTotal = Number(totalEarningsResult.total) || 0;
    if (!overallTotal) return [];

    // Top businesses by total earnings
    const raw = await this.transactionRepo
      .createQueryBuilder('txn')
      .innerJoin('txn.wallet', 'wallet')
      .innerJoin('wallet.business', 'business')
      .select('wallet.businessId', 'businessId')
      .addSelect('business.businessName', 'businessName')
      .addSelect('SUM(txn.amount)::numeric', 'total_earnings') // alias with underscore
      .where('txn.type = :earning', { earning: TransactionType.EARNING })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .groupBy('wallet.businessId')
      .addGroupBy('business.businessName')
      .orderBy('total_earnings', 'DESC')
      .limit(limit)
      .getRawMany();

    return raw.map(r => {
      const total = Number(r.total_earnings); // use the aliased name
      const percentage = (total / overallTotal) * 100;

      return {
        businessName: r.businessName,
        total: total.toFixed(2),
        percentage: `${percentage.toFixed(1)}%`,
      };
    });
  }



  async getDashboardSummary() {
    const now = new Date();

    // ----------------------------
    // Total Wallet Balance
    // ----------------------------
    const totalIncomeRaw = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'totalIncome')
      .where('txn.type = :earning', { earning: TransactionType.EARNING })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .getRawOne();

    const totalExpensesRaw = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'totalExpenses')
      .where('txn.type IN (:...types)', { types: [TransactionType.WITHDRAWAL, TransactionType.DEBIT, TransactionType.FEE] })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .getRawOne();

    const totalBalance = Number(totalIncomeRaw.totalIncome ?? 0) - Number(totalExpensesRaw.totalExpenses ?? 0);

    // ----------------------------
    // Pending Withdrawals
    // ----------------------------
    const pendingWithdrawalsRaw = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'totalPending')
      .addSelect('COUNT(txn.id)', 'requests')
      .where('txn.type = :withdrawal', { withdrawal: TransactionType.WITHDRAWAL })
      .andWhere('txn.status = :pending', { pending: TransactionStatus.PENDING })
      .getRawOne();

    // ----------------------------
    // Today's Earnings
    // ----------------------------
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const earningsTodayRaw = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'todayTotal')
      .where('txn.type = :earning', { earning: TransactionType.EARNING })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .andWhere('txn.createdAt BETWEEN :start AND :end', { start: startOfToday, end: now })
      .getRawOne();

    const earningsYesterdayRaw = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'yesterdayTotal')
      .where('txn.type = :earning', { earning: TransactionType.EARNING })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .andWhere('txn.createdAt BETWEEN :start AND :end', { start: startOfYesterday, end: startOfToday })
      .getRawOne();

    const todayEarnings = Number(earningsTodayRaw.todayTotal ?? 0);
    const yesterdayEarnings = Number(earningsYesterdayRaw.yesterdayTotal ?? 0);
    const todayPercentage = yesterdayEarnings > 0
      ? ((todayEarnings - yesterdayEarnings) / yesterdayEarnings) * 100
      : 100;

    // ----------------------------
    // Platform Fees
    // ----------------------------
    const feesRaw = await this.transactionRepo
      .createQueryBuilder('txn')
      .select('SUM(txn.amount)', 'totalFees')
      .where('txn.type = :fee', { fee: TransactionType.FEE })
      .andWhere('txn.status = :completed', { completed: TransactionStatus.COMPLETED })
      .getRawOne();

    const totalFees = Number(feesRaw.totalFees ?? 0);
    const avgFeeRate = totalBalance > 0 ? (totalFees / totalBalance) * 100 : 0;

    return {
      totalWalletBalance: {
        amount: totalBalance.toFixed(2),
        growthPercent: null, // Optionally calculate vs last month if you want
      },
      pendingWithdrawals: {
        amount: Number(pendingWithdrawalsRaw.totalPending ?? 0).toFixed(2),
        requests: Number(pendingWithdrawalsRaw.requests ?? 0),
      },
      todaysEarnings: {
        amount: todayEarnings.toFixed(2),
        growthPercent: todayPercentage.toFixed(1),
      },
      platformFees: {
        amount: totalFees.toFixed(2),
        avgRate: avgFeeRate.toFixed(1),
      },
    };
  }
}
