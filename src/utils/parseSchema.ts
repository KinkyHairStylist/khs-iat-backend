import { z } from "zod";
import { AppError } from "../middlewares/centralAppError";

/** "from.address" -> "From address", "numberOfPassengers" -> "Number of passengers". */
function fieldLabel(path: PropertyKey[]): string {
  const words = path
    .filter((p): p is string => typeof p === "string")
    .join(" ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "This field";
}

// Zod's built-in wording ("Too big: expected string to have <=300 characters",
// "Invalid input: expected string, received undefined") is for developers.
// Rules with their own message keep it; these defaults get plain English.
const ZOD_DEFAULT_MESSAGE = /^(Invalid input|Invalid option|Invalid string|Invalid type|Too big|Too small|Expected |Required$|Unrecognized key)/;

function friendlyMessage(issue: z.core.$ZodIssue): string {
  if (!ZOD_DEFAULT_MESSAGE.test(issue.message)) return issue.message;

  const field = fieldLabel(issue.path);
  const raw = issue as unknown as { origin?: string; maximum?: number | bigint; minimum?: number | bigint };

  switch (issue.code) {
    case "invalid_type":
      // Zod v4 doesn't attach the input here — a missing field reads "received undefined".
      return /received (undefined|null)/.test(issue.message) ? `${field} is required.` : `${field} isn't valid. Please check it.`;
    case "too_big":
      return raw.origin === "string"
        ? `${field} is too long. Please keep it to ${raw.maximum} characters or fewer.`
        : `${field} must be ${raw.maximum} or less.`;
    case "too_small":
      if (raw.origin === "string") {
        return Number(raw.minimum) <= 1 ? `${field} is required.` : `${field} must be at least ${raw.minimum} characters.`;
      }
      return `${field} must be at least ${raw.minimum}.`;
    case "invalid_value":
      return `Please choose a valid option for ${field.toLowerCase()}.`;
    case "unrecognized_keys": {
      const keys = (issue as unknown as { keys?: string[] }).keys ?? [];
      return `${keys.length ? `"${keys.join('", "')}"` : "A field"} can't be changed here. Refresh the page and try again.`;
    }
    case "invalid_key":
      return `${field} has an option we don't recognise. Refresh the page and try again.`;
    default:
      return `${field} isn't valid. Please check it.`;
  }
}

/**
 * Parses `data` against a Zod schema and returns the typed result.
 * Throws AppError.badRequest with the first problem, in plain English.
 */
export function parseSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw AppError.badRequest(
      first ? friendlyMessage(first) : "Some of the details you entered aren't valid. Please check and try again.",
      "VALIDATION_ERROR"
    );
  }
  return result.data;
}
