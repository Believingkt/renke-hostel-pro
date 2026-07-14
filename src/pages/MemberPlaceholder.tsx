import { useNavigate } from "react-router-dom";
import { ChevronLeft, LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  title: string;
  icon: LucideIcon;
  description: string;
  emptyText: string;
}

const MemberPlaceholder = ({ title, icon: Icon, description, emptyText }: Props) => {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={() => navigate("/member/profile")}
          className="p-1 -ml-1 text-muted-foreground hover:text-foreground"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <Card className="p-4 bg-gradient-to-br from-orange-50 to-white border-orange-100">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-[hsl(24,100%,50%)]/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-[hsl(24,100%,50%)]" />
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed">{description}</div>
        </div>
      </Card>
      <Card className="p-10 text-center">
        <Icon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
        <div className="text-sm text-muted-foreground">{emptyText}</div>
        <div className="text-xs text-muted-foreground/70 mt-1">功能開發中，敬請期待</div>
      </Card>
    </div>
  );
};

export default MemberPlaceholder;
