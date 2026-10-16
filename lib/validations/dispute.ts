import { z } from "zod";

/** Maximum number of evidence files accepted per dispute. */
export const MAX_DISPUTE_FILES = 5;

/** Maximum size, in bytes, accepted for a single evidence file (10 MB). */
export const MAX_DISPUTE_FILE_SIZE = 10 * 1024 * 1024;

/** MIME types accepted as dispute evidence. */
export const ALLOWED_DISPUTE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/**
 * Single source of truth for the email rule, shared between the Zod schema and
 * the step-by-step validators so client-side checks can never drift from the
 * submit-time schema.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-field maximum lengths, shared by the schema and the step validators. */
export const DISPUTE_FIELD_LIMITS = {
  name: 100,
  email: 254,
  orderNumber: 64,
  reason: 200,
  description: 2000,
} as const;

/** Human-readable validation messages, shared across the schema and validators. */
export const DISPUTE_ERRORS = {
  nameRequired: "Name is required",
  nameTooLong: "Name is too long",
  emailRequired: "Email is required",
  emailInvalid: "Email is invalid",
  emailTooLong: "Email is too long",
  orderNumberRequired: "Order number is required",
  orderNumberTooLong: "Order number is too long",
  reasonRequired: "Reason is required",
  reasonTooLong: "Reason is too long",
  descriptionRequired: "Description is required",
  descriptionTooShort: "Description must be at least 20 characters",
  descriptionTooLong: "Description is too long",
  filesRequired: "Please upload at least one file as evidence",
  filesTooMany: `You can upload a maximum of ${MAX_DISPUTE_FILES} files`,
  fileTooLarge: "Each file must be 10 MB or smaller.",
  fileType: "Please upload an image (JPG, PNG, WebP) or PDF.",
  agreeToTerms: "You must agree to the terms",
} as const;

/** True when `type` is an accepted evidence MIME type. */
export function isAllowedDisputeMimeType(type: string): boolean {
  return (ALLOWED_DISPUTE_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Validates a single evidence file, returning the first error message found, or
 * `null` when the file is acceptable. Shared by the schema and step validators.
 */
export function getDisputeFileError(file: File): string | null {
  if (file.size > MAX_DISPUTE_FILE_SIZE) {
    return DISPUTE_ERRORS.fileTooLarge;
  }
  if (!isAllowedDisputeMimeType(file.type)) {
    return DISPUTE_ERRORS.fileType;
  }
  return null;
}

const disputeFileSchema = z
  .instanceof(File)
  .refine(
    (file) => file.size <= MAX_DISPUTE_FILE_SIZE,
    DISPUTE_ERRORS.fileTooLarge
  );

export const DisputeFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, DISPUTE_ERRORS.nameRequired)
      .max(DISPUTE_FIELD_LIMITS.name, DISPUTE_ERRORS.nameTooLong),
    email: z
      .string()
      .trim()
      .min(1, DISPUTE_ERRORS.emailRequired)
      .max(DISPUTE_FIELD_LIMITS.email, DISPUTE_ERRORS.emailTooLong)
      .regex(EMAIL_REGEX, DISPUTE_ERRORS.emailInvalid),
    orderNumber: z
      .string()
      .trim()
      .min(1, DISPUTE_ERRORS.orderNumberRequired)
      .max(DISPUTE_FIELD_LIMITS.orderNumber, DISPUTE_ERRORS.orderNumberTooLong),
    reason: z
      .string()
      .trim()
      .min(1, DISPUTE_ERRORS.reasonRequired)
      .max(DISPUTE_FIELD_LIMITS.reason, DISPUTE_ERRORS.reasonTooLong),
    description: z
      .string()
      .trim()
      .min(1, DISPUTE_ERRORS.descriptionRequired)
      .min(20, DISPUTE_ERRORS.descriptionTooShort)
      .max(DISPUTE_FIELD_LIMITS.description, DISPUTE_ERRORS.descriptionTooLong),
    files: z
      .array(disputeFileSchema)
      .min(1, DISPUTE_ERRORS.filesRequired)
      .max(MAX_DISPUTE_FILES, DISPUTE_ERRORS.filesTooMany),
    agreeToTerms: z
      .boolean()
      .refine((val) => val === true, DISPUTE_ERRORS.agreeToTerms),
  })
  .strict();

export type DisputeFormValues = z.infer<typeof DisputeFormSchema>;
