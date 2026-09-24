import { useNavigate } from "react-router-dom";
import { Button } from "@lakeze/shared/components/ui/button";
import { MessageCircle } from "lucide-react";
import { useIsNativeApp } from "@lakeze/shared/hooks/use-is-native-app";

interface FloatingChatProps {
  accommodationId: string;
}

export const FloatingChat = ({ accommodationId }: FloatingChatProps) => {
  const navigate = useNavigate();
  const native = useIsNativeApp();

  return (
    <Button
      onClick={() => navigate('/ai-booking')}
      className="fixed bottom-4 md:bottom-6 right-4 md:right-6 h-14 w-14 md:h-16 md:w-16 rounded-full shadow-xl bg-primary hover:bg-primary/90 hover:scale-110 transition-all duration-300"
      style={{
        zIndex: 9998,
        // 原生 App：避開底部 Tab Bar
        bottom: native
          ? "calc(62px + env(safe-area-inset-bottom, 0px))"
          : undefined,
      }}
      size="icon"
      aria-label="前往 AI 管家"
      title="AI 管家"
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7 animate-pulse" />
    </Button>
  );
};
