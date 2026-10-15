// Fin 知識庫匯出（內部用）。Header: x-api-key: <FIN_API_KEY>
// GET ?accommodation_id=<uuid>&format=md → Markdown
// GET ?all=1 → [{ alias, name, markdown }]（is_active 館）
// GET ?accommodation_id=platform → 平台層級 Markdown
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleExport } from "./handler.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) => handleExport(req, { client, apiKey: Deno.env.get("FIN_API_KEY") }));
