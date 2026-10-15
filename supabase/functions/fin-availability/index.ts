// Fin（Intercom AI 客服）Data connector 專用：跨館查房況，扁平回應。
// GET /fin-availability?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD[&guests=2][&region=][&accommodation=]
// GET /fin-availability?ping=1（Test connection）
// Header: x-api-key: <FIN_API_KEY>　規格見 docs/api/fin-availability.md
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleFin } from "./handler.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) => handleFin(req, { client, apiKey: Deno.env.get("FIN_API_KEY") }));
