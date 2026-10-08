-- TrustLock Phase 1 schema (PostgreSQL)
-- Escrow-like milestone protection powered by PayPal authorization.

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  -- Structured so the Phase 2 AI agent can evaluate each criterion individually.
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Phase 1 state machine (server-controlled only):
  --   DRAFT -> FUNDING_PENDING -> AUTHORIZED
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'FUNDING_PENDING', 'AUTHORIZED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  -- TrustLock-side state (server-controlled):
  --   FUNDING_PENDING -> AUTHORIZED | VOIDED | CAPTURED (later phases)
  trustlock_status TEXT NOT NULL DEFAULT 'FUNDING_PENDING'
    CHECK (trustlock_status IN ('FUNDING_PENDING', 'AUTHORIZED', 'VOIDED', 'CAPTURED')),
  authorization_expires_at TIMESTAMPTZ,
  last_paypal_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit trail for AI agent actions (Phase 2+) and system events.
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  actor TEXT NOT NULL, -- 'client' | 'system' | 'agent' (Phase 2)
  input_reference TEXT,
  decision TEXT,
  confidence NUMERIC(4,3),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- agent_actions is append-only: UPDATE and DELETE are rejected by trigger.
CREATE OR REPLACE FUNCTION trustlock_agent_actions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'agent_actions is append-only (% on row %)', TG_OP, NEW.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_actions_immutable ON agent_actions;
CREATE TRIGGER agent_actions_immutable
  BEFORE UPDATE OR DELETE ON agent_actions
  FOR EACH ROW EXECUTE FUNCTION trustlock_agent_actions_immutable();

CREATE INDEX IF NOT EXISTS paypal_payments_milestone_idx ON paypal_payments(milestone_id);
CREATE INDEX IF NOT EXISTS agent_actions_milestone_idx ON agent_actions(milestone_id, created_at);
