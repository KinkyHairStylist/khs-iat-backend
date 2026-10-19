import { z } from "zod";
import { calendarDate } from "../fields";

// The salon's "today" comes from the browser (its calendar), not the server's clock.
const day = calendarDate("Dates look like 2026-01-31.");

export const dashboardHomeQuerySchema = z.object({ date: day });
export const dashboardStatsQuerySchema = z.object({ date: day, period: z.enum(["today", "week", "month"]).catch("today") });
