import { IsString, IsOptional } from 'class-validator';

export class UpdateWithdrawalDto {
  @IsOptional()
  @IsString()
  status?: 'Pending' | 'Processing' | 'Completed' | 'Rejected';
}
