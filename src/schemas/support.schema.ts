import { z } from "zod";

const uuid = (what: string) => z.string().uuid(`We couldn't find that ${what}. Please refresh and try again.`);

export const createTicketSchema = z.object({
  /** The team member picked from "Talk to our team". */
  assignedAdminId: uuid("team member").optional(),
});

export const sendMessageSchema = z
  .object({
    /** Needed when the customer has more than one open conversation. */
    ticketId: uuid("conversation").optional(),
    receiverId: uuid("team member").optional(),
    message: z.string().max(5000, "Please keep a message under 5,000 characters.").optional(),
    /** A data: URL or bare base64 image, at most 1 MB once decoded (checked in the service). */
    imageBase64: z.string().max(1_500_000, "Please choose an image smaller than 1 MB.").optional(),
  })
  .refine((v) => (v.message?.trim() ?? "") !== "" || !!v.imageBase64, { message: "Write a message or attach an image." });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
