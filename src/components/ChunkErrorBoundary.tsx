import { Component, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

async function reportError(errorType: string, errorMessage: string) {
  try {
    await supabase.functions.invoke('report-frontend-error', {
      body: {
        errorType,
        errorMessage,
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    });
  } catch {
    // 回報失敗就忽略，避免無窮迴圈
  }
}

export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message };
  }

  private async cleanupAndReload() {
    try {
      // 清除 SW / Cache，避免舊版 index.html / chunk 被快取導致無限 reload
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {
      // best-effort
    }

    const url = new URL(window.location.href);

    // 部分 CDN/瀏覽器可能忽略 query cache key，改用「不同 path」來確保拿到最新 index.html
    url.pathname = `/__cb/${Date.now()}`;
    url.search = "";
    url.hash = "";

    window.location.replace(url.toString());
  }

  componentDidCatch(error: Error) {
    const isChunkError =
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Importing a module script failed");

    if (!isChunkError) return;

    const key = "chunk_reload_attempted";
    const attempted = sessionStorage.getItem(key) === "1";

    if (!attempted) {
      sessionStorage.setItem(key, "1");
      void this.cleanupAndReload();
      return;
    }

    // 已嘗試過一次仍失敗：回報並停止自動 reload
    void reportError("chunk_load_failure", error.message ?? "(no message)");
    this.setState({ hasError: true, errorMessage: error.message });
  }

  render() {
    if (this.state.hasError) {
      const debugInfo = {
        message: this.state.errorMessage || "(no message)",
        url: typeof window !== "undefined" ? window.location.href : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        time: new Date().toISOString(),
      };

      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-3 px-6 max-w-md">
            <h2 className="text-xl font-semibold">載入失敗</h2>
            <p className="text-muted-foreground">偵測到檔案更新或快取衝突，請重新整理。</p>

            {this.state.errorMessage ? (
              <div className="text-left rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground mb-1">錯誤訊息（可複製回報）</p>
                <pre className="text-xs whitespace-pre-wrap break-words text-foreground">
                  {this.state.errorMessage}
                </pre>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem("chunk_reload_attempted");
                  void this.cleanupAndReload();
                }}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                重新整理
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem("chunk_reload_attempted");
                  void this.cleanupAndReload();
                }}
                className="px-4 py-2 rounded-md border border-border bg-background hover:bg-muted"
              >
                清除快取重試
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                  } catch {
                    // ignore
                  }
                }}
                className="px-4 py-2 rounded-md border border-border bg-background hover:bg-muted"
              >
                複製錯誤資訊
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
