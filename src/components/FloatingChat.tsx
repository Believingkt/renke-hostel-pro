import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: {
    type: string;
    data: any;
  }[];
}

interface FloatingChatProps {
  accommodationId: string;
}

export const FloatingChat = ({ accommodationId }: FloatingChatProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "您好！我是森山寫照的 AI 訂房助手 😊\n\n我可以直接幫您完成訂房！請問您想什麼時候入住呢？\n\n請提供您的：\n📅 入住日期\n📅 退房日期"
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // 添加用戶訊息
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userMessage }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-booking-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            accommodationId
          }),
        }
      );

      if (response.status === 429) {
        toast({
          title: "使用量超過限制",
          description: "請稍後再試",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (response.status === 402) {
        toast({
          title: "服務暫時無法使用",
          description: "請聯絡管理員",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("AI 回應失敗");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("無法讀取回應");
      }

      const decoder = new TextDecoder();
      let assistantMessage = "";
      let textBuffer = "";

      // 創建 assistant 訊息
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;

        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);

            // 處理工具呼叫完成
            if (parsed.type === 'tool_calls_complete') {
              console.log("工具呼叫結果:", parsed.results);
              
              // 將工具調用結果添加到最後一條消息
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                
                updated[updated.length - 1] = {
                  ...lastMsg,
                  toolCalls: parsed.results.map((r: any) => {
                    // 根據不同的工具類型處理結果
                    if (r.result?.rooms) {
                      return { type: 'rooms', data: r.result.rooms };
                    }
                    if (r.result?.success !== undefined) {
                      return { type: 'booking', data: r.result };
                    }
                    if (r.result?.is_valid !== undefined) {
                      return { type: 'discount', data: r.result };
                    }
                    return { type: 'unknown', data: r.result };
                  })
                };
                
                return updated;
              });
              continue;
            }

            // 處理文字內容
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantMessage
                };
                return updated;
              });
            }
          } catch (e) {
            console.error("解析失敗:", e);
          }
        }
      }

    } catch (error) {
      console.error("發送訊息失敗:", error);
      toast({
        title: "發送失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
      
      // 移除失敗的 assistant 訊息
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* 浮動按鈕 */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 z-50"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* 聊天視窗 */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl z-50 flex flex-col border-primary/20">
          {/* 標題列 */}
          <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">AI 訂房助手</h3>
                <p className="text-xs opacity-90">森山寫照</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="hover:bg-primary-foreground/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* 訊息區域 */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index}>
                  <div
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                  
                  {/* 顯示工具調用結果 */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.toolCalls.map((tool, toolIdx) => (
                        <div key={toolIdx}>
                          {/* 房型列表 */}
                          {tool.type === 'rooms' && (
                            <div className="bg-card border rounded-lg p-3 space-y-2">
                              <p className="text-sm font-semibold text-foreground mb-2">
                                📋 查詢到的房型：
                              </p>
                              {tool.data.map((room: any, roomIdx: number) => (
                                <div key={roomIdx} className="bg-muted/50 rounded p-2 text-sm">
                                  <div className="font-medium text-foreground">{room.name}</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    容納人數：{room.capacity}人
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    平日：NT$ {room.weekday_price?.toLocaleString()} / 
                                    假日：NT$ {room.weekend_price?.toLocaleString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* 訂單創建結果 */}
                          {tool.type === 'booking' && (
                            <div className={`border rounded-lg p-3 ${
                              tool.data.success 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-red-50 border-red-200'
                            }`}>
                              {tool.data.success ? (
                                <>
                                  <div className="flex items-center gap-2 text-green-700 font-semibold">
                                    ✅ 訂單創建成功！
                                  </div>
                                  <div className="text-sm text-green-600 mt-2">
                                    訂單編號：{tool.data.order_number}
                                  </div>
                                </>
                              ) : (
                                <div className="text-red-700">
                                  ❌ {tool.data.message || '訂單創建失敗'}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 折扣碼驗證結果 */}
                          {tool.type === 'discount' && (
                            <div className={`border rounded-lg p-3 text-sm ${
                              tool.data.is_valid 
                                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                            }`}>
                              {tool.data.is_valid ? (
                                <>
                                  ✓ 折扣碼有效：{tool.data.discount_type === 'percentage' ? `${tool.data.discount_value}% 折扣` : `NT$ ${tool.data.discount_value} 折扣`}
                                </>
                              ) : (
                                <>❌ {tool.data.message}</>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">正在輸入...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* 快速操作按鈕 */}
            {!isLoading && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">快速操作</p>
                <Button 
                  onClick={() => navigate('/booking')}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  開始訂房
                </Button>
              </div>
            )}
          </ScrollArea>

          {/* 輸入區域 */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="輸入訊息..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              AI 助手可能會出錯，請核對重要資訊
            </p>
          </div>
        </Card>
      )}
    </>
  );
};
