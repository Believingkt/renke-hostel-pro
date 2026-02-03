/**
 * Parse Lovable Cloud function invocation errors (supabase.functions.invoke)
 * to extract backend JSON error messages.
 */
export async function parseFunctionInvokeError(error: any): Promise<{
  message: string;
  status?: number;
  backendError?: string;
}> {
  const status: number | undefined = error?.context?.status;

  // Most commonly, error.context is a Response object
  const ctx = error?.context;
  if (typeof Response !== "undefined" && ctx instanceof Response) {
    try {
      // clone() so reading body doesn't break any other consumer
      const cloned = ctx.clone();
      const json = await cloned.json().catch(async () => {
        const text = await ctx.clone().text().catch(() => "");
        try {
          return JSON.parse(text);
        } catch {
          return { error: text };
        }
      });
      const backendError = json?.error ?? json?.message;
      return {
        message: backendError || error?.message || "系統錯誤",
        status,
        backendError,
      };
    } catch {
      // fall through
    }
  }

  return {
    message: error?.message || "系統錯誤",
    status,
    backendError: undefined,
  };
}
