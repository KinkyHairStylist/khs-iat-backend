import { Request, Response } from "express";
import { AppError, catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { subscribeNewsletterSchema } from "../../schemas/customer/landing.schema";
import { waitlistSignupSchema } from "../../schemas/customer/waitlist.schema";
import * as landingService from "../../services/customer/landingService";
import { signUpForWaitlist } from "../../services/customer/waitlistService";
import { getClientIp } from "../../utils/requestIp";
import { sanitizeLogValue } from "../../utils/loggerCreator";

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

export const joinWaitlist = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(waitlistSignupSchema, req.body);
  // A filled honeypot is a bot: look successful, save nothing.
  if (input.company_website) {
    res.success(null, "You're on the waitlist.");
    return;
  }
  const result = await signUpForWaitlist(input, {
    ipAddress: getClientIp(req),
    userAgent: sanitizeLogValue(req.headers["user-agent"], 1000) || null,
  });
  res.success(result, input.stage === 1 ? "You're on the waitlist." : "Your details are saved.", result.stage === 1 ? 201 : 200);
});
