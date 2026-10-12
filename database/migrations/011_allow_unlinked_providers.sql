-- Migration: 011_allow_unlinked_providers.sql
-- Description: Providers may exist before they are linked to a user account.

ALTER TABLE providers
  ALTER COLUMN user_id DROP NOT NULL;
