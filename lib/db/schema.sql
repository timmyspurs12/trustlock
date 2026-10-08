-- TrustLock schema (PostgreSQL) — Phase 2
-- Escrow-like milestone protection powered by PayPal authorization.
-- Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  -- Structured so the AI agent can evaluate each criterion individually.
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Deterministic release policy (client-configurable, server-enforced).
  policy JSONB NOT NULL DEFAULT '{"autoRelease":true,"minimumConfidence":0.90,"maximumAutoReleaseAmount":500}'::jsonb,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 2: extend the state machine (idempotent constraint swap).
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_status_check;
ALTER TABLE milestones ADD CONSTRAINT milestones_status_check CHECK (status IN (
  'DRAFT','FUNDING_PENDING','AUTHORIZED','EVIDENCE_SUBMITTED','AI_REVIEW','RELEASE_APPROVED',
  'HUMAN_REVIEW','REQUEST_CHANGES','CAPTURE_PENDING','PAID','PAID_PARTIAL','CAPTURE_FAILED',
  'CANCELLED','VOIDED','AUTHORIZATION_EXPIRING'
));

CREATE TABLE IF NOT EXISTS paypal_payments (
  id UUID PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  -- PayPal IDs. order_id is 1:1 with a funding attempt; authorization_id is 1:1
  -- with the held authorization. Both UNIQUE so a payment can never be double-bound.
  order_id TEXT NOT NULL UNIQUE,
  authorization_id TEXT UNIQUE,
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  authorized_amount NUMERIC(12,2) NOT NULL,
  captured_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Last PayPal-side state we observed (APPROVED, CREATED, CAPTURED, VOIDED, ...).
  paypal_status TEXT,
  trustlock_status TEXT NOT NULL DEFAULT 'FUNDING_PENDING',
  authorization_expires_at TIMESTAMPTZ,
  last_paypal_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE paypal_payments DROP CONSTRAINT IF EXISTS paypal_payments_trustlock_status_check;
ALTER TABLE paypal_payments ADD CONSTRAINT paypal_payments_trustlock_status_check CHECK (trustlock_status IN (
  'FUNDING_PENDING','AUTHORIZED','RELEASE_APPROVED','CAPTURE_PENDING','PAID','PAID_PARTIAL','CAPTURE_FAILED','VOIDED'
));

-- Append-only audit trail for AI agent actions and system events.
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  actor TEXT NOT NULL, -- 'client' | 'system' | 'agent'
  input_reference TEXT,
  decision TEXT,
  confidence NUMERIC(4,3),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evidence submissions (append-only: a new submission is a new row, never an overwrite).
CREATE TABLE IF NOT EXISTS milestone_evidence (
  id UUID PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  deliverable_url TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL DEFAULT 'freelancer',
  metadata JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI verification reviews (append-only: historical decisions are immutable).
CREATE TABLE IF NOT EXISTS ai_reviews (
  id UUID PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES milestone_evidence(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('RELEASE','PARTIAL_RELEASE','REQUEST_CHANGES')),
  confidence NUMERIC(4,3) NOT NULL,
  criteria_results JSONB NOT NULL,
  recommended_amount NUMERIC(12,2) NOT NULL,
  rationale TEXT NOT NULL,
  fetched_evidence JSONB,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('AUTO_RELEASE','HUMAN_REVIEW','REQUEST_CHANGES','REJECTED')),
  policy_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payment releases (one per AI review; updated by the reconciler — NOT append-only).
CREATE TABLE IF NOT EXISTS payment_releases (
  id UUID PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES ai_reviews(id),
  authorization_id TEXT NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL,
  capture_id TEXT,
  capture_status TEXT,
  state TEXT NOT NULL CHECK (state IN ('CAPTURE_PENDING','PAID','PAID_PARTIAL','CAPTURE_FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, review_id)
);

-- Append-only enforcement for audit + evidence + reviews.
CREATE OR REPLACE FUNCTION trustlock_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '%.% is append-only (% on row %)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, NEW.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_actions_immutable ON agent_actions;
CREATE TRIGGER agent_actions_immutable
  BEFORE UPDATE OR DELETE ON agent_actions
  FOR EACH ROW EXECUTE FUNCTION trustlock_append_only();

DROP TRIGGER IF EXISTS milestone_evidence_immutable ON milestone_evidence;
CREATE TRIGGER milestone_evidence_immutable
  BEFORE UPDATE OR DELETE ON milestone_evidence
  FOR EACH ROW EXECUTE FUNCTION trustlock_append_only();

DROP TRIGGER IF EXISTS ai_reviews_immutable ON ai_reviews;
CREATE TRIGGER ai_reviews_immutable
  BEFORE UPDATE OR DELETE ON ai_reviews
  FOR EACH ROW EXECUTE FUNCTION trustlock_append_only();

CREATE INDEX IF NOT EXISTS paypal_payments_milestone_idx ON paypal_payments(milestone_id);
CREATE INDEX IF NOT EXISTS agent_actions_milestone_idx ON agent_actions(milestone_id, created_at);
CREATE INDEX IF NOT EXISTS milestone_evidence_milestone_idx ON milestone_evidence(milestone_id, submitted_at);
CREATE INDEX IF NOT EXISTS ai_reviews_milestone_idx ON ai_reviews(milestone_id, created_at);
CREATE INDEX IF NOT EXISTS payment_releases_milestone_idx ON payment_releases(milestone_id);
