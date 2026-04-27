import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Send, Loader2, RotateCcw, Mic, Volume2, VolumeX, Sparkles, Calendar, Users, MapPin } from "lucide-react";
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

// 智慧預設值：今日 +30 天、14 人、6 房、宜蘭
function getSmartDefault() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return {
    dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
    summary: `${d.getMonth() + 1}/${d.getDate()} · 14 人 · 6 間房 · 宜蘭`,
  };
}

const HOT_PICKS = [
  { id: "yilan-bbq", emoji: "🔥", title: "宜蘭烤肉包棟", subtitle: "適合 12-16 人", query: "我想在宜蘭找可以烤肉的包棟，14 人 6 間房" },
  { id: "nantou-pet", emoji: "🐶", title: "南投寵物友善", subtitle: "山景民宿", query: "南投有寵物友善的民宿嗎？" },
  { id: "miaoli-pool", emoji: "🏊", title: "苗栗泳池度假", subtitle: "親子首選", query: "苗栗有泳池的民宿，6 人入住" },
];

const PortalAIChatPanel = () => {
  const smartDefault = useMemo(() => getSmartDefault(), []);
  const [showAvatar, setShowAvatar] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const focusRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isRecording, isTranscribing, playingMessageIndex, startRecording, stopRecording, playTTS, stopPlayback } = useVoiceChat();

  // 取得當前焦點訊息（最新一則 assistant + 最新一則 user）
  const focusMessages = useMemo(() => {
    if (messages.length === 0) return [];
    const result: Message[] = [];
    // 找最後一則 user
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        result.push(messages[i]);
        break;
      }
    }
    // 最後一則 assistant
    const lastAssistant = messages[messages.length - 1];
    if (lastAssistant?.role === "assistant") {
      result.push(lastAssistant);
    }
    return result;
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;
    setShowWelcome(false);

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
    stopPlayback();
    setMessages([]);
    setInput("");
    setShowWelcome(true);
  };

  const handleMicToggle = async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) sendMessage(text);
    } else {
      await startRecording();
    }
  };

  // 自動播放最新 AI 回覆（語音優先體驗）
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant" && last.content && !isLoading) {
      // 自動朗讀最新回覆
      const idx = messages.length - 1;
      const timer = setTimeout(() => playTTS(last.content, idx), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const currentAssistant = focusMessages.find((m) => m.role === "assistant");
  const currentUser = focusMessages.find((m) => m.role === "user");
  const isAssistantSpeaking = currentAssistant && playingMessageIndex === messages.length - 1;

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0">
      <div
        className="bg-gradient-to-br from-white via-[hsl(35,85%,98%)] to-[hsl(25,80%,96%)] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col relative"
        style={{ minHeight: "560px", maxHeight: "calc(100dvh - 200px)" }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(25,30%,90%)]/60 bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <img
              src={assistantAvatar}
              alt="小安"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-[hsl(25,70%,55%)]/30 cursor-pointer"
              onClick={() => setShowAvatar(true)}
              loading="eager"
            />
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">AI 找房間 · 小安</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {isRecording ? "🎤 聆聽中..." : isTranscribing ? "辨識中..." : isLoading ? "思考中..." : isAssistantSpeaking ? "🔊 說話中" : "在線"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs text-muted-foreground hover:text-foreground" title="重新開始">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重來
          </Button>
        </div>

        {/* Main interaction area */}
        <div ref={focusRef} className="flex-1 flex flex-col items-center justify-center px-4 py-6 overflow-y-auto">
          {showWelcome && messages.length === 0 ? (
            <div className="w-full flex flex-col items-center text-center gap-5 animate-in fade-in duration-500">
              {/* Voice orb */}
              <button
                onClick={handleMicToggle}
                disabled={isLoading || isTranscribing}
                className="relative group"
                aria-label="開始語音對話"
              >
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-[hsl(25,80%,60%)] to-[hsl(15,75%,50%)] blur-2xl opacity-40 ${isRecording ? "animate-pulse scale-125" : "group-hover:opacity-60 group-hover:scale-110"} transition-all`} />
                <div className={`relative h-32 w-32 rounded-full bg-gradient-to-br from-[hsl(25,80%,60%)] via-[hsl(20,80%,55%)] to-[hsl(15,75%,50%)] flex items-center justify-center shadow-xl ${isRecording ? "animate-pulse" : ""}`}>
                  <Mic className="h-12 w-12 text-white drop-shadow-lg" strokeWidth={2.2} />
                </div>
                {isRecording && (
                  <span className="absolute inset-0 rounded-full ring-4 ring-red-400/60 animate-ping" />
                )}
              </button>

              <div className="space-y-1">
                <p className="text-base font-bold text-foreground">點擊麥克風，開口就能訂房</p>
                <p className="text-xs text-muted-foreground">告訴我「想去哪、幾個人、什麼時候」即可</p>
              </div>

              {/* Smart default suggestion */}
              <button
                onClick={() => sendMessage(`我要訂 ${smartDefault.summary}`)}
                disabled={isLoading}
                className="w-full max-w-sm rounded-2xl border border-[hsl(25,60%,80%)] bg-white/80 backdrop-blur p-3 text-left hover:bg-white hover:border-[hsl(25,70%,55%)] hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(25,70%,50%)]" />
                  <span className="text-[11px] font-semibold text-[hsl(25,70%,45%)] uppercase tracking-wide">幫您預設好了</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{smartDefault.dateLabel}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" />14 人</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />宜蘭</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 group-hover:text-foreground/70">點此一鍵開始 →</p>
              </button>

              {/* Hot picks */}
              <div className="w-full max-w-sm space-y-1.5">
                <p className="text-[11px] text-muted-foreground text-left px-1">或試試熱門選擇</p>
                {HOT_PICKS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => sendMessage(p.query)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-white/70 px-3 py-2 text-left hover:bg-white hover:border-[hsl(25,60%,70%)] transition-all"
                  >
                    <span className="text-xl">{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.subtitle}</p>
                    </div>
                    <span className="text-xs text-[hsl(25,70%,50%)]">›</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-xl space-y-4 animate-in fade-in duration-300">
              {/* User's last message — small bubble at top */}
              {currentUser && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-[hsl(25,70%,50%)] text-white rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm">
                    {currentUser.content}
                  </div>
                </div>
              )}

              {/* AI response — focused card */}
              {currentAssistant && (
                <div className="flex flex-col items-center gap-3">
                  {/* Voice orb */}
                  <button
                    onClick={() => currentAssistant.content && playTTS(currentAssistant.content, messages.length - 1)}
                    className="relative group"
                    title={isAssistantSpeaking ? "停止" : "重新播放"}
                  >
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-[hsl(25,80%,60%)] to-[hsl(15,75%,50%)] blur-xl ${isAssistantSpeaking ? "animate-pulse opacity-60 scale-110" : "opacity-30"} transition-all`} />
                    <div className={`relative h-20 w-20 rounded-full bg-gradient-to-br from-[hsl(25,80%,60%)] to-[hsl(15,75%,50%)] flex items-center justify-center shadow-lg ${isAssistantSpeaking ? "animate-pulse" : ""}`}>
                      {isAssistantSpeaking ? <VolumeX className="h-8 w-8 text-white" /> : <Volume2 className="h-8 w-8 text-white" />}
                    </div>
                  </button>

                  {/* Compact AI text */}
                  <div className="w-full bg-white/90 backdrop-blur rounded-2xl px-4 py-3 shadow-sm border border-[hsl(25,30%,92%)]">
                    {currentAssistant.content ? (
                      (() => {
                        const parsed = parseRoomListings(currentAssistant.content);
                        if (parsed) {
                          return (
                            <div className="space-y-2">
                              {parsed.beforeText && (
                                <div className="prose prose-sm max-w-none [&>p]:my-0 text-foreground text-sm leading-relaxed">
                                  <ReactMarkdown>{parsed.beforeText}</ReactMarkdown>
                                </div>
                              )}
                              <div className="grid gap-2">
                                {parsed.rooms.slice(0, 3).map((room, ri) => (
                                  <ChatRoomCard key={ri} room={room} />
                                ))}
                              </div>
                              {parsed.afterText && (
                                <div className="prose prose-sm max-w-none [&>p]:my-0 text-foreground text-sm">
                                  <ReactMarkdown>{parsed.afterText}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div className="prose prose-sm max-w-none [&>p]:my-0 text-foreground text-base leading-relaxed text-center">
                            <ReactMarkdown>{currentAssistant.content}</ReactMarkdown>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex justify-center py-2">
                        <Loader2 className="h-5 w-5 animate-spin text-[hsl(25,70%,50%)]" />
                      </div>
                    )}
                  </div>

                  {/* Quick replies */}
                  {currentAssistant.quickReplies && currentAssistant.quickReplies.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center w-full">
                      {currentAssistant.quickReplies.map((qr, qi) => (
                        <button
                          key={qi}
                          onClick={() => sendMessage(qr)}
                          disabled={isLoading}
                          className="px-4 py-2 rounded-full bg-white border-2 border-[hsl(25,60%,75%)] text-[hsl(25,70%,40%)] text-sm font-medium hover:bg-[hsl(25,80%,95%)] hover:border-[hsl(25,70%,55%)] hover:scale-105 transition-all shadow-sm disabled:opacity-50"
                        >
                          {qr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Loading state */}
              {isLoading && !currentAssistant?.content && (
                <div className="flex justify-center">
                  <div className="bg-white rounded-full px-4 py-2 shadow-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[hsl(25,70%,50%)]" />
                    <span className="text-xs text-muted-foreground">小安思考中...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom input bar */}
        <div className="border-t border-[hsl(25,30%,90%)]/60 bg-white/80 backdrop-blur px-3 py-2.5 flex gap-2 items-center">
          <Input
            placeholder="或輸入文字..."
            className="flex-1 !min-h-[40px] !h-10 text-sm border-border rounded-full px-4"
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
          <button
            onClick={handleMicToggle}
            disabled={isLoading || isTranscribing}
            className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all shadow-md ${
              isRecording
                ? "bg-red-500 text-white animate-pulse scale-110"
                : "bg-gradient-to-br from-[hsl(25,80%,60%)] to-[hsl(15,75%,50%)] text-white hover:scale-110"
            } disabled:opacity-50`}
            title={isRecording ? "停止錄音" : "語音輸入"}
          >
            {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          </button>
          {input.trim() && (
            <Button
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
              style={{ background: "hsl(25, 70%, 55%)" }}
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
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
