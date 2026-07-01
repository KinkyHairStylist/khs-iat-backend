import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from 'src/business/entities/transaction.entity';
import { User } from 'src/all_user_entities/user.entity';
import { Refund, RefundStatus } from '../user_entities/refund.entity';
import { TransactionPaginationDto } from '../dtos/transaction.dto';

export interface TransactionSummary {
  totalSpent: number;
  successfulPaymentsCount: number;
  totalRefundAmount: number;
  currentYear: number
}

export interface PaginatedTransactionResult {
  transactions: Transaction[];
  meta: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
    limit: number;
  };
}

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,
  ) {}

  /**
   * Decode cursor from Base64 string
   */
  private decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const [createdAt, id] = decoded.split('|');
      return { createdAt: new Date(createdAt), id };
    } catch {
      return null;
    }
  }

  /**
   * Encode cursor to Base64 string
   */
  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64');
  }

  /**
   * Get user transactions with cursor-based pagination (efficient for large datasets)
   * Uses keyset pagination to avoid OFFSET performance issues
   */
  async getUserTransactions(
    user: User,
    pagination: TransactionPaginationDto = {},
  ): Promise<PaginatedTransactionResult> {
    const { limit = 50, cursor } = pagination;

    // Fetch one extra record to determine if there's a next page
    const queryBuilder = this.transactionRepository.createQueryBuilder('transaction');

    // Filter by user as sender or recipient
    queryBuilder.andWhere(
      '(transaction.senderId = :userId OR transaction.recipientId = :userId)',
      { userId: user.id },
    );

    // Load relations
    queryBuilder.leftJoinAndSelect('transaction.sender', 'sender');
    queryBuilder.leftJoinAndSelect('transaction.recipient', 'recipient');

    // Cursor-based pagination: fetch records created before the cursor
    if (cursor) {
      const cursorData = this.decodeCursor(cursor);
      if (cursorData) {
        // Use compound condition for accurate cursor positioning
        queryBuilder.andWhere(
          '(transaction.createdAt < :cursorCreatedAt) OR (transaction.createdAt = :cursorCreatedAt AND transaction.id < :cursorId)',
          { cursorCreatedAt: cursorData.createdAt, cursorId: cursorData.id },
        );
      }
    }

    // Sort by createdAt DESC, then id DESC for consistent ordering
    queryBuilder.orderBy('transaction.createdAt', 'DESC');
    queryBuilder.addOrderBy('transaction.id', 'DESC');

    // Take limit + 1 to check for next page
    queryBuilder.take(limit + 1);

    // Execute query (no OFFSET needed - this is the key optimization)
    const transactions = await queryBuilder.getMany();

    // Determine if there's a next page
    const hasNextPage = transactions.length > limit;
    
    // Remove the extra record if present
    const paginatedTransactions = hasNextPage ? transactions.slice(0, limit) : transactions;

    // Generate cursors
    const startCursor = paginatedTransactions.length > 0
      ? this.encodeCursor(paginatedTransactions[0].createdAt, paginatedTransactions[0].id)
      : null;
    
    const endCursor = paginatedTransactions.length > 0
      ? this.encodeCursor(
          paginatedTransactions[paginatedTransactions.length - 1].createdAt,
          paginatedTransactions[paginatedTransactions.length - 1].id,
        )
      : null;

    return {
      transactions: paginatedTransactions,
      meta: {
        hasNextPage,
        hasPreviousPage: !!cursor, // If there's a cursor, we can assume there's a previous page
        startCursor,
        endCursor,
        limit,
      },
    };
  }

  async getUserTransactionSummary(user: User, year?: number): Promise<TransactionSummary> {
    const currentYear = year || new Date().getFullYear();

    // Get transactions for the current year where user is sender (spending transactions)
    const spendTransactions = await this.transactionRepository.find({
      where: {
        senderId: user.id,
      },
    });

    // Calculate total spent (successful DEBIT transactions)
    const totalSpent = spendTransactions
      .filter(t => t.status === TransactionStatus.COMPLETED && t.type === TransactionType.DEBIT)
      .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

    // Count successful payments
    const successfulPaymentsCount = spendTransactions
      .filter(t => t.status === TransactionStatus.COMPLETED && t.type === TransactionType.DEBIT)
      .length;

    // Calculate total refund amount (REFUND transactions received by user)
    const refundTransactions = await this.transactionRepository.find({
      where: {
        recipientId: user.id,
        type: TransactionType.REFUND,
        status: TransactionStatus.COMPLETED,
        createdAt: new Date(`${currentYear}-01-01`) as any,
      },
    });

    const totalRefundAmount = refundTransactions
      .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

    return {
      totalSpent,
      successfulPaymentsCount,
      totalRefundAmount,
      currentYear,
    };
  }

  async requestRefund(user: User, transactionId: string, reason: string, accountDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountHolderName?: string;
    routingNumber?: string;
    bankAddress?: string;
    swiftCode?: string;
  }): Promise<Refund> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['sender', 'recipient'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.senderId !== user.id) {
      throw new ForbiddenException('You can only request refunds for transactions you initiated');
    }

    if (transaction.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('Only completed transactions can be refunded');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (transaction.createdAt < thirtyDaysAgo) {
      throw new BadRequestException('Refund period has expired (30 days)');
    }

    const existingRefund = await this.refundRepository.findOne({
      where: { transactionId, userId: user.id },
    });

    if (existingRefund && existingRefund.status !== RefundStatus.REJECTED) {
      throw new BadRequestException('Refund already requested for this transaction');
    }

    const refund = this.refundRepository.create({
      transactionId,
      userId: user.id,
      amount: parseFloat(transaction.amount.toString()),
      currency: transaction.currency,
      reason,
      status: RefundStatus.PENDING,
      bankName: accountDetails?.bankName,
      accountNumber: accountDetails?.accountNumber,
      accountHolderName: accountDetails?.accountHolderName,
      routingNumber: accountDetails?.routingNumber,
      bankAddress: accountDetails?.bankAddress,
      swiftCode: accountDetails?.swiftCode,
    });

    return this.refundRepository.save(refund);
  }
}
