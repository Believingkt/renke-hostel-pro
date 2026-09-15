-- 創建專用的 extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- 將 uuid-ossp 擴展移到 extensions schema
-- 注意：某些擴展可能無法直接移動，需要重新安裝
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 確保 public schema 的函數仍可以使用 uuid 函數
-- 通過設置 search_path 或使用完整路徑

-- 授予必要的權限
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 更新 search_path 以包含 extensions schema
ALTER DATABASE postgres SET search_path TO public, extensions;