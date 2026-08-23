/**
 * Edge Function（Deno）原始碼在被前端測試 import 時，需要這些最小型別 shim，
 * 否則 tsc 會對 `Deno` 全域與 URL / npm: 形式的 import 報錯。
 * 僅供型別檢查使用，不影響任何執行期行為。
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
};

declare module "https://esm.sh/*";
declare module "https://deno.land/*";
declare module "npm:*";
declare module "jsr:*";
