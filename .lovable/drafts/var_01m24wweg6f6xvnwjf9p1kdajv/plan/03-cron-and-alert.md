## 二、每日自動重抓白名單的排程

### 2-1 觸發方式

沿用現有 20 幾支排程一樣的作法（`cron.job` + `net.http_post` 打 Edge Function）：

```sql
select cron.schedule(
  'rpc-contract-check-daily',
  '20 21 * * *',   -- 每日一次，台北時間 05:20
  $$
  select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/rpc-contract-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <service_role>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

每日一次即可：白名單只有在我們自己改 migration 時才會變，不是即時事件，最大延遲一天可以接受，也不會讓資料庫因為頻繁喚醒而增加成本。

### 2-2 讀取現況用的唯讀函式（同一交易內建立即收權）

```sql
CREATE OR REPLACE FUNCTION public.get_rpc_contract(p_names text[])
RETURNS TABLE(fn_name text, src_md5 text, src_len int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.proname::text,
         md5(pg_get_functiondef(p.oid)),
         length(pg_get_functiondef(p.oid))
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(p_names)
$$;

REVOKE ALL ON FUNCTION public.get_rpc_contract(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rpc_contract(text[]) TO service_role;
```

postcheck 驗證 `anon / authenticated / PUBLIC` 皆無 EXECUTE、`service_role` 有。

### 2-3 檢查的五支 RPC 與基準值（本次實測）

| RPC | 目前 md5 | 長度 |
| --- | --- | --- |
| `update_order_with_context` | 892e4b28…93bc6 | 3111 |
| `update_order_fields_v1` | a785d078…098f8 | 1909 |
| `sync_order_rooms_v1` | 95764692…26643 | 4529 |
| `update_paid_order_addons_v3` | 6f333252…f9943 | 31332 |
| `update_paid_order_discount_v2` | 072ae35e…f0d3f | 14603 |

### 2-4 `supabase/functions/rpc-contract-check/index.ts`（新增）

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import expected from "./expected.json" with { type: "json" };
import { reportRpcContractDrift } from "../_shared/rpcContractAlert.ts";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const names = Object.keys(expected.functions);
  const { data, error } = await admin.rpc("get_rpc_contract", { p_names: names });
  if (error) throw new Error(error.message);

  const live = new Map((data ?? []).map((r: any) => [r.fn_name, r]));
  const drift: Array<{ fn: string; expected: string; actual: string; note: string }> = [];

  for (const fn of names) {
    const exp = (expected.functions as any)[fn];
    const got = live.get(fn);
    if (!got) { drift.push({ fn, expected: exp.srcMd5, actual: "—", note: "函式不存在" }); continue; }
    if (got.src_md5 !== exp.srcMd5) {
      drift.push({ fn, expected: exp.srcMd5, actual: got.src_md5, note: `長度 ${got.src_len}` });
    }
  }

  if (drift.length > 0) {
    await reportRpcContractDrift(admin, {
      summary: `${drift.length} 支 RPC 的定義與測試快照不一致`,
      drift,
    });
  }
  return new Response(JSON.stringify({ checked: names.length, drift: drift.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

`expected.json` 與 `src/test/__snapshots__/rpc-whitelists.json` 由同一支 `scripts/dump-rpc-whitelists.ts` 一起寫出，內容相同，不需人工維護清單：改完 migration 後重跑腳本，兩邊同時更新，測試與排程用的是同一份基準。告警訊息會直接寫「請重跑快照腳本並確認呼叫端欄位」。

### 2-5 `supabase/functions/_shared/rpcContractAlert.ts`（新增）

結構完全比照 `owltingSyncAlert.ts`：先寫 `error_logs`（`function_name: "rpc-contract-check"`、`category: "rpc_contract_drift"`），再查 `alert_recipients` 中 `is_active = true AND notify_rpc_contract_drift = true` 的 email，用 Resend 寄一封表格式告警信（欄位：RPC 名稱／快照 md5／實際 md5／備註），寄信失敗只記 console，不影響回應。

## 三、新的告警開關 `notify_rpc_contract_drift`

### 3-1 Migration（precheck / postcheck，比照 OTA 告警那次）

```sql
BEGIN;

DO $$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 10 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: alert_recipients cols=% (expected 10)', v_cols;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='alert_recipients'
               AND column_name='notify_rpc_contract_drift') THEN
    RAISE EXCEPTION 'PRECHECK FAILED: column already exists';
  END IF;
  RAISE NOTICE 'PRECHECK OK: alert_recipients cols=10';
END $$;

ALTER TABLE public.alert_recipients
  ADD COLUMN notify_rpc_contract_drift boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.alert_recipients.notify_rpc_contract_drift
  IS '是否接收「RPC 白名單／定義與測試快照不一致」技術告警';

DO $$
DECLARE v_cols int; r record; v_bad int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 11 THEN RAISE EXCEPTION 'POSTCHECK FAILED: cols=%', v_cols; END IF;

  SELECT * INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients'
    AND column_name='notify_rpc_contract_drift';
  IF r IS NULL OR r.data_type <> 'boolean' OR r.is_nullable <> 'NO' OR r.column_default <> 'true' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: unexpected column def';
  END IF;

  SELECT count(*) INTO v_bad FROM public.alert_recipients
  WHERE notify_rpc_contract_drift IS NOT TRUE;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'POSTCHECK FAILED: % rows not true', v_bad; END IF;
  RAISE NOTICE 'POSTCHECK OK: alert_recipients cols=11';
END $$;

COMMIT;
```

`get_rpc_contract` 的建立＋`REVOKE ALL FROM PUBLIC, anon, authenticated`＋`GRANT ... service_role`＋權限 postcheck 一律放在同一個 migration、同一個交易內完成。

### 3-2 `src/components/headquarters/SystemHealthMonitor.tsx` diff

```diff
   notify_order_rooms_failure: boolean;
   notify_owlting_sync_failure: boolean;
+  notify_rpc_contract_drift: boolean;
```

```diff
         notify_order_rooms_failure: true,
         notify_owlting_sync_failure: true,
+        notify_rpc_contract_drift: true,
```

```diff
                   <TableHead className="w-28 text-center">OTA 同步告警</TableHead>
+                  <TableHead className="w-28 text-center">RPC 合約告警</TableHead>
                   <TableHead className="w-24 text-center">啟用</TableHead>
```

```diff
                     <TableCell className="text-center">
                       <Switch
                         checked={r.notify_owlting_sync_failure}
                         onCheckedChange={(v) => handleToggle(r.id, "notify_owlting_sync_failure", v)}
                       />
                     </TableCell>
+                    <TableCell className="text-center">
+                      <Switch
+                        checked={r.notify_rpc_contract_drift}
+                        onCheckedChange={(v) => handleToggle(r.id, "notify_rpc_contract_drift", v)}
+                      />
+                    </TableCell>
```

前端有改動，這批若核准需要重新發布。

## 施工範圍（等核准）

1. B 型兩支呼叫端抽取（2 支 Edge Function 重新部署）
2. 排程＋`rpc-contract-check`＋`rpcContractAlert.ts`＋快照腳本輸出兩份
3. `alert_recipients` 新欄位與 `get_rpc_contract` migration
4. HQ 監控頁開關（需 Publish）
