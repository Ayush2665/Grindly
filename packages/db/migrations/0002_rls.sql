-- Row level security. Written for Supabase: auth.uid() is the signed-in user.
-- Browser clients use the "authenticated" role and can only READ their own rows.
-- Every write goes through the server, which uses the service role and bypasses RLS.

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_devices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_days      ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_samples     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;

-- ids of the signed-in user's contracts. SECURITY DEFINER so policies on contracts can use it
-- without triggering themselves (a policy that selects from its own table recurses forever).
CREATE FUNCTION public.my_contract_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT id FROM contracts WHERE user_id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.my_contract_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_contract_ids() TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
GRANT SELECT ON users, watch_devices, contracts, contract_days, health_samples, workouts,
  ledger_accounts, ledger_entries, payments, friend_links TO authenticated;

CREATE POLICY own_user      ON users          FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY own_devices   ON watch_devices  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_contracts ON contracts      FOR SELECT TO authenticated USING (user_id = auth.uid());
-- a friend can see the other half of a No Risk pair
CREATE POLICY friend_contracts ON contracts   FOR SELECT TO authenticated USING (
  friend_contract_id IN (SELECT public.my_contract_ids()));
CREATE POLICY own_days      ON contract_days  FOR SELECT TO authenticated USING (
  contract_id IN (SELECT public.my_contract_ids()));
CREATE POLICY own_samples   ON health_samples FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_workouts  ON workouts       FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_payments  ON payments       FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_friends   ON friend_links   FOR SELECT TO authenticated USING (inviter_id = auth.uid() OR invitee_id = auth.uid());
-- a user sees their own wallet account and the escrow account of their own contracts
CREATE POLICY own_accounts  ON ledger_accounts FOR SELECT TO authenticated USING (
  (kind = 'wallet' AND owner = auth.uid()::text)
  OR (kind = 'escrow' AND owner IN (SELECT id::text FROM public.my_contract_ids() AS id)));
CREATE POLICY own_entries   ON ledger_entries FOR SELECT TO authenticated USING (
  account_id IN (SELECT id FROM ledger_accounts));
-- pairing_codes, webhook_events, ledger_transactions, audit_log: no policy = no browser access at all.
