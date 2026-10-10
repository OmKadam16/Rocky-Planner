-- Onboarding gate: profiles.onboarded_at is set when the user finishes
-- (or skips through) the /setup wizard. NULL = show /setup after sign-in.
-- Run this file in the Supabase SQL editor (Dashboard > SQL). Do NOT edit
-- 0001_core_schema.sql or 0002_devices_commands.sql (already applied live).

alter table public.profiles
  add column if not exists onboarded_at timestamptz;
