import { Request, Response } from "express";
import { AppError, catchAsync } from "../../middlewares/centralAppError";
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

export const getBlogPost = catchAsync(async (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? "");
  // Anything that can't be a slug can't be a post.
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/i.test(slug)) throw AppError.notFound("Blog post");
  res.success(await landingService.getPublishedBlogPost(slug));
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
