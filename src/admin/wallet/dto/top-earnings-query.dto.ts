import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TopEarningsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number = 7;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

export class TopEarningsResponseDto {
  businessName: string;
  total: string;       
  percentage: string;  
}

export class TotalWalletBalanceDto {
  amount: string;
  available: string;
  held: string;
  growthPercent: string | null;
}

export class PendingWithdrawalsDto {
  amount: string;
  requests: number;
}

export class TodaysEarningsDto {
  amount: string;
  growthPercent: string | null;
}

export class PlatformFeesDto {
  amount: string;
  avgRate: string;
}

export class DashboardResponseDto {
  totalWalletBalance: TotalWalletBalanceDto;
  pendingWithdrawals: PendingWithdrawalsDto;
  todaysEarnings: TodaysEarningsDto;
  platformFees: PlatformFeesDto;
}
