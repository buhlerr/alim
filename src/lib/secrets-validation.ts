import { z } from "zod";

/**
 * Suggested categories for the Secrets vault. The stored `category` is a free
 * string (users can type their own), but these presets drive the UI dropdown.
 */
export const SECRET_CATEGORIES = [
  "API Token",
  "Password",
  "Connection String",
  "SSH Key",
  "Other",
] as const;

export const createSecretSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  value: z.string().min(1, "Value is required"),
  category: z.string().trim().min(1, "Category is required").max(100),
  description: z.string().max(2000).optional().or(z.literal("")),
});
export type CreateSecretInput = z.infer<typeof createSecretSchema>;

export const updateSecretSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  // Optional on update: when left blank the existing encrypted value is kept.
  value: z.string().optional(),
  category: z.string().trim().min(1, "Category is required").max(100),
  description: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateSecretInput = z.infer<typeof updateSecretSchema>;
