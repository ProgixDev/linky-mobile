-- Adds 'password_change' to otp_codes.purpose (client 2026-08-05) — step-up
-- verification before Profil > Mot de passe applies a new password. Mirrors
-- 'add_phone' / 'add_email' : the OTP row is user_id-scoped, so only the
-- session that requested it can consume it (see phone-add-request/confirm
-- for the same pattern).
alter table public.otp_codes drop constraint otp_codes_purpose_check;
alter table public.otp_codes add constraint otp_codes_purpose_check
  check (purpose = any (array['signin', 'add_phone', 'add_email', 'password_change']));
