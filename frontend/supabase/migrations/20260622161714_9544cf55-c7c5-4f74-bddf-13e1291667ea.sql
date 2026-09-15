ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS child_age_rules jsonb NOT NULL DEFAULT '{
    "tiers": {
      "infant":  { "label": "嬰兒", "min_age": 0, "max_age": 2,  "fee_per_night": 0,   "max_count": null, "allowed": true, "counts_toward_capacity": false },
      "toddler": { "label": "幼兒", "min_age": 3, "max_age": 6,  "fee_per_night": 500, "max_count": 2,    "allowed": true, "counts_toward_capacity": true },
      "child":   { "label": "兒童", "min_age": 7, "max_age": 12, "fee_per_night": 800, "max_count": 2,    "allowed": true, "counts_toward_capacity": true }
    },
    "note": ""
  }'::jsonb;

ALTER TABLE public.accommodation_packages
  ADD COLUMN IF NOT EXISTS child_age_rules_override jsonb;