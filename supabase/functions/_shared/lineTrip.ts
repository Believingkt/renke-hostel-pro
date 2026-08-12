/**
 * 小安 LINE 版「行程推薦」意圖
 * - 沿用既有 trip-recommend Edge Function（同一套情境模板與實價計算）
 * - 旅遊屬性歸檔至 traveler_attributes，session_id = `line:<lineUserId>`
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { TripAttributes, TripScenario } from "./lineIntent.ts";
import type { OutgoingMessage } from "./lineButler.ts";

export const SCENARIO_LABEL: Record<TripScenario, string> = {
  family: "家庭親子",
  couple: "情侶約會",
  friends: "好友出遊",
  villa: "包棟聚會",
  outdoor: "戶外探索",
};

const SITE_ORIGIN = Deno.env.get("PUBLIC_SITE_ORIGIN") || "https://booking.lakeze.com";

export function tripSessionId(lineUserId: string) {
  return `line:${lineUserId}`;
}

/** 屬性歸檔（不改資料表，以 session_id 前綴標記來源） */
export async function archiveTripAttributes(
  sb: SupabaseClient,
  lineUserId: string,
  attrs: TripAttributes,
) {
  const payload = {
    session_id: tripSessionId(lineUserId),
    user_id: null,
    trip_duration: attrs.trip_duration ?? null,
    festival: attrs.festival ?? null,
    party_size: attrs.party_size ?? null,
    companion_type: attrs.companion_type ?? null,
    purpose: attrs.purpose ?? null,
    budget: attrs.budget ?? null,
    highlights: attrs.highlights ?? null,
  };
  const hasValue = Object.entries(payload).some(([k, v]) => k !== "session_id" && k !== "user_id" && v !== null);
  if (!hasValue) return;
  const { error } = await sb.from("traveler_attributes").insert(payload);
  if (error) console.error("[butler-trip] archive attributes failed", error);
}

export function tripFullUrl(scenario: TripScenario, tripId?: string | null) {
  const base = `${SITE_ORIGIN}/trips/generate?scenario=${scenario}&lang=zh`;
  const uri = tripId ? `${base}&trip=${tripId}` : base;
  console.log("[butler-trip] full trip uri", uri);
  return uri;
}

/** 把 LINE 端已生成的行程落地保存，回傳快照 id（失敗回 null，不影響回覆） */
export async function saveTripSnapshot(
  sb: SupabaseClient,
  lineUserId: string,
  scenario: TripScenario,
  attrs: TripAttributes,
  // deno-lint-ignore no-explicit-any
  trip: any,
): Promise<string | null> {
  try {
    const { data, error } = await sb
      .from("trip_generations")
      .insert({
        scenario,
        source: "line",
        line_user_id: lineUserId,
        attributes: attrs ?? {},
        payload: trip,
      })
      .select("id")
      .single();
    if (error) throw error;
    console.log("[butler-trip] snapshot saved", data?.id);
    return data?.id ?? null;
  } catch (e) {
    console.error("[butler-trip] save snapshot failed", e);
    return null;
  }
}

function money(n: number) {
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

// deno-lint-ignore no-explicit-any
function itemName(v: any): string {
  if (!v) return "行程點";
  if (typeof v === "string") return v;
  return v.zh || v.en || v.ja || "行程點";
}

export function scenarioQuickReply(): OutgoingMessage {
  return {
    type: "text",
    text: "想要哪一種玩法呢？我照那個調性排 😊",
    quickReply: {
      items: (Object.keys(SCENARIO_LABEL) as TripScenario[]).map((k) => ({
        type: "action",
        action: { type: "postback", label: SCENARIO_LABEL[k], data: `action=trip&scenario=${k}`, displayText: `${SCENARIO_LABEL[k]}行程` },
      })),
    },
  };
}

/** 呼叫 trip-recommend 取得行程 */
// deno-lint-ignore no-explicit-any
export async function recommendTrip(scenario: TripScenario, attributes: TripAttributes): Promise<any | null> {
  {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/trip-recommend`;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ scenario, attributes }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error("[butler-trip] trip-recommend failed", r.status, body);
      throw new Error(`trip-recommend ${r.status}: ${body.slice(0, 300)}`);
    }
    const json = await r.json();
    if (json?.error) throw new Error(String(json.error));
    return json;
  }
}

// deno-lint-ignore no-explicit-any
export function tripFlex(scenario: TripScenario, trip: any, tripId?: string | null): OutgoingMessage {
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(trip?.items) ? trip.items.slice(0, 6) : [];
  const rows = items.map((i) => ({
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      { type: "text", text: i.start_time || "—", size: "xs", color: "#999999", flex: 2 },
      { type: "text", text: itemName(i.name), size: "sm", wrap: true, flex: 6 },
    ],
  }));
  const title = itemName(trip?.title) || `${SCENARIO_LABEL[scenario]}行程`;
  const guide = itemName(trip?.guide);
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `🗺️ ${SCENARIO_LABEL[scenario]}`, size: "xs", color: "#999999" },
          { type: "text", text: title, weight: "bold", size: "md", wrap: true },
          ...(guide ? [{ type: "text", text: guide, size: "xs", color: "#888888", wrap: true }] : []),
          { type: "separator", margin: "md" },
          ...(rows.length ? rows : [{ type: "text", text: "行程整理中…", size: "sm", color: "#999999" }]),
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              { type: "text", text: "預估合計", size: "sm", weight: "bold" },
              {
                type: "text",
                text: money(Number(trip?.total_price) || 0),
                size: "sm",
                weight: "bold",
                align: "end",
                color: "#E8792B",
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#E8792B",
            action: { type: "uri", label: "查看完整行程", uri: tripFullUrl(scenario, tripId) },
          },
        ],
      },
    },
  };
}
