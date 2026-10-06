-- Grindly schema. All money is whole paise (bigint). Rules live here as constraints and triggers
-- so no bug in app code can break them.

-- ---------- users and devices ----------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',   -- IANA name; day boundaries use this
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE watch_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  token_hash    text NOT NULL UNIQUE,                   -- only the hash is stored, never the token
  product_type  text,                                   -- e.g. Watch7,3, filled from the first samples
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON watch_devices (user_id);

CREATE TABLE pairing_codes (
  code          text PRIMARY KEY CHECK (code ~ '^[0-9]{6}$'),
  user_id       uuid NOT NULL REFERENCES users(id),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz
);

-- ---------- contracts ----------
CREATE TABLE contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id),
  goal_type      text NOT NULL CHECK (goal_type IN ('STEPS_10K', 'GYM_WORKOUT')),
  mode           text NOT NULL CHECK (mode IN ('STAKE', 'NO_RISK')),
  state          text NOT NULL DEFAULT 'DRAFT'
                 CHECK (state IN ('DRAFT','PENDING_FRIEND','AWAITING_PAYMENT','ACTIVE','SETTLED','CANCELLED')),
  window_days    int  NOT NULL CHECK (window_days BETWEEN 1 AND 90),
  required_days  int  NOT NULL,
  stake_paise    bigint NOT NULL CHECK (stake_paise > 0),
  unit_paise     bigint NOT NULL CHECK (unit_paise > 0),
  timezone       text NOT NULL,
  start_date     date,
  cohort_id      text,                                  -- stake mode: e.g. 2026-10:STEPS_10K
  friend_contract_id uuid REFERENCES contracts(id),     -- no risk mode: the linked contract
  verified_units int  NOT NULL DEFAULT 0,
  forfeited_units int NOT NULL DEFAULT 0,
  days_closed    int  NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- rest days are 10% of the window, rounded down
  CONSTRAINT required_matches_window CHECK (required_days = window_days - (window_days / 10)),
  -- the stake must split into whole units of whole paise
  CONSTRAINT stake_is_whole_units CHECK (stake_paise = unit_paise * required_days),
  CONSTRAINT units_add_up CHECK (verified_units + forfeited_units <= required_days),
  CONSTRAINT days_in_window CHECK (days_closed BETWEEN 0 AND window_days),
  CONSTRAINT no_risk_needs_link CHECK (mode = 'STAKE' OR friend_contract_id IS NOT NULL OR state IN ('DRAFT','CANCELLED'))
);
CREATE INDEX ON contracts (user_id);
CREATE INDEX ON contracts (state);

