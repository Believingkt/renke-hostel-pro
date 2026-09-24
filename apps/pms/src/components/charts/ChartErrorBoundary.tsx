import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // 靜默紀錄；圖表崩潰不應影響整頁
    console.error("[ChartErrorBoundary]", error?.message);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-[200px] sm:h-[240px] md:h-[280px] text-muted-foreground">
          <div className="text-center space-y-2">
            <p className="text-sm">{this.props.fallbackMessage ?? "圖表暫時無法顯示"}</p>
            <button
              type="button"
              onClick={this.reset}
              className="text-xs px-3 py-1 rounded-md border border-border bg-background hover:bg-muted"
            >
              重試
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
