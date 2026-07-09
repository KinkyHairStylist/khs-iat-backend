import { IsString, Matches } from 'class-validator';

export class GetAvailableSlotsDto {
  @IsString()
  // Accept pattern YYYY-MM-DD (simple check)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;
}