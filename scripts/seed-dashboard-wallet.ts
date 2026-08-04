import 'dotenv/config';
import { AppDataSource } from '../src/config/database';
import { Business } from '../src/business/entities/business.entity';
import { Wallet } from '../src/business/entities/wallet.entity';
import {
  WalletCurrency,
  WalletStatus,
} from '../src/admin/payment/enums/wallet.enum';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from '../src/business/entities/transaction.entity';

// Seeds one Wallet for the merchant's business plus a small realistic
// transaction ledger: earnings tied to the completed/confirmed bookings from
// seed-dashboard-bookings.ts, a withdrawal, and a platform fee -- so
// balance/totalIncome/totalExpenses/pendingBalance all have real, consistent
// numbers behind them rather than zeros. Idempotent by referenceId.
const MERCHANT_EMAIL = 'proiquovizoiho-6823@yopmail.com';

const TRANSACTIONS: Array<{
  referenceId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  description: string;
  service?: string;
  customerName?: string;
  method?: PaymentMethod;
}> = [
  {
    referenceId: 'SEED-DASH-TXN-001',
    type: TransactionType.EARNING,
    status: TransactionStatus.COMPLETED,
    amount: 30000,
    description: 'Payment for Knotless Box Braids',
    service: 'Knotless Box Braids',
    customerName: 'Amara Chukwu',
    method: PaymentMethod.PAYSTACK,
  },
  {
    referenceId: 'SEED-DASH-TXN-002',
    type: TransactionType.EARNING,
    status: TransactionStatus.COMPLETED,
    amount: 28000,
    description: 'Payment for Balayage Color Melt',
    service: 'Balayage Color Melt',
    customerName: 'Tobenna Eze',
    method: PaymentMethod.PAYSTACK,
  },
  {
    referenceId: 'SEED-DASH-TXN-003',
    type: TransactionType.EARNING,
    status: TransactionStatus.COMPLETED,
    amount: 9000,
    description: 'Payment for Classic Gel Manicure',
    service: 'Classic Gel Manicure',
    customerName: 'Zainab Bello',
    method: PaymentMethod.CARD,
  },
  {
    referenceId: 'SEED-DASH-TXN-004',
    type: TransactionType.EARNING,
    status: TransactionStatus.PENDING,
    amount: 18000,
    description: 'Payment for Signature Silk Press (awaiting appointment completion)',
    service: 'Signature Silk Press',
    customerName: 'Folake Adebayo',
    method: PaymentMethod.PAYSTACK,
  },
  {
    referenceId: 'SEED-DASH-TXN-005',
    type: TransactionType.WITHDRAWAL,
    status: TransactionStatus.COMPLETED,
    amount: 20000,
    description: 'Withdrawal to bank account',
    method: PaymentMethod.BANK,
  },
  {
    referenceId: 'SEED-DASH-TXN-006',
    type: TransactionType.FEE,
    status: TransactionStatus.COMPLETED,
    amount: 1000,
    description: 'Platform service fee',
  },
];

async function main() {
  await AppDataSource.initialize();
  console.log('DB connected\n');

  const businessRepo = AppDataSource.getRepository(Business);
  const walletRepo = AppDataSource.getRepository(Wallet);
  const transactionRepo = AppDataSource.getRepository(Transaction);

  const business = await businessRepo.findOne({ where: { ownerEmail: MERCHANT_EMAIL } });
  if (!business) throw new Error(`No business found with ownerEmail=${MERCHANT_EMAIL}`);
  console.log(`Seeding wallet for business "${business.businessName}" (${business.id})\n`);

  let wallet = await walletRepo.findOne({ where: { businessId: business.id } });
  if (!wallet) {
    wallet = walletRepo.create({
      businessId: business.id,
      ownerId: business.ownerId,
      currency: WalletCurrency.NGN,
      status: WalletStatus.ACTIVE,
      isVerified: true,
      balance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      pendingBalance: 0,
      description: 'Seeded wallet for dashboard testing',
    });
    wallet = await walletRepo.save(wallet);
    console.log('CREATE wallet');
  } else {
    console.log('Wallet already exists, reusing it');
  }

  let totalIncome = Number(wallet.totalIncome);
  let totalExpenses = Number(wallet.totalExpenses);
  let pendingBalance = Number(wallet.pendingBalance);
  let created = 0;
  let skipped = 0;

  for (const def of TRANSACTIONS) {
    const existing = await transactionRepo.findOne({ where: { referenceId: def.referenceId } });
    if (existing) {
      console.log(`SKIP  (already exists): ${def.referenceId}`);
      skipped++;
      continue;
    }

    const transaction = transactionRepo.create({
      wallet,
      walletId: wallet.id,
      recipientId: wallet.ownerId,
      amount: def.amount,
      reason: def.description,
      currency: WalletCurrency.NGN,
      type: def.type,
      description: def.description,
      service: def.service,
      customerName: def.customerName,
      mode: 'Web',
      referenceId: def.referenceId,
      status: def.status,
      method: def.method,
    });
    await transactionRepo.save(transaction);
    console.log(`CREATE: ${def.referenceId} — ${def.type} ${def.amount} (${def.status})`);
    created++;

    if (def.status === TransactionStatus.COMPLETED) {
      if (def.type === TransactionType.EARNING) totalIncome += def.amount;
      if (def.type === TransactionType.WITHDRAWAL || def.type === TransactionType.FEE) {
        totalExpenses += def.amount;
      }
    } else if (def.status === TransactionStatus.PENDING && def.type === TransactionType.EARNING) {
      pendingBalance += def.amount;
    }
  }

  wallet.totalIncome = totalIncome;
  wallet.totalExpenses = totalExpenses;
  wallet.pendingBalance = pendingBalance;
  wallet.balance = totalIncome - totalExpenses;
  await walletRepo.save(wallet);

  console.log(`\nWallet totals -> balance: ${wallet.balance}, totalIncome: ${wallet.totalIncome}, totalExpenses: ${wallet.totalExpenses}, pendingBalance: ${wallet.pendingBalance}`);
  console.log(`Done. Created ${created} transaction(s), skipped ${skipped} (already existed).`);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
