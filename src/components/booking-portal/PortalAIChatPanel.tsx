import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Send, Loader2, RotateCcw, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import assistantAvatar from "@/assets/assistant-avatar-xiaoan.png?inline";
import ReactMarkdown from "react-markdown";
import { parseRoomListings, ChatRoomCard } from "./ChatRoomCard";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  quickReplies?: string[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-ai-chat`;

const PortalAIChatPanel = () => {
  const [showAvatar, setShowAvatar] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "您好！我是小安，人客多訂房平台的 AI 管家 😊\n我可以幫您搜尋所有合作民宿的房型、查詢空房與價格，並直接完成訂房！\n請告訴我您的需求。",
      timestamp: new Date(),
      quickReplies: ["查看所有民宿", "幫我推薦房型", "查詢空房"],
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isRecording, isTranscribing, playingMessageIndex, startRecording, stopRecording, playTTS } = useVoiceChat();

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: content.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (resp.status === 429) {
        toast({ title: "請求過於頻繁", description: "請稍後再試", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      if (!resp.ok) throw new Error("AI 回應失敗");

      const reader = resp.body?.getReader();
      if (!reader) {
        // Fallback: non-streaming
        const text = await resp.text();
        let content = "";
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const ct = parsed.choices?.[0]?.delta?.content;
            if (ct) content += ct;
          } catch {}
        }
        const sm = content.match(/\[SUGGEST:\s*([^\]]+)\]/);
        const qr = sm ? sm[1].split("|").map((s) => s.trim()).filter(Boolean) : [];
        const dc = content.replace(/\[SUGGEST:\s*[^\]]+\]/, "").trim();
        setMessages((prev) => [...prev, { role: "assistant", content: dc, timestamp: new Date(), quickReplies: qr.length > 0 ? qr : undefined }]);
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let assistantMessage = "";
      let textBuffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: new Date() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            // Skip tool_calls_complete events
            if (parsed.type === "tool_calls_complete") continue;

            const ct = parsed.choices?.[0]?.delta?.content;
            if (ct) {
              assistantMessage += ct;

              let quickReplies: string[] = [];
              let displayContent = assistantMessage;

              const suggestMatch = assistantMessage.match(/\[SUGGEST:\s*([^\]]+)\]/);
              if (suggestMatch) {
                quickReplies = suggestMatch[1].split("|").map((s) => s.trim()).filter(Boolean);
                displayContent = assistantMessage.replace(/\[SUGGEST:\s*[^\]]+\]/, "").trim();
              }

              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: displayContent,
                  quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
                };
                return updated;
              });
            }
          } catch {}
        }
      }

      setIsLoading(false);
    } catch (e) {
      console.error("Portal AI chat error:", e);
      toast({ title: "AI 管家暫時無法回應", description: "請稍後再試", variant: "destructive" });
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        role: "assistant",
        content: "您好！我是小安，人客多訂房平台的 AI 管家 😊\n請告訴我您的需求。",
        timestamp: new Date(),
        quickReplies: ["查看所有民宿", "幫我推薦房型", "查詢空房"],
      },
    ]);
    setInput("");
  };

  const handleMicToggle = async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) {
        sendMessage(text);
      }
    } else {
      await startRecording();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-1 sm:px-0 text-left">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ height: "calc(100dvh - 56px - 140px - 64px)", minHeight: "280px", maxHeight: "700px" }}>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
          <div className="p-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="flex flex-col items-center shrink-0 gap-1">
                    <img src={assistantAvatar} alt="小安" className="h-7 w-7 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-[hsl(25,70%,50%)]/40 transition-all" loading="eager" fetchPriority="high" decoding="sync" onClick={() => setShowAvatar(true)} />
                    {msg.content && msg.content !== "..." && (
                      <button
                        onClick={() => playTTS(msg.content, i)}
                        className="flex flex-col items-center text-muted-foreground hover:text-[hsl(25,70%,50%)] transition-colors"
                        title={playingMessageIndex === i ? "停止播放" : "語音播放"}
                      >
                        {playingMessageIndex === i ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        <span className="text-[10px] leading-tight">{playingMessageIndex === i ? "停止" : "播放"}</span>
                      </button>
                    )}
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === "user" ? "order-first" : ""}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-base leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[hsl(25,70%,50%)] text-white rounded-br-md"
                        : "bg-gray-100 text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      (() => {
                        const parsed = msg.content ? parseRoomListings(msg.content) : null;
                        if (parsed) {
                          return (
                            <div>
                              {parsed.beforeText && (
                                <div className="prose prose-base max-w-none [&>p]:my-0.5 mb-2">
                                  <ReactMarkdown>{parsed.beforeText}</ReactMarkdown>
                                </div>
                              )}
                              <div className="grid gap-2 mt-1">
                                {parsed.rooms.map((room, ri) => (
                                  <ChatRoomCard key={ri} room={room} />
                                ))}
                              </div>
                              {parsed.afterText && (
                                <div className="prose prose-base max-w-none [&>p]:my-0.5 mt-2">
                                  <ReactMarkdown>{parsed.afterText}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div className="prose prose-base max-w-none [&>p]:my-0.5 [&>ul]:my-1 [&>ol]:my-1">
                            <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                          </div>
                        );
                      })()
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "assistant" && msg.quickReplies && msg.quickReplies.length > 0 && i === messages.length - 1 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.quickReplies.map((qr, qi) => (
                        <button
                          key={qi}
                          onClick={() => sendMessage(qr)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-full border border-[hsl(25,70%,50%)]/30 text-[hsl(25,70%,45%)] hover:bg-[hsl(25,70%,50%)]/10 transition-colors disabled:opacity-50"
                        >
                          {qr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-2 justify-start">
                <img src={assistantAvatar} alt="小安" className="h-7 w-7 shrink-0 mt-0.5 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-[hsl(25,70%,50%)]/40 transition-all" loading="eager" fetchPriority="high" decoding="sync" onClick={() => setShowAvatar(true)} />
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border px-3 py-2 flex gap-2 bg-white items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-white hover:bg-[hsl(25,70%,50%)]"
            onClick={handleReset}
            title="重新開始"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Input
            placeholder="輸入訊息..."
            className="flex-1 !min-h-[40px] !h-10 text-sm border-border"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={isLoading}
          />
          <Button
            variant="ghost"
            size="icon"
            className={`h-10 w-10 shrink-0 rounded-lg transition-all ${
              isRecording
                ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                : isTranscribing
                ? "bg-muted text-muted-foreground"
                : "text-muted-foreground hover:text-white hover:bg-[hsl(25,70%,50%)]"
            }`}
            onClick={handleMicToggle}
            disabled={isLoading || isTranscribing}
            title={isRecording ? "停止錄音" : isTranscribing ? "辨識中..." : "語音輸入"}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 rounded-lg shrink-0"
            style={{ background: "hsl(25, 70%, 55%)" }}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showAvatar} onOpenChange={setShowAvatar}>
        <DialogContent className="sm:max-w-xs p-2 bg-white rounded-2xl">
          <div className="flex flex-col items-center gap-3 py-4">
            <img src={assistantAvatar} alt="AI 管家 小安" className="w-48 h-48 rounded-full object-cover shadow-lg" />
            <div className="text-center">
              <p className="font-semibold text-lg text-foreground">AI 管家 小安</p>
              <p className="text-sm text-muted-foreground">為您搜尋全平台最佳民宿</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortalAIChatPanel;
