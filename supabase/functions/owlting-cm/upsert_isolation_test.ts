// Contract tests for `bulk_upsert_room_inventory_pricing`:
//   - Price push (template_id NOT NULL, only `price`) must NOT touch
//     `available_rooms` / `is_available`. New rows leave them NULL.
//   - Avail push (template_id NULL, only `available_rooms` / `is_available`)
//     must NOT touch `price`.
//   - Same (room_type_id, date [, pricing_template_id]) key must never
//     produce duplicate rows.
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env, plus
// TEST_ROOM_TYPE_ID + TEST_PRICING_TEMPLATE_ID. Skips otherwise.
//
// Run with:
//   deno test --allow-net --allow-env supabase/functions/owlting-cm/upsert_isolation_test.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const roomTypeId = Deno.env.get("TEST_ROOM_TYPE_ID");
const templateId = Deno.env.get("TEST_PRICING_TEMPLATE_ID");
const TEST_DATE = "2030-01-15";

Deno.test({
  name: "bulk_upsert_room_inventory_pricing isolates price vs availability writes",
  ignore: !url || !key || !roomTypeId || !templateId,
  fn: async () => {
    const sb = createClient(url!, key!);

    const cleanup = () => sb.from("room_inventory_pricing")
      .delete().eq("room_type_id", roomTypeId!).eq("date", TEST_DATE);
    await cleanup();

    try {
      // 1. Price-only push (template-specific row)
      let { error } = await sb.rpc("bulk_upsert_room_inventory_pricing", {
        p_rows: [{ room_type_id: roomTypeId, date: TEST_DATE,
          pricing_template_id: templateId, price: 7777 }],
      });
      assertEquals(error, null);

      let { data: row } = await sb.from("room_inventory_pricing")
        .select("price, available_rooms, is_available")
        .eq("room_type_id", roomTypeId!).eq("date", TEST_DATE)
        .eq("pricing_template_id", templateId!).single();
      assertEquals(row?.price, 7777);
      assertEquals(row?.available_rooms, null, "price push must leave available_rooms NULL");
      assertEquals(row?.is_available, null, "price push must leave is_available NULL");

      // 2. Avail-only push (inventory row, template_id NULL)
      ({ error } = await sb.rpc("bulk_upsert_room_inventory_pricing", {
        p_rows: [{ room_type_id: roomTypeId, date: TEST_DATE,
          pricing_template_id: null, available_rooms: 4, is_available: true }],
      }));
      assertEquals(error, null);

      // Inventory row reflects the avail push
      const { data: invRow } = await sb.from("room_inventory_pricing")
        .select("available_rooms, is_available")
        .eq("room_type_id", roomTypeId!).eq("date", TEST_DATE)
        .is("pricing_template_id", null).single();
      assertEquals(invRow?.available_rooms, 4);
      assertEquals(invRow?.is_available, true);

      // Price-row untouched
      ({ data: row } = await sb.from("room_inventory_pricing")
        .select("price, available_rooms, is_available")
        .eq("room_type_id", roomTypeId!).eq("date", TEST_DATE)
        .eq("pricing_template_id", templateId!).single());
      assertEquals(row?.price, 7777, "avail push must not change price");
      assertEquals(row?.available_rooms, null, "avail push must not write template-specific avail");

      // 3. Second price push only changes price
      ({ error } = await sb.rpc("bulk_upsert_room_inventory_pricing", {
        p_rows: [{ room_type_id: roomTypeId, date: TEST_DATE,
          pricing_template_id: templateId, price: 8888 }],
      }));
      assertEquals(error, null);
      ({ data: row } = await sb.from("room_inventory_pricing")
        .select("price, available_rooms").eq("room_type_id", roomTypeId!)
        .eq("date", TEST_DATE).eq("pricing_template_id", templateId!).single());
      assertEquals(row?.price, 8888);
      assertEquals(row?.available_rooms, null);

      // 4. No duplicates for the same key
      const { data: all } = await sb.from("room_inventory_pricing")
        .select("id, pricing_template_id")
        .eq("room_type_id", roomTypeId!).eq("date", TEST_DATE);
      const groups = new Map<string, number>();
      for (const r of all ?? []) {
        const k = String(r.pricing_template_id);
        groups.set(k, (groups.get(k) ?? 0) + 1);
      }
      for (const [k, c] of groups) assert(c === 1, `duplicate rows for key ${k}: ${c}`);
    } finally {
      await cleanup();
    }
  },
});
