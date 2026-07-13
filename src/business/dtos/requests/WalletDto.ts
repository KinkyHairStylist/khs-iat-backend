import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PaymentMethodType,
  WalletCurrency,
} from 'src/admin/payment/enums/wallet.enum';
import {
  PaymentMethod,
  TransactionType,
} from 'src/business/entities/transaction.entity';

// DTOs for wallet operations
export class CreateWalletDto {
  @IsUUID()
  businessId: string;

  @IsUUID()
  ownerId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  currency?: WalletCurrency;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;
}

export class AddTransactionDto {
  @IsUUID()
  businessId: string;

  @IsUUID()
  recipientId: string;

  @IsUUID()
  senderId: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  currency?: WalletCurrency;

  @IsString()
  @MinLength(1)
  type: TransactionType;

  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  customerName?: string;

  @IsOptional()
  @MinLength(1)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MinLength(1)
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  service?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  mode?: string;
}

export class AddPaymentMethodDto {
  @IsUUID()
  walletId: string;

  @MinLength(1)
  type: PaymentMethodType;

  @IsOptional()
  provider?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cardHolderName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cardNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cardExpiryDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sortCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cvv?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  last4Digits?: string;

  @IsBoolean()
  isDefault: boolean;
}

export class CreateWithdrawalDto {
  businessId: string;
  businessName: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  bankDetails?: string;
  amount: number;
  currentBalance: number;
}

export class WithdrawalDto {
  @IsUUID()
  bankDetailsId: string;
}

export class DebitWalletRequestDto {
  @ValidateNested()
  @Type(() => AddTransactionDto)
  @IsObject()
  transaction: AddTransactionDto;

  @ValidateNested()
  @Type(() => WithdrawalDto)
  @IsObject()
  withdrawal: WithdrawalDto;
}

export class TransactionFiltersDto {
  @IsOptional()
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: string;

  @IsOptional()
  sortBy?: string;
}
