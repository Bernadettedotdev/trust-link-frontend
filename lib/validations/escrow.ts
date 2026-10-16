/**
 * Zod schema for the "create escrow link" form.
 *
 * Validation is intentionally strict: text fields are trimmed and bounded, and
 * the price must be a plain decimal amount inside a sane range. Scientific
 * notation, dust and overflowing amounts are rejected because the escrow
 * service only accepts fixed-precision USDC strings.
 */
import { z } from "zod";

export const shippingOptions = ["Same day", "1-3 days", "1 week", "Custom"] as const;

export const ESCROW_LIMITS = {
  /** Maximum length of the item name, in characters. */
  itemNameMaxLength: 200,
  /** Maximum length of the item description, in characters. */
  descriptionMaxLength: 2000,
  /** Maximum number of decimal places accepted in the price. */
  priceMaxDecimals: 6,
  /** Largest accepted price — guards against overflow. */
  priceMaxUSDC: 1_000_000,
} as const;

/**
 * Plain decimal only: integer part, optional fractional part of at most
 * `priceMaxDecimals` digits. Rejects signs, exponents (`1e1000`), thousands
 * separators, hex and any other `Number()` coercion trick.
 */
const PRICE_REGEX = new RegExp(
  `^\\d+(?:\\.\\d{1,${ESCROW_LIMITS.priceMaxDecimals}})?$`
);

export const EscrowCreateSchema = z.object({
  // The `error` option customises zod's built-in "expected string, received
  // undefined" for a *missing* field; the `.min(1)` covers an empty string.
  itemName: z
    .string({ error: "Item name is required." })
    .trim()
    .min(1, "Item name is required.")
    .max(
      ESCROW_LIMITS.itemNameMaxLength,
      `Item name must not exceed ${ESCROW_LIMITS.itemNameMaxLength} characters.`
    ),
  priceUSDC: z
    .string({ error: "Price is required." })
    .trim()
    .min(1, "Price is required.")
    .refine(
      (val) => PRICE_REGEX.test(val),
      `Price must be a positive number with up to ${ESCROW_LIMITS.priceMaxDecimals} decimal places.`
    )
    .refine(
      (val) => {
        const num = Number(val);
        return !Number.isNaN(num) && num > 0 && num <= ESCROW_LIMITS.priceMaxUSDC;
      },
      `Price must be a positive number no greater than ${ESCROW_LIMITS.priceMaxUSDC} USDC.`
    ),
  description: z
    .string({ error: "Description is required." })
    .trim()
    .min(1, "Description is required.")
    .max(
      ESCROW_LIMITS.descriptionMaxLength,
      `Description must not exceed ${ESCROW_LIMITS.descriptionMaxLength} characters.`
    ),
  shippingWindow: z.enum(shippingOptions, {
    error: "Please select a valid shipping window.",
  }),
}).strict();

export type EscrowCreateValues = z.infer<typeof EscrowCreateSchema>;
export type ShippingWindow = z.infer<typeof EscrowCreateSchema.shape.shippingWindow>;
