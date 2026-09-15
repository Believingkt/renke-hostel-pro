CREATE OR REPLACE FUNCTION public.validate_short_url_alias()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alias_text TEXT;
BEGIN
  alias_text := NEW.short_url_alias;

  -- Empty / NULL is allowed (alias is optional)
  IF alias_text IS NULL OR alias_text = '' THEN
    RETURN NEW;
  END IF;

  -- Reject slashes, dots, spaces, backslashes, and other path-breaking characters
  IF alias_text ~ '[\/\\\.\s:?#@%&=+]' THEN
    RAISE EXCEPTION '網址路徑不可包含斜線、點、空白或特殊符號（/, \, ., 空白, :, ?, #, @, %%, &, =, +）'
      USING ERRCODE = '22023';
  END IF;

  -- Reject protocol prefixes (case-insensitive)
  IF alias_text ~* '^(https?|ftp|file|javascript|data|vbscript|mailto):' THEN
    RAISE EXCEPTION '網址路徑不可包含協議字串（如 http://、https://）'
      USING ERRCODE = '22023';
  END IF;

  -- Reject leading double slashes or protocol-relative URLs
  IF alias_text LIKE '//%' OR alias_text LIKE '\\%' THEN
    RAISE EXCEPTION '網址路徑不可以斜線開頭'
      USING ERRCODE = '22023';
  END IF;

  -- Enforce final format: lowercase letters, numbers, hyphens (3-30 chars, no leading/trailing hyphen)
  IF NOT (alias_text ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$') THEN
    RAISE EXCEPTION '網址路徑格式錯誤：請使用小寫英文、數字與連字號，長度 3-30 字元，且不可以連字號開頭或結尾'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_short_url_alias_trigger ON public.accommodation_info;

CREATE TRIGGER validate_short_url_alias_trigger
BEFORE INSERT OR UPDATE OF short_url_alias ON public.accommodation_info
FOR EACH ROW
EXECUTE FUNCTION public.validate_short_url_alias();