-- 本機最小副本：只建立函式與 trigger 會讀寫的表與欄位（型別依各 migration 原文）
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);

-- 20251111181019 建表；lock_whole_building 來自 20260623075826；room_type_id 為後續新增
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id),
  room_type_id uuid,
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  guest_count integer NOT NULL DEFAULT 2,
  guest_name text,
  order_status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'unpaid',
  total_price integer NOT NULL,
  final_price integer NOT NULL,
  paid_amount integer DEFAULT 0,
  notes text,
  lock_whole_building boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 20251024123201（只留函式用到的欄位）
CREATE TABLE public.room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name text NOT NULL
);

-- 20260506062748
CREATE TABLE public.room_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (room_type_id, unit_number)
);

-- 20251127113431 + available_rooms(20260413134506)、room_type_ids(20260610035256)、valid_from/until(20260610050231)、excluded_dates(20260610053012)
CREATE TABLE public.pricing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id),
  template_name text NOT NULL,
  room_type_id uuid,
  room_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  available_rooms integer NOT NULL DEFAULT 1,
  valid_from date,
  valid_until date,
  excluded_dates jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- 20251127112855 + pricing_template_id(20260428061322)
CREATE TABLE public.room_inventory_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  date date NOT NULL,
  available_rooms integer NOT NULL DEFAULT 0,
  is_available boolean DEFAULT true,
  pricing_template_id uuid NULL
);

-- 20260505033213
CREATE TABLE public.pricing_template_availability (
  template_id uuid NOT NULL REFERENCES public.pricing_templates(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (template_id, date)
);

-- 20260407065335 + room_unit_id(20260506063503)
CREATE TABLE public.order_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id),
  quantity integer NOT NULL DEFAULT 1,
  room_price integer NOT NULL DEFAULT 0,
  template_id uuid REFERENCES public.pricing_templates(id),
  template_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  room_unit_id uuid REFERENCES public.room_units(id) ON DELETE SET NULL
);

-- 20260817152435（只留函式用到的欄位）
CREATE TABLE public.amenity_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  name text NOT NULL,
  total_quantity integer NOT NULL DEFAULT 0 CHECK (total_quantity >= 0)
);
CREATE TABLE public.order_amenity_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amenity_item_id uuid NOT NULL REFERENCES public.amenity_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  UNIQUE (order_id, amenity_item_id)
);

-- 20260519115553（只留本批用到的欄位）
CREATE TABLE public.owlting_email_orders_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  obe_number text,
  ingest_outcome text
);