-- a contract's state may only move along the allowed edges (same table as packages/domain)
CREATE FUNCTION contracts_check_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  IF (OLD.state, NEW.state) IN (
       ('DRAFT','AWAITING_PAYMENT'), ('DRAFT','PENDING_FRIEND'), ('DRAFT','CANCELLED'),
       ('PENDING_FRIEND','AWAITING_PAYMENT'), ('PENDING_FRIEND','CANCELLED'),
       ('AWAITING_PAYMENT','ACTIVE'), ('AWAITING_PAYMENT','CANCELLED'),
       ('ACTIVE','SETTLED')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'illegal contract transition % -> %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER contracts_state_guard BEFORE UPDATE OF state ON contracts
  FOR EACH ROW EXECUTE FUNCTION contracts_check_state();

-- units and days only move forward
CREATE FUNCTION contracts_progress_forward() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_units < OLD.verified_units OR NEW.forfeited_units < OLD.forfeited_units OR NEW.days_closed < OLD.days_closed THEN
    RAISE EXCEPTION 'contract progress can not go backwards' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contracts_progress_guard BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION contracts_progress_forward();

CREATE TABLE contract_days (
  contract_id   uuid NOT NULL REFERENCES contracts(id),
  local_date    date NOT NULL,
  verified      boolean NOT NULL DEFAULT false,
  steps_total   int,
  workout_id    text,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,     -- verdict, rejections and flags
  settled_at    timestamptz,
  PRIMARY KEY (contract_id, local_date)
);

-- ---------- raw Watch data (idempotent by hk_uuid) ----------
CREATE TABLE health_samples (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hk_uuid       text NOT NULL UNIQUE,
  device_id     uuid NOT NULL REFERENCES watch_devices(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  kind          text NOT NULL CHECK (kind IN ('steps','heart_rate')),
  start_at      timestamptz NOT NULL,
  end_at        timestamptz NOT NULL CHECK (end_at >= start_at),
  value         double precision NOT NULL CHECK (value >= 0),
  product_type  text NOT NULL,
  was_user_entered boolean NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON health_samples (user_id, start_at);

CREATE TABLE workouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hk_uuid       text NOT NULL UNIQUE,
  device_id     uuid NOT NULL REFERENCES watch_devices(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  activity_type text NOT NULL,
  start_at      timestamptz NOT NULL,
  end_at        timestamptz NOT NULL CHECK (end_at > start_at),
  avg_heart_rate double precision,
  product_type  text NOT NULL,
  was_user_entered boolean NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON workouts (user_id, start_at);

-- ---------- ledger: double entry, append only ----------
CREATE TABLE ledger_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('gateway_clearing','wallet','escrow','pool','yield_source','withdrawn')),
  owner         text NOT NULL,                           -- user id, contract id, cohort id, or '-'
  balance_paise bigint NOT NULL DEFAULT 0,               -- kept in step by a trigger
  allow_negative boolean NOT NULL GENERATED ALWAYS AS (kind IN ('gateway_clearing','yield_source')) STORED,
  UNIQUE (kind, owner)
);

CREATE TABLE ledger_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  text NOT NULL UNIQUE,                 -- same key twice = same transaction, applied once
  description      text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
  account_id     uuid NOT NULL REFERENCES ledger_accounts(id),
  amount_paise   bigint NOT NULL CHECK (amount_paise <> 0)
);
CREATE INDEX ON ledger_entries (transaction_id);
CREATE INDEX ON ledger_entries (account_id);

-- 1) every entry updates its account balance (the row lock also serialises concurrent writers)
CREATE FUNCTION ledger_apply_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ledger_accounts SET balance_paise = balance_paise + NEW.amount_paise WHERE id = NEW.account_id;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_entries_apply AFTER INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_entry();

-- 2) at commit time each transaction must sum to zero and have at least two entries
CREATE FUNCTION ledger_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s numeric; n int;
BEGIN
  SELECT COALESCE(SUM(amount_paise), 0), COUNT(*) INTO s, n FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF s <> 0 THEN RAISE EXCEPTION 'ledger transaction % sums to %, must be 0', NEW.transaction_id, s USING ERRCODE = 'check_violation'; END IF;
  IF n < 2 THEN RAISE EXCEPTION 'ledger transaction % needs at least two entries', NEW.transaction_id USING ERRCODE = 'check_violation'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();

-- 3) at commit time no account (except the two outside sources) may be below zero
CREATE FUNCTION ledger_check_not_negative() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.balance_paise < 0 AND NOT NEW.allow_negative THEN
    RAISE EXCEPTION 'account % (%) would go negative: %', NEW.id, NEW.kind, NEW.balance_paise USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_accounts_not_negative AFTER UPDATE OF balance_paise ON ledger_accounts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_not_negative();

-- balances may only change through ledger entries
CREATE FUNCTION ledger_guard_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.balance_paise <> OLD.balance_paise AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'balances change only through ledger entries' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind <> OLD.kind OR NEW.owner <> OLD.owner THEN
    RAISE EXCEPTION 'account identity is fixed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_accounts_guard BEFORE UPDATE ON ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION ledger_guard_balance();

-- 4) append only: no edits, no deletes, no truncate
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER ledger_tx_append_only BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER ledger_tx_no_truncate BEFORE TRUNCATE ON ledger_transactions FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- ---------- payments and webhooks ----------
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  contract_id        uuid NOT NULL REFERENCES contracts(id),
  razorpay_order_id  text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  amount_paise       bigint NOT NULL CHECK (amount_paise > 0),
  status             text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','CAPTURED','FAILED','REFUNDED')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_events (
  event_id     text PRIMARY KEY,                         -- the gateway's id; a replay hits this key
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL
);

-- ---------- friends ----------
CREATE TABLE friend_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    uuid NOT NULL REFERENCES users(id),
  invitee_id    uuid REFERENCES users(id),
  invitee_email text NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','EXPIRED')),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- audit log (append only, no tokens or personal data in details) ----------
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,                              -- user id, 'system' or 'webhook'
  action      text NOT NULL,                              -- e.g. money.move, device.link, device.revoke
  subject     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
