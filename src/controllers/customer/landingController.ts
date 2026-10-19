import { Request, Response } from "express";
import { catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { subscribeNewsletterSchema } from "../../schemas/customer/landing.schema";
import * as landingService from "../../services/customer/landingService";

export const getStats = catchAsync(async (_req: Request, res: Response) => {
  res.success(await landingService.listActiveStats());
});

export const getTestimonials = catchAsync(async (_req: Request, res: Response) => {
  res.success(await landingService.listApprovedTestimonials());
});

export const getBlogPosts = catchAsync(async (_req: Request, res: Response) => {
  res.success(await landingService.listPublishedBlogPosts());
});

export const getFaqs = catchAsync(async (_req: Request, res: Response) => {
  res.success(await landingService.listActiveFaqs());
});

export const getStories = catchAsync(async (_req: Request, res: Response) => {
  res.success(await landingService.listPublishedStories());
});

export const subscribeNewsletter = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(subscribeNewsletterSchema, req.body);
  await landingService.subscribeNewsletter(input);
  res.success(null, "You're subscribed. Thanks for joining our newsletter!", 201);
});
