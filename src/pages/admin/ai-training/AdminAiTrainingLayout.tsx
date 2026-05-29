import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FileText, BookOpen, MessagesSquare,
  History, FlaskConical, KeyRound, Code,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAliasPrefix } from "@/hooks/use-alias-prefix";

const NAV = [
  { to: "/admin/ai-training", label: "總覽", icon: LayoutDashboard, end: true },
  { to: "/admin/ai-training/prompt", label: "系統提示詞", icon: FileText },
  { to: "/admin/ai-training/knowledge", label: "知識庫", icon: BookOpen },
  { to: "/admin/ai-training/examples", label: "對話範例", icon: MessagesSquare },
  { to: "/admin/ai-training/conversations", label: "對話紀錄", icon: History },
  { to: "/admin/ai-training/playground", label: "即時測試", icon: FlaskConical },
  { to: "/admin/ai-training/api-keys", label: "API 金鑰", icon: KeyRound },
  { to: "/admin/ai-training/api-docs", label: "API 文件", icon: Code },
];

export default function AdminAiTrainingLayout() {
  const { currentAccommodationId } = useAccommodation();
  const { withPrefix } = useAliasPrefix();
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    if (!currentAccommodationId) return;
    void (async () => {
      const [{ data: pub }, { count }] = await Promise.all([
        supabase.from("ai_prompts").select("version")
          .eq("accommodation_id", currentAccommodationId)
          .eq("status", "published")
          .order("version", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("ai_prompts").select("id", { count: "exact", head: true })
          .eq("accommodation_id", currentAccommodationId)
          .eq("status", "draft"),
      ]);
      setPublishedVersion(pub?.version ?? null);
      setDraftCount(count ?? 0);
    })();
  }, [currentAccommodationId]);

  if (!currentAccommodationId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        請先選擇民宿。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="font-medium">AI 管家訓練中心</span>
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

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <aside className="rounded-lg border bg-card p-2 h-fit">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={withPrefix(item.to)}
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

        <main className="rounded-lg border bg-card p-4 md:p-6 min-h-[400px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
