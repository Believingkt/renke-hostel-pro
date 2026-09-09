-- Phase A：短網址（short_url_alias）唯一性保護
-- canonical 網址以 alias 為基礎，重複 alias 會導致解析錯館與重複 canonical。
-- 目前資料無重複（已查核），此索引為純保護性、可回滾（DROP INDEX）。
CREATE UNIQUE INDEX IF NOT EXISTS accommodation_info_short_url_alias_unique
  ON public.accommodation_info (lower(btrim(short_url_alias)))
  WHERE short_url_alias IS NOT NULL AND btrim(short_url_alias) <> '';
