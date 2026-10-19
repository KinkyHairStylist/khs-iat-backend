import { z } from "zod";
import { HELP_SECTIONS } from "../services/help/articlesService";

export const articlesQuerySchema = z.object({
  section: z.enum(HELP_SECTIONS, { error: "Choose a help topic." }),
});
