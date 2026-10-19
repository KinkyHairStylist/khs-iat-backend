import { Request, Response } from "express";
import { catchAsync } from "../middlewares/centralAppError";
import { parseSchema } from "../utils/parseSchema";
import { articlesQuerySchema } from "../schemas/help.schema";
import { listArticles } from "../services/help/articlesService";

export const articles = catchAsync(async (req: Request, res: Response) => {
  res.success(await listArticles(parseSchema(articlesQuerySchema, req.query).section));
});
