import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccommodations from "./tools/list-accommodations";
import listOrders from "./tools/list-orders";
import getOrder from "./tools/get-order";
import listRoomTypes from "./tools/list-room-types";
import revenueSummary from "./tools/revenue-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "renke-hostel-pro",
  title: "renke-hostel-pro",
  version: "0.1.0",
  instructions:
    "民宿管理系統（PMS）工具。先用 list_accommodations 取得館別 id，再用 list_orders / get_order 查訂單、list_room_types 查房型與方案、revenue_summary 取營收概況。所有資料以登入者權限（RLS）為準，皆為唯讀。",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAccommodations, listOrders, getOrder, listRoomTypes, revenueSummary],
});
