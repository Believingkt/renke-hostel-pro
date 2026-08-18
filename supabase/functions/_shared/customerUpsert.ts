// 共用：以 email / phone 比對 customers，既有就更新、無則新增，並回寫 orders.customer_id。
// deno-lint-ignore-file no-explicit-any

const PLACEHOLDER_PHONES = new Set(["0000000000", "0", "-", "待補"]);

export function normalizePhone(p: string | null | undefined): string {
  const s = (p ?? "").replace(/[^\d+]/g, "").trim();
  if (!s || PLACEHOLDER_PHONES.has(s)) return "";
  return s;
}

export function normalizeEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

export interface UpsertCustomerInput {
  accommodationId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  firstOrderDate?: string | null;
  orderId?: string | null;
  /** 只有真的是「新一筆入住」時才 +1，避免補單重跑灌水 */
  incrementVisit?: boolean;
}

export async function upsertCustomerForOrder(
  admin: any,
  input: UpsertCustomerInput,
): Promise<string | null> {
  const accId = input.accommodationId;
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const name = (input.name ?? "").trim();
  if (!accId || (!phone && !email)) return null;

  try {
    let existing: { id: string; visit_count: number; name: string | null; email: string | null; phone: string | null } | null = null;

    if (phone) {
      const { data } = await admin
        .from("customers")
        .select("id, visit_count, name, email, phone")
        .eq("accommodation_id", accId)
        .eq("phone", phone)
        .limit(1);
      existing = data?.[0] ?? null;
    }
    if (!existing && email) {
      const { data } = await admin
        .from("customers")
        .select("id, visit_count, name, email, phone")
        .eq("accommodation_id", accId)
        .ilike("email", email)
        .limit(1);
      existing = data?.[0] ?? null;
    }

    let customerId: string | null = null;
    const nowIso = new Date().toISOString();

    if (existing) {
      await admin
        .from("customers")
        .update({
          name: name || existing.name,
          email: email || existing.email,
          phone: phone || existing.phone,
          visit_count: input.incrementVisit
            ? (existing.visit_count ?? 0) + 1
            : existing.visit_count,
          updated_at: nowIso,
        })
        .eq("id", existing.id);
      customerId = existing.id;
    } else {
      const { data: created, error } = await admin
        .from("customers")
        .insert({
          accommodation_id: accId,
          name: name || (email || phone),
          phone: phone || null,
          email: email || null,
          visit_count: 1,
          first_order_date: input.firstOrderDate ?? null,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[customerUpsert] insert failed:", error.message);
        return null;
      }
      customerId = created?.id ?? null;
    }

    if (customerId && input.orderId) {
      await admin.from("orders").update({ customer_id: customerId }).eq("id", input.orderId);
    }
    return customerId;
  } catch (e) {
    console.error("[customerUpsert] fatal:", (e as Error).message);
    return null;
  }
}
