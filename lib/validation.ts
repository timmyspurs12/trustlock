import { z } from 'zod';

/**
 * Acceptance criteria are stored as structured JSONB so the AI agent can
 * evaluate each criterion individually (not one unstructured paragraph).
 */
export const acceptanceCriterionSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{2,32}$/, 'id must be a short lowercase slug (letters, numbers, dashes)'),
  description: z.string().min(5, 'criterion needs a few words').max(500),
  required: z.boolean().default(true),
});

export const createMilestoneSchema = z.object({
  title: z.string().min(3, 'title is too short').max(120),
  description: z.string().max(2000).default(''),
  amount: z
    .number()
    .positive('amount must be greater than 0')
    .max(1_000_000, 'amount is too large')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, 'amount must have at most 2 decimal places'),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter code (e.g. USD)')
    .default('USD'),
  acceptanceCriteria: z
    .array(acceptanceCriterionSchema)
    .min(1, 'add at least one acceptance criterion')
    .max(20),
});

/**
 * The authorize endpoint only accepts the two IDs it needs.
 * It never accepts an authorization ID, an amount, or a state from the client —
 * the server derives all of those from PayPal and the database.
 */
export const authorizeSchema = z.object({
  orderId: z.string().min(5).max(64),
  milestoneId: z.string().uuid('milestoneId must be a UUID'),
});

/**
 * The fund endpoint accepts NO meaningful client input. The amount is always
 * read from the stored milestone on the server. A strict empty object rejects
 * any smuggled fields (e.g. a client-side amount override).
 */
export const fundSchema = z.strictObject({});

/* ---------------- Phase 2 ---------------- */

/** Freelancer evidence submission (append-only: a new submission is a new row). */
export const evidenceSchema = z.object({
  deliverableUrl: z.string().url('deliverableUrl must be a valid URL').max(2000),
  notes: z.string().max(4000).default(''),
  evidenceUrls: z.array(z.string().url('evidenceUrls must be valid URLs').max(2000)).max(3).default([]),
});

/**
 * Release endpoint. The browser can never call PayPal capture directly.
 * - APPROVE (default): release funds (requires policy AUTO_RELEASE, or this
 *   flag when the policy requires a human).
 * - REQUEST_CHANGES / REJECT: the human overrides the AI recommendation.
 */
export const releaseSchema = z.object({
  reviewId: z.string().uuid().optional(),
  decision: z.enum(['APPROVE', 'REQUEST_CHANGES', 'REJECT']).default('APPROVE'),
  approvedAmount: z
    .number()
    .positive()
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, 'amount must have at most 2 decimal places')
    .optional(),
});

/** Reconciliation endpoint (polling fallback for async capture settlement). */
export const reconcileSchema = z.object({
  releaseId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
});
