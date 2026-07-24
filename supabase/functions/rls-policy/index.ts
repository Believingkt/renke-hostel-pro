// Placeholder Edge Function so `supabase functions test rls-policy` locates the folder.
// 實際邏輯在 index.test.ts。
Deno.serve(() => new Response("rls-policy test suite", { status: 200 }));
