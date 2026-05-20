import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  MessagesSquare,
  History,
  FlaskConical,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/hq/ai-training", label: "總覽", icon: LayoutDashboard, end: true },
  { to: "/hq/ai-training/prompt", label: "系統提示詞", icon: FileText },
  { to: "/hq/ai-training/knowledge", label: "知識庫", icon: BookOpen },
  { to: "/hq/ai-training/examples", label: "對話範例", icon: MessagesSquare },
  { to: "/hq/ai-training/conversations", label: "對話紀錄", icon: History },
  { to: "/hq/ai-training/playground", label: "即時測試", icon: FlaskConical },
  { to: "/hq/ai-training/versions", label: "版本管理", icon: GitBranch },
];

export default function AiTrainingLayout() {
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [draftCount, setDraftCount] = useState<number>(0);
  const location = useLocation();

  useEffect(() => {
    void (async () => {
      const [{ data: pub }, { count }] = await Promise.all([
        supabase
          .from("ai_prompts")
          .select("version")
          .eq("status", "published")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("ai_prompts")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),
      ]);
      setPublishedVersion(pub?.version ?? null);
      setDraftCount(count ?? 0);
    })();
  }, [location.pathname]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky 頂部狀態列 */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">AI 助理訓練中心</span>
          <span className="text-muted-foreground">
            目前正式版本：
            <span className="font-semibold text-foreground">
              {publishedVersion ? `v${publishedVersion}` : "v0 未發佈"}
            </span>
          </span>
          <span className="text-muted-foreground">
            草稿變動：
            <span className="font-semibold text-foreground">{draftCount} 處</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* 內層側邊欄 */}
        <aside className="rounded-lg border bg-card p-2">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="rounded-lg border bg-card p-6 min-h-[400px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
