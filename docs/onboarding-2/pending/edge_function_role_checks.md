# 第三部分配套：後端程式的角色檢查（待核准，尚未修改）

`remarketing-send`、`remarketing-preview`、`remarketing-copy` 三支後端程式用系統權限（service role）讀寫，資料表權限擋不住。
它們自己的角色檢查是「任何一館有 super_admin／admin／hotel_admin／owner 就放行」，所以外部業主（hotel_admin）可以呼叫，
預覽或寄送全平台旅客的再行銷內容。只改資料表權限不夠，這三支也要一起改。

建議改法（三支都一樣，核准後才動）：

```ts
// 原本
const ADMIN_ROLES = ["super_admin", "admin", "hotel_admin", "owner"];
const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
if (!(roles ?? []).some((r: any) => ADMIN_ROLES.includes(r.role))) return json({ error: "Forbidden" }, 403);

// 改成：只限 super_admin（任一列）或全域 admin（accommodation_id 為空），與 migration 20261020090001 一致
const { data: roles } = await admin.from("user_roles").select("role, accommodation_id").eq("user_id", userData.user.id);
const allowed = (roles ?? []).some(
  (r: any) => r.role === "super_admin" || (r.role === "admin" && r.accommodation_id === null),
);
if (!allowed) return json({ error: "Forbidden" }, 403);
```

位置：
- supabase/functions/remarketing-send/index.ts 第 15 行（ADMIN_ROLES）、第 89–90 行
- supabase/functions/remarketing-preview/index.ts 第 11 行、第 33–34 行
- supabase/functions/remarketing-copy/index.ts（同樣寫法，核准後一併確認行號）
