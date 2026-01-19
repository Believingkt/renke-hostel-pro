import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
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

    // 已嘗試過一次仍失敗：停止自動 reload，讓使用者手動操作
    this.setState({ hasError: true, errorMessage: error.message });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-3 px-6">
            <h2 className="text-xl font-semibold">載入失敗</h2>
            <p className="text-muted-foreground">偵測到檔案更新或快取衝突，請重新整理。</p>
            <div className="flex items-center justify-center gap-3">
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
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
