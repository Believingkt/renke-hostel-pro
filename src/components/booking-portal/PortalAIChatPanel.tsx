import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Send, Loader2, RotateCcw, Mic, Volume2, VolumeX, Sparkles, Calendar, Users, MapPin, BedDouble, Minus, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import assistantAvatar from "@/assets/assistant-avatar-xiaoan.png?inline";
import ReactMarkdown from "react-markdown";
import { parseRoomListings, ChatRoomCard } from "./ChatRoomCard";
import { format, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  quickReplies?: string[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-ai-chat`;

// 智慧預設值：明天入住、宜蘭
function getSmartDefault() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return {
    date: d,
    dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
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
  const [defaultGuests, setDefaultGuests] = useState(14);
  const [defaultRooms, setDefaultRooms] = useState(6);
  const [checkIn, setCheckIn] = useState<Date>(smartDefault.date);
  const [checkOut, setCheckOut] = useState<Date>(addDays(smartDefault.date, 1));
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isRecording, isTranscribing, playingMessageIndex, startRecording, stopRecording, playTTS, stopPlayback } = useVoiceChat();
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("portal_ai_auto_speak") === "1";
  });
  const toggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("portal_ai_auto_speak", next ? "1" : "0"); } catch {}
      if (!next) {
        lastSpokenIndexRef.current = -1;
        stopPlayback();
      }
      return next;
    });
  };

  // 自動捲到底部
  useEffect(() => {
    const el = focusRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);



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
          session_id: (() => {
            try {
              let sid = sessionStorage.getItem("ai_chat_session_id");
              if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem("ai_chat_session_id", sid); }
              return sid;
            } catch { return crypto.randomUUID(); }
          })(),
          context: {
            check_in_date: format(checkIn, "yyyy-MM-dd"),
            check_out_date: format(checkOut, "yyyy-MM-dd"),
            guest_count: defaultGuests,
          },

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

  // 自動播放最新 AI 回覆（需使用者開啟朗讀）
  const lastSpokenIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!autoSpeak) {
      stopPlayback();
      return;
    }
    if (isLoading) return;
    if (messages.length === 0) return;
    const idx = messages.length - 1;
    const last = messages[idx];
    if (last.role !== "assistant" || !last.content) return;
    if (lastSpokenIndexRef.current === idx) return;
    lastSpokenIndexRef.current = idx;
    const timer = setTimeout(() => playTTS(last.content, idx, { forceRestart: true }), 300);
    return () => clearTimeout(timer);
  }, [isLoading, autoSpeak, messages.length]);

  const isAssistantSpeaking = playingMessageIndex !== null;

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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAutoSpeak}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              title={autoSpeak ? "關閉自動朗讀" : "開啟自動朗讀"}
            >
              {autoSpeak ? <Volume2 className="h-3.5 w-3.5 mr-1 text-[hsl(25,70%,55%)]" /> : <VolumeX className="h-3.5 w-3.5 mr-1" />}
              {autoSpeak ? "朗讀開" : "朗讀關"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs text-muted-foreground hover:text-foreground" title="重新開始">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              重來
            </Button>
          </div>
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

              {/* Smart default with adjustable guests & rooms */}
              <div className="w-full max-w-sm rounded-2xl border border-[hsl(25,60%,80%)] bg-white/80 backdrop-blur p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(25,70%,50%)]" />
                  <span className="text-[11px] font-semibold text-[hsl(25,70%,45%)] uppercase tracking-wide">幫您預設好了</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
                  <MapPin className="h-3.5 w-3.5" />宜蘭
                </div>

                {/* Date pickers */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto py-2 px-3 flex flex-col items-start gap-0.5 bg-[hsl(25,60%,97%)] border-[hsl(25,40%,88%)] hover:bg-white"
                      >
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />入住
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {format(checkIn, "M/d (EEE)", { locale: zhTW })}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={checkIn}
                        onSelect={(d) => {
                          if (!d) return;
                          setCheckIn(d);
                          if (checkOut <= d) setCheckOut(addDays(d, 1));
                          setCheckInOpen(false);
                          setTimeout(() => setCheckOutOpen(true), 150);
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto py-2 px-3 flex flex-col items-start gap-0.5 bg-[hsl(25,60%,97%)] border-[hsl(25,40%,88%)] hover:bg-white"
                      >
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />退房
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {format(checkOut, "M/d (EEE)", { locale: zhTW })}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={checkOut}
                        onSelect={(d) => {
                          if (!d) return;
                          setCheckOut(d);
                          setCheckOutOpen(false);
                        }}
                        disabled={(date) => date <= checkIn}
                        defaultMonth={checkIn}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Adjustable rows */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between rounded-lg bg-[hsl(25,60%,97%)] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      <Users className="h-4 w-4 text-muted-foreground" />入住人數
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full text-foreground"
                        onClick={(e) => { e.stopPropagation(); setDefaultGuests(Math.max(1, defaultGuests - 1)); }}
                        disabled={defaultGuests <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums text-foreground">{defaultGuests}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full text-foreground"
                        onClick={(e) => { e.stopPropagation(); setDefaultGuests(Math.min(50, defaultGuests + 1)); }}
                        disabled={defaultGuests >= 50}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full h-10 rounded-xl text-white font-medium"
                  style={{ background: "hsl(25, 70%, 55%)" }}
                  onClick={() => {
                    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
                    const inIso = format(checkIn, "yyyy-MM-dd");
                    const outIso = format(checkOut, "yyyy-MM-dd");
                    sendMessage(
                      `幫我查 ${inIso} 入住、${outIso} 退房（共 ${nights} 晚），${defaultGuests} 人，宜蘭，列出可預訂房型`
                    );
                  }}
                  disabled={isLoading}
                >
                  一鍵開始找房 →
                </Button>
              </div>

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
              {messages.map((msg, mi) => {
                const isLatestAssistant = msg.role === "assistant" && mi === messages.length - 1;
                if (msg.role === "user") {
                  return (
                    <div key={mi} className="flex justify-end">
                      <div className="max-w-[85%] bg-[hsl(25,70%,50%)] text-white rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                // assistant
                const speaking = playingMessageIndex === mi;
                return (
                  <div key={mi} className="flex flex-col items-center gap-3">
                    <div className="w-full bg-white/90 backdrop-blur rounded-2xl px-4 py-3 shadow-sm border border-[hsl(25,30%,92%)] relative">

                      {msg.content ? (
                        (() => {
                          const parsed = parseRoomListings(msg.content);
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
                            <div className={`prose prose-sm max-w-none [&>p]:my-0 text-foreground leading-relaxed ${isLatestAssistant ? "text-base text-center" : "text-sm"}`}>
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-5 w-5 animate-spin text-[hsl(25,70%,50%)]" />
                        </div>
                      )}
                    </div>

                    {isLatestAssistant && msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-center w-full">
                        {msg.quickReplies.map((qr, qi) => (
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
                );
              })}

              {/* Loading state when waiting for first token */}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
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
            className="flex-1 !min-h-[40px] !h-10 text-sm text-foreground border-border rounded-full px-4"
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
