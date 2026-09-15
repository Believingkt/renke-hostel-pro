ALTER TABLE public.accommodation_api_keys
  ADD COLUMN is_read_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.accommodation_api_keys.is_read_only IS
  '為 true 時，該金鑰只允許 GET 查詢，任何寫入方法一律 403';