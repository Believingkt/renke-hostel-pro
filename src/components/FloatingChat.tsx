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
  quickReplies?: string[];
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
      content: "您好！我是森山寫照的 AI 訂房助手 😊\n\n我可以直接幫您完成訂房！請問您想什麼時候入住呢？\n\n請提供您的：\n📅 入住日期\n📅 退房日期",
      quickReplies: ["查看房型資訊", "了解旅宿特色", "入住須知"]
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bookingStep, setBookingStep] = useState(1); // 1: 日期, 2: 房型, 3: 客人資訊, 4: 確認
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
    
    await sendMessageWithContent(userMessage);
  };

  const sendMessageWithContent = async (content: string) => {
    if (isLoading) return;

    // 添加用戶訊息
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content }
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
              
              // 根據工具類型更新步驟
              parsed.results.forEach((r: any) => {
                if (r.result?.rooms && bookingStep < 2) {
                  setBookingStep(2); // 查詢到房型，進入房型選擇步驟
                }
                if (r.result?.success && bookingStep < 4) {
                  setBookingStep(4); // 訂單創建成功，進入確認步驟
                }
              });
              
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
              
              // 根據內容動態生成快速回覆選項並更新訂房步驟
              let quickReplies: string[] = [];
              const lowerContent = assistantMessage.toLowerCase();
              
              // 如果提到日期，提供日期相關的快速回覆
              if (lowerContent.includes('日期') || lowerContent.includes('入住')) {
                quickReplies = ["查看可用日期", "有折扣碼嗎？"];
                if (bookingStep < 1) setBookingStep(1);
              }
              
              // 如果提到房型選擇
              if (lowerContent.includes('房型') || lowerContent.includes('選擇')) {
                quickReplies = ["查看所有房型", "有其他選擇嗎？"];
                if (bookingStep < 2) setBookingStep(2);
              }
              
              // 如果提到客人資訊
              if (lowerContent.includes('姓名') || lowerContent.includes('手機') || lowerContent.includes('聯絡')) {
                quickReplies = ["確認無誤", "需要修改"];
                if (bookingStep < 3) setBookingStep(3);
              }
              
              // 如果提到確認
              if (lowerContent.includes('確認') && lowerContent.includes('訂單')) {
                quickReplies = ["確認訂房", "我再想想"];
                if (bookingStep < 4) setBookingStep(4);
              }
              
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantMessage,
                  quickReplies: quickReplies.length > 0 ? quickReplies : undefined
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

          {/* 訂房進度條 */}
          <div className="px-4 py-3 bg-muted/30 border-b">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className={bookingStep >= 1 ? "text-primary font-semibold" : "text-muted-foreground"}>
                1. 日期
              </span>
              <span className={bookingStep >= 2 ? "text-primary font-semibold" : "text-muted-foreground"}>
                2. 房型
              </span>
              <span className={bookingStep >= 3 ? "text-primary font-semibold" : "text-muted-foreground"}>
                3. 客人資訊
              </span>
              <span className={bookingStep >= 4 ? "text-primary font-semibold" : "text-muted-foreground"}>
                4. 確認
              </span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    bookingStep >= step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
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
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-2 w-full"
                                    onClick={() => sendMessageWithContent(`我要選擇 ${room.name}（房型ID: ${room.id}）`)}
                                    disabled={isLoading}
                                  >
                                    選擇此房型
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* 訂單創建結果 */}
                          {tool.type === 'booking' && (
                            <div className={`border rounded-lg overflow-hidden ${
                              tool.data.success 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-red-50 border-red-200'
                            }`}>
                              {tool.data.success ? (
                                <div className="space-y-3">
                                  {/* 成功標題 */}
                                  <div className="bg-green-100 px-4 py-3 border-b border-green-200">
                                    <div className="flex items-center gap-2 text-green-700 font-semibold">
                                      <span className="text-xl">✅</span>
                                      <span>訂單創建成功！</span>
                                    </div>
                                  </div>
                                  
                                  {/* 訂單摘要 */}
                                  <div className="px-4 space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">訂單編號</span>
                                      <span className="font-mono font-semibold text-green-700">
                                        {tool.data.order_number}
                                      </span>
                                    </div>
                                    
                                    <div className="bg-muted/50 rounded p-3 space-y-1.5 text-xs">
                                      <div className="text-muted-foreground">
                                        訂單狀態：<span className="text-orange-600 font-medium">待確認</span>
                                      </div>
                                      <div className="text-muted-foreground">
                                        我們會盡快與您聯絡確認訂單詳情
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* 付款資訊 */}
                                  <div className="px-4 pb-3">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                                      <div className="font-semibold text-blue-900 text-sm flex items-center gap-2">
                                        <span>💳</span>
                                        <span>付款資訊</span>
                                      </div>
                                      <div className="text-xs text-blue-800 space-y-1">
                                        <div>• 需支付訂金 30% 以確認訂房</div>
                                        <div>• 餘款請於入住當天支付</div>
                                        <div>• 我們會透過 LINE 或電話與您聯絡付款事宜</div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* 下一步操作 */}
                                  <div className="bg-muted/30 px-4 py-3 border-t space-y-2">
                                    <div className="text-xs font-semibold text-foreground mb-2">
                                      下一步：
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-8"
                                        onClick={() => {
                                          if (tool.data.order_id) {
                                            navigate(`/order/${tool.data.order_id}`);
                                          }
                                        }}
                                      >
                                        查看訂單
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-8"
                                        onClick={() => window.open('tel:0903-178-518')}
                                      >
                                        聯絡我們
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4">
                                  <div className="text-red-700 font-medium">
                                    ❌ {tool.data.message || '訂單創建失敗'}
                                  </div>
                                  <div className="text-xs text-red-600 mt-2">
                                    請稍後再試，或聯絡客服協助處理
                                  </div>
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
                  
                  {/* 快速回覆按鈕 */}
                  {message.role === "assistant" && message.quickReplies && message.quickReplies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.quickReplies.map((reply, replyIdx) => (
                        <Button
                          key={replyIdx}
                          size="sm"
                          variant="outline"
                          onClick={() => sendMessageWithContent(reply)}
                          disabled={isLoading}
                          className="text-xs"
                        >
                          {reply}
                        </Button>
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
