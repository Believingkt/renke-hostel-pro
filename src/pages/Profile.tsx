import { useNavigate, useSearchParams } from "react-router-dom";
import { Construction, MessageCircle, ClipboardList, UserCircle, Settings } from "lucide-react";
import { useSubdomain } from "@/hooks/use-subdomain";
import { getThemeClassByAccommodation } from "@/constants/themes";

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromAiBooking = searchParams.get('from') === 'ai-booking';
  const { accommodationId } = useSubdomain();
  const themeClass = getThemeClassByAccommodation(accommodationId);

  return (
    <div className={`min-h-screen bg-background flex flex-col ${themeClass} ${fromAiBooking ? 'pb-28' : ''}`}>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <Construction className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h1 className="text-xl font-semibold text-foreground mb-2">建構中</h1>
        <p className="text-sm text-muted-foreground text-center">
          此功能正在開發中，敬請期待！
        </p>
      </div>

      {fromAiBooking && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 safe-bottom bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] z-50">
          <div className="flex items-center justify-around px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <button
              onClick={() => navigate('/ai-booking')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-[10px] font-medium">對話</span>
            </button>
            <button
              onClick={() => navigate('/order-search?from=ai-booking')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <ClipboardList className="h-5 w-5" />
              <span className="text-[10px] font-medium">訂單</span>
            </button>
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-primary bg-primary/5 transition-all duration-200"
            >
              <UserCircle className="h-5 w-5" />
              <span className="text-[10px] font-medium">我的</span>
            </button>
            <button
              onClick={() => navigate('/ai-booking?tab=settings')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <Settings className="h-5 w-5" />
              <span className="text-[10px] font-medium">設定</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
