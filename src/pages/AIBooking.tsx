import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, ArrowLeft, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubdomain } from "@/hooks/use-subdomain";
import { SEOHead } from "@/components/SEOHead";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: {
    type: string;
    data: any;
  }[];
  quickReplies?: string[];
}

export default function AIBooking() {
  const navigate = useNavigate();
  const { accommodationId } = useSubdomain();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "您好！我是森山寫照的 AI 訂房助手 😊\n\n我可以直接幫您完成訂房！請問您想什麼時候入住呢？\n\n請提供您的：\n📅 入住日期\n📅 退房日期",
      quickReplies: ["查看房型資訊", "了解旅宿特色", "入住須知"]
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
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
    if (isLoading || !accommodationId) return;

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

            if (parsed.type === 'tool_calls_complete') {
              parsed.results.forEach((r: any) => {
                if (r.result?.rooms && bookingStep < 2) {
                  setBookingStep(2);
                }
                if (r.result?.success && bookingStep < 4) {
                  setBookingStep(4);
                }
              });
              
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                
                updated[updated.length - 1] = {
                  ...lastMsg,
                  toolCalls: parsed.results.map((r: any) => {
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

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              
              let quickReplies: string[] = [];
              const lowerContent = assistantMessage.toLowerCase();
              
              if (lowerContent.includes('日期') || lowerContent.includes('入住')) {
                quickReplies = ["查看可用日期", "有折扣碼嗎？"];
                if (bookingStep < 1) setBookingStep(1);
              }
              
              if (lowerContent.includes('房型') || lowerContent.includes('選擇')) {
                quickReplies = ["查看所有房型", "有其他選擇嗎？"];
                if (bookingStep < 2) setBookingStep(2);
              }
              
              if (lowerContent.includes('姓名') || lowerContent.includes('手機') || lowerContent.includes('聯絡')) {
                quickReplies = ["確認無誤", "需要修改"];
                if (bookingStep < 3) setBookingStep(3);
              }
              
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

  const handleRestart = () => {
    setMessages([
      {
        role: "assistant",
        content: "您好！我是森山寫照的 AI 訂房助手 😊\n\n我可以直接幫您完成訂房！請問您想什麼時候入住呢？\n\n請提供您的：\n📅 入住日期\n📅 退房日期",
        quickReplies: ["查看房型資訊", "了解旅宿特色", "入住須知"]
      }
    ]);
    setInput("");
    setBookingStep(1);
    toast({
      title: "已重新開始",
      description: "對話已清除，可以重新訂房了",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <SEOHead
        title="AI 訂房助手 - 森山寫照"
        description="使用 AI 智能助手快速完成訂房流程，即時查詢房型、價格和空房狀況"
        keywords={["AI 訂房", "智能助手", "線上訂房", "森山寫照"]}
      />

      {/* 頂部導航 */}
      <div className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回首頁
          </Button>
          
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg md:text-xl font-bold">AI 訂房助手</h1>
              <p className="text-xs md:text-sm opacity-90">森山寫照</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestart}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            <span className="hidden md:inline">重新開始</span>
          </Button>
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="shadow-2xl overflow-hidden border-primary/20 h-[calc(100vh-200px)] flex flex-col">
          {/* 訂房進度條 */}
          <div className="px-6 py-4 bg-muted/30 border-b">
            <div className="flex items-center justify-between text-xs md:text-sm mb-3">
              <span className={bookingStep >= 1 ? "text-primary font-semibold" : "text-muted-foreground"}>
                1. 選擇日期
              </span>
              <span className={bookingStep >= 2 ? "text-primary font-semibold" : "text-muted-foreground"}>
                2. 選擇房型
              </span>
              <span className={bookingStep >= 3 ? "text-primary font-semibold" : "text-muted-foreground"}>
                3. 填寫資訊
              </span>
              <span className={bookingStep >= 4 ? "text-primary font-semibold" : "text-muted-foreground"}>
                4. 確認訂單
              </span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-2 flex-1 rounded-full transition-all duration-500 ${
                    bookingStep >= step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 訊息區域 */}
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-6">
              {messages.map((message, index) => (
                <div 
                  key={index}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 md:px-5 md:py-3 whitespace-pre-wrap transition-all duration-300 shadow-md ${
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
                    <div className="mt-3 space-y-3">
                      {message.toolCalls.map((tool, toolIdx) => (
                        <div key={toolIdx}>
                          {/* 房型列表 */}
                          {tool.type === 'rooms' && (
                            <div className="bg-card border rounded-xl p-4 space-y-3 shadow-sm">
                              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                📋 可預訂房型
                              </p>
                              {tool.data.map((room: any, roomIdx: number) => (
                                <div key={roomIdx} className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
                                  <div className="font-medium text-foreground text-base">{room.name}</div>
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <div>容納人數：{room.capacity}人</div>
                                    <div className="flex gap-3">
                                      <span>平日：NT$ {room.weekday_price?.toLocaleString()}</span>
                                      <span>假日：NT$ {room.weekend_price?.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="default"
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
                          {tool.type === 'booking' && tool.data.success && (
                            <div className="border rounded-xl overflow-hidden bg-green-50 border-green-200 shadow-lg">
                              <div className="bg-green-100 px-5 py-4 border-b border-green-200">
                                <div className="flex items-center gap-3 text-green-700 font-semibold text-lg">
                                  <span className="text-2xl">✅</span>
                                  <span>訂單創建成功！</span>
                                </div>
                              </div>
                              
                              <div className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">訂單編號</span>
                                  <span className="font-mono font-semibold text-green-700 text-lg">
                                    {tool.data.order_number}
                                  </span>
                                </div>
                                
                                <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                                  <div className="text-muted-foreground">
                                    訂單狀態：<span className="text-orange-600 font-medium">待確認</span>
                                  </div>
                                  <div className="text-muted-foreground">
                                    我們會盡快與您聯絡確認訂單詳情
                                  </div>
                                </div>
                                
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                                  <div className="font-semibold text-blue-900 flex items-center gap-2">
                                    <span>💳</span>
                                    <span>付款資訊</span>
                                  </div>
                                  <div className="text-sm text-blue-800 space-y-2">
                                    <div>• 需支付訂金 30% 以確認訂房</div>
                                    <div>• 餘款請於入住當天支付</div>
                                    <div>• 我們會透過 LINE 或電話與您聯絡付款事宜</div>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate(`/order/${tool.data.order_id}`)}
                                    className="w-full"
                                  >
                                    查看訂單
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.location.href = 'tel:0903-178-518'}
                                    className="w-full"
                                  >
                                    聯絡我們
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 折扣碼驗證結果 */}
                          {tool.type === 'discount' && (
                            <div className={`border rounded-lg p-4 text-sm ${
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.quickReplies.map((reply, replyIdx) => (
                        <Button
                          key={replyIdx}
                          size="sm"
                          variant="outline"
                          onClick={() => sendMessageWithContent(reply)}
                          disabled={isLoading}
                          className="text-sm hover-scale transition-all duration-200"
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
                  <div className="bg-muted rounded-2xl px-5 py-3 flex items-center gap-3 shadow-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">正在輸入...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* 輸入區域 */}
          <div className="p-4 md:p-6 border-t bg-background/50 backdrop-blur-sm">
            <div className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="輸入訊息..."
                disabled={isLoading}
                className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-primary/20 h-12 text-base"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="transition-all duration-200 hover-scale h-12 w-12"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              AI 助手可能會出錯，請核對重要資訊
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
