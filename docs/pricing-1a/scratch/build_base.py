#!/usr/bin/env python3
"""產生 scratch 資料庫的基底 schema（00_base.sql）：最小化資料表＋從正式 migrations 原文擷取權限函式＋P3 快照種子資料。"""
import glob
import json
import re
from pathlib import Path

ROOT = Path("/app")
OUT = ROOT / "docs/pricing-1a/scratch/00_base.sql"
SNAP = json.load(open(ROOT / "docs/pricing-1a/scratch/p3_snapshot.json"))
FUNCS = [
    "user_has_role",
    "user_has_access_to_accommodation",
    "user_has_team_role",
    "user_has_any_team_role",
    "get_staff_module_permission",
    "staff_can_edit_module",
]


def latest_def(name: str) -> tuple[str, str]:
    pat = re.compile(rf"CREATE OR REPLACE FUNCTION public\.{name}\s*\(", re.S)
    hit = None
    for f in sorted(glob.glob(str(ROOT / "supabase/migrations/*.sql"))):
        src = Path(f).read_text()
        for m in pat.finditer(src):
            hit = (f, src, m.start())
    f, src, start = hit
    tag = re.search(r"AS\s+(\$[A-Za-z_]*\$)", src[start:]).group(1)
    body_start = src.index(tag, start) + len(tag)
    end = src.index(tag, body_start) + len(tag)
    end = src.index(";", end) + 1
    return Path(f).name, src[start:end]


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def arr(v, typ):
    if v is None:
        return "NULL"
    return "ARRAY[" + ",".join(q(x) for x in v) + f"]::{typ}[]" if v else f"ARRAY[]::{typ}[]"


lines = [
    "-- 由 build_base.py 產生；scratch 專用，勿套用到任何正式資料庫",
    "DO $$ BEGIN",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;",
    "END $$;",
    "CREATE SCHEMA IF NOT EXISTS auth;",
    "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$",
    "  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;",
    "GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;",
    "GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;",
    "CREATE TYPE public.app_role AS ENUM ('super_admin','hotel_admin','staff','admin','am','am_manager','closer','closer_manager','finance','franchise','franchise_external','franchise_internal','franchise_manager','kol','owner','scout','scout_manager','starlink','venue_manager','video');",
    "CREATE TYPE public.module_permission_level AS ENUM ('hidden','readonly','editable');",
    "CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text NOT NULL);",
    "CREATE TABLE public.team_member_profiles (user_id uuid PRIMARY KEY);",
    "CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, accommodation_id uuid, role public.app_role NOT NULL);",
    "CREATE TABLE public.staff_module_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, accommodation_id uuid NOT NULL, module_key text NOT NULL, permission_level public.module_permission_level NOT NULL DEFAULT 'readonly', UNIQUE (user_id, accommodation_id, module_key));",
    # accommodation_info_flags：與正式 20260521062912 段九相同欄位，policy 依 20260620051628 收緊後版本
    "CREATE TABLE public.accommodation_info_flags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE, has_franchise BOOLEAN DEFAULT false, has_starlink BOOLEAN DEFAULT false, updated_by UUID REFERENCES public.team_member_profiles(user_id), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(accommodation_id));",
    "ALTER TABLE public.accommodation_info_flags ENABLE ROW LEVEL SECURITY;",
    "CREATE TABLE public.accommodation_packages (id uuid PRIMARY KEY, accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id), numeric_code int, name text NOT NULL, enabled boolean NOT NULL DEFAULT true, sale_price NUMERIC(10,2) NOT NULL, original_price NUMERIC(10,2), tier_prices jsonb NOT NULL DEFAULT '{}'::jsonb, applicable_tiers TEXT[] NOT NULL DEFAULT ARRAY['weekday','friday_sunday','weekend']::text[], guest_count int, room_type_ids uuid[], excluded_date_ranges jsonb NOT NULL DEFAULT '[]'::jsonb, display_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());",
    "CREATE TABLE public.pricing_templates (id uuid PRIMARY KEY, accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id), template_name text NOT NULL, numeric_code int, price integer, weekday_price integer, peak_price integer, weekend_price integer, weekday_enabled boolean NOT NULL DEFAULT true, peak_enabled boolean NOT NULL DEFAULT true, weekend_enabled boolean NOT NULL DEFAULT true, default_package_id uuid REFERENCES public.accommodation_packages(id) ON DELETE SET NULL, available_rooms integer NOT NULL DEFAULT 1, season_segments jsonb NOT NULL DEFAULT '[]'::jsonb, room_overrides jsonb NOT NULL DEFAULT '[]'::jsonb, room_type_ids uuid[], created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());",
    "CREATE TABLE public.package_date_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid NOT NULL, package_id uuid NOT NULL, date date NOT NULL, sale_price numeric, original_price numeric, is_available boolean, updated_at timestamptz NOT NULL DEFAULT now());",
    "CREATE TABLE public.room_inventory_pricing (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_type_id uuid NOT NULL, date date NOT NULL, price numeric, available_rooms int, is_available boolean, pricing_template_id uuid, updated_at timestamptz NOT NULL DEFAULT now());",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;",
]
for fn in FUNCS:
    src_file, body = latest_def(fn)
    lines.append(f"-- {fn}：擷取自 supabase/migrations/{src_file}")
    lines.append(body)
