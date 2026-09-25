import { IsIn, IsOptional, Matches } from 'class-validator';

export const DASHBOARD_PERIODS = ['today', 'week', 'month'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export class DashboardStatsDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS)
  period?: DashboardPeriod;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  anchorDate?: string;
}