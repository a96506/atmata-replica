-- F-010: Add separate EN/AR name columns to accounts so the CoA page can render
-- them split. The existing `name` column (EN+AR concatenated by the seed) is kept
-- for backward compat. name_en is backfilled from `name`; name_ar is left NULL for
-- a manual data pass (no programmatic split attempted).

ALTER TABLE public.accounts
  ADD COLUMN name_en text,
  ADD COLUMN name_ar text;

UPDATE public.accounts SET name_en = name WHERE name_en IS NULL;
