---
name: SECURITY DEFINER 建立即收權
description: 新建 SECURITY DEFINER 函式必須在同一 migration/交易內 REVOKE ALL FROM PUBLIC，postcheck 必驗 anon/authenticated/PUBLIC 不在權限清單
type: constraint
---
任何新建的 SECURITY DEFINER 函式：

1. `CREATE FUNCTION` 與 `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` 必須包在**同一個 migration、同一個交易**內完成，並在同一段 SQL 內 `GRANT EXECUTE TO service_role`（或實際需要的角色）。
2. 嚴禁「先建立、之後補 revoke」——即使只間隔數十秒，也算一次真實對外曝露窗口（2026-09-09 `update_order_with_context` 即發生過）。
3. **每次** migration 後的 postcheck 必須明確查詢並貼出權限狀態，證明 `anon`、`authenticated`、`PUBLIC` 都不在執行權限清單中。不需使用者再提醒。

驗證查詢：
```sql
select grantee, privilege_type from information_schema.routine_privileges
where routine_name = '<fn>' and routine_schema = 'public';
select has_function_privilege('anon','public.<fn>(<sig>)','EXECUTE') as anon,
       has_function_privilege('authenticated','public.<fn>(<sig>)','EXECUTE') as authed,
       has_function_privilege('service_role','public.<fn>(<sig>)','EXECUTE') as svc;
```
