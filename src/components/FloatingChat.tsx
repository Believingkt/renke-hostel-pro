import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface FloatingChatProps {
  accommodationId: string;
}

export const FloatingChat = ({ accommodationId }: FloatingChatProps) => {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate('/ai-booking')}
      className="fixed bottom-4 right-4 md:bottom-6 md:right-6 h-14 w-14 md:h-16 md:w-16 rounded-full shadow-xl bg-primary hover:bg-primary/90 hover:scale-110 transition-all duration-300"
      style={{ zIndex: 9998 }}
      size="icon"
      aria-label="前往 AI 訂房助手"
      title="AI 訂房助手"
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7 animate-pulse" />
    </Button>
  );
};