lines += [
    'CREATE POLICY "accommodation_flags_select" ON public.accommodation_info_flags FOR SELECT USING (public.user_has_any_team_role(auth.uid()));',
    'CREATE POLICY "accommodation_flags_write" ON public.accommodation_info_flags FOR ALL TO authenticated USING (public.user_has_team_role(auth.uid(), \'super_admin\'::app_role) OR public.user_has_team_role(auth.uid(), \'admin\'::app_role));',
    "-- 種子：雲岫（P3 anon 快照）",
    "INSERT INTO public.accommodation_info VALUES ('7690a606-6bac-4cd5-a3e7-2fa754b318e8','雲岫海景渡假會館'),('00000000-0000-4000-8000-0000000000b1','測試館B（no_sync）'),('00000000-0000-4000-8000-0000000000c1','測試館C（package_original）');",
]
for p in SNAP["packages"]:
    lines.append(
        "INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ("
        + ",".join([q(p["id"]), q(p["accommodation_id"]), q(p["numeric_code"]), q(p["name"]), q(p["enabled"]), q(p["sale_price"]), q(p["original_price"]),
                    q(p["tier_prices"]), arr(p["applicable_tiers"], "text"), q(p["guest_count"]), arr(p["room_type_ids"], "uuid"), q(p["excluded_date_ranges"] or []), q(p["display_order"] or 0)])
        + ");"
    )
for t in SNAP["templates"]:
    lines.append(
        "INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ("
        + ",".join([q(t["id"]), q(t["accommodation_id"]), q(t["template_name"]), q(t["numeric_code"]), q(t["price"]), q(t["weekday_price"]), q(t["peak_price"]), q(t["weekend_price"]),
                    q(t["weekday_enabled"]), q(t["peak_enabled"]), q(t["weekend_enabled"]), q(t["default_package_id"]), q(t["available_rooms"]), q(t["season_segments"]), q(t["room_overrides"]), arr(t["room_type_ids"], "uuid")])
        + ");"
    )
for d in SNAP["package_date_prices"]:
    lines.append(
        "INSERT INTO public.package_date_prices (id,accommodation_id,package_id,date,sale_price,original_price,is_available) VALUES ("
        + ",".join([q(d["id"]), q(d["accommodation_id"]), q(d["package_id"]), q(d["date"]), q(d["sale_price"]), q(d["original_price"]), q(d["is_available"])])
        + ");"
    )
lines += [
    "-- 種子：測試館 B（no_sync，flags 列存在但 new_price_ui_enabled=true 由測試設定）與 C（package_original，一方案對應兩專案）",
    "INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count) VALUES"
    " ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000b1',2001,'B方案',true,5000,8000,'{}'::jsonb,ARRAY['weekday'],2),"
    " ('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c1',3001,'C方案',false,6000,9000,'{}'::jsonb,ARRAY['weekday'],4);",
    "INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,default_package_id) VALUES"
    " ('00000000-0000-4000-8000-0000000000b3','00000000-0000-4000-8000-0000000000b1','B專案',201,8000,8000,'00000000-0000-4000-8000-0000000000b2'),"
    " ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000c1','C專案1',301,9000,9000,'00000000-0000-4000-8000-0000000000c2'),"
    " ('00000000-0000-4000-8000-0000000000c4','00000000-0000-4000-8000-0000000000c1','C專案2',302,9000,9000,'00000000-0000-4000-8000-0000000000c2'),"
    " ('00000000-0000-4000-8000-0000000000c5','00000000-0000-4000-8000-0000000000c1','C無關專案',303,7777,7777,NULL);",
    "INSERT INTO public.room_inventory_pricing (room_type_id,date,price,available_rooms,is_available) SELECT '54631347-095d-45c0-a066-e5e39211668e', d::date, 41000, 1, true FROM generate_series('2026-10-14'::date,'2027-01-11'::date,'1 day') d;",
    "INSERT INTO public.accommodation_info_flags (accommodation_id, has_franchise) VALUES ('00000000-0000-4000-8000-0000000000b1', true);",
    "-- 使用者：U_SUPER(super_admin)、U_HA(雲岫 hotel_admin)、U_STAFF_RO(雲岫 staff room_price=readonly)、U_OTHER(測試館B hotel_admin)",
    "INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES"
    " ('11111111-1111-4111-8111-111111111111', NULL, 'super_admin'),"
    " ('22222222-2222-4222-8222-222222222222', '7690a606-6bac-4cd5-a3e7-2fa754b318e8', 'hotel_admin'),"
    " ('33333333-3333-4333-8333-333333333333', '7690a606-6bac-4cd5-a3e7-2fa754b318e8', 'staff'),"
    " ('44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-0000000000b1', 'hotel_admin');",
    "INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level) VALUES ('33333333-3333-4333-8333-333333333333','7690a606-6bac-4cd5-a3e7-2fa754b318e8','room_price','readonly');",
]
OUT.write_text("\n".join(lines) + "\n")
print(f"wrote {OUT}")
