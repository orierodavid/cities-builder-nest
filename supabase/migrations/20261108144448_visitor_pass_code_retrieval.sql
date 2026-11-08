-- Store resident visitor codes in authenticated ciphertext so only the API can
-- decrypt them for the pass owner. Keep the one-way hash for gate verification.
BEGIN;
ALTER TABLE public.visitor_passes
  ADD COLUMN IF NOT EXISTS access_code_ciphertext text;
COMMENT ON COLUMN public.visitor_passes.access_code_ciphertext IS
  'AES-256-GCM encrypted visitor access code; decrypt only in the authenticated API for the owning resident.';
COMMIT;
