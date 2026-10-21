import { z } from "zod";

// Form input is untrusted: every action parses it here before touching the database.

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, what: string) => text(max).min(1, `${what} is required`);
const optional = (max: number) => text(max).transform((v) => v || undefined).optional();

export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));
export const password = z.string().min(10, "Use at least 10 characters").max(200);

export const registerSchema = z.object({ name: required(80, "Name"), email, password });
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(200) });
export const resetRequestSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password });

export const enquirySchema = z.object({
  kind: z.enum(["QUOTE", "CALLBACK", "GENERAL"]),
  name: required(80, "Name"),
  email,
  phone: optional(30),
  company: optional(120),
  message: required(4000, "A message"),
  productId: optional(120),
  // Honeypot: a real visitor never sees this field, a bot fills it in.
  website: optional(200),
});

export const checkoutSchema = z.object({
  name: required(80, "Name"),
  email,
  phone: required(30, "Phone number"),
  company: optional(120),
  addressLine1: required(120, "Address"),
  addressLine2: optional(120),
  city: required(80, "Town or city"),
  postcode: required(12, "Postcode"),
  notes: optional(1000),
});

// The first message of the first problem, which is what a form shows.
export const firstError = (error: z.ZodError) => error.issues[0]?.message ?? "Check the form and try again";
