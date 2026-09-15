---
name: order_meta INSERT Scope Contract
description: order_meta 首次建立（INSERT）的授權契約：privileged 全域，team roles 需 order_id→orders.accommodation_id 的館別存取。
type: feature
---

生效：2026-08-30 OrderMeta Security P0.3 Hotfix

- `super_admin` / `admin` / `finance`：GLOBAL first INSERT。
- `scout` / `scout_manager` / `closer` / `closer_manager` / `franchise_internal` / `franchise_external`：
  必須同時 (1) 具該 team role、(2) target order 的 `accommodation_id` 非 NULL、
  (3) caller 對該館有 `user_has_access_to_accommodation`。
- payload 的 `accommodation_id` 只能為 NULL 或等於訂單真實館別；
  **絕不可**用 `NEW.scout_id / closer_id / video_creator_id / filled_by / accommodation_id` 當授權依據（attacker-controlled）。
- `hotel_admin` 與一般 Staff 不因此 Hotfix 取得 first-INSERT 權限。
- SELECT / UPDATE / DELETE policy 未變更。
