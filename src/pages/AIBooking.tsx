import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, ArrowLeft, RotateCcw, User, Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubdomain } from "@/hooks/use-subdomain";
import { SEOHead } from "@/components/SEOHead";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import assistantAvatar from "@/assets/assistant-avatar-xiaoan.png";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
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
      content: "您好！我是小安，您的專屬 AI 訂房助手 😊\n我可以協助您查詢房型、檢查空房、了解價格，並直接完成訂房！\n有任何問題都可以隨時問我喔～",
      timestamp: new Date(),
      quickReplies: ["查看房型資訊", "了解旅宿特色", "入住須知"]
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [bookingStep, setBookingStep] = useState(1);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioQueue, setAudioQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      { role: "user", content, timestamp: new Date() }
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

      setMessages(prev => [...prev, { role: "assistant", content: "", timestamp: new Date() }]);

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

      // 串流結束後，先關閉 loading 狀態
      setIsLoading(false);
      
      // 然後播放完整的語音回覆（不影響 UI 顯示）
      if (assistantMessage && isVoiceEnabled) {
        playTextToSpeech(assistantMessage);
      }

    } catch (error) {
      console.error("發送訊息失敗:", error);
      toast({
        title: "發送失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
      
      setMessages(prev => prev.slice(0, -1));
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
        timestamp: new Date(),
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      toast({
        title: "🎤 開始錄音",
        description: "請說出您的問題，完成後再次點擊麥克風按鈕",
      });
    } catch (error) {
      console.error('錄音錯誤:', error);
      toast({
        title: "錄音失敗",
        description: "無法訪問麥克風，請確認已授予麥克風權限",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      toast({
        title: "⏸️ 錄音結束",
        description: "正在處理您的語音...",
      });
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data, error } = await supabase.functions.invoke('speech-to-text', {
          body: { audio: base64Audio }
        });

        if (error) throw error;

        if (data?.text) {
          setInput(data.text);
          toast({
            title: "✅ 語音識別成功",
            description: "已將語音轉換為文字，您可以編輯後發送",
          });
        }
      };
    } catch (error) {
      console.error('語音處理錯誤:', error);
      toast({
        title: "語音處理失敗",
        description: "無法處理您的語音，請重試或直接輸入文字",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const splitTextIntoSegments = (text: string): string[] => {
    // 清理文字（保留換行以識別段落，但移除過多的空白）
    const cleanText = text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // 移除 emoji
      .replace(/[\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\uDC00-\uDFFF]/g, '')
      .replace(/\*/g, '') // 移除星號
      .replace(/\n{3,}/g, '\n\n') // 將多個換行縮減為雙換行
      .replace(/[ \t]+/g, ' ') // 縮減空格
      .trim();

    if (!cleanText || cleanText.length < 2) return [];

    const segments: string[] = [];
    
    // 首先按段落分隔（雙換行或單換行）
    const paragraphs = cleanText.split(/\n+/);
    
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      
      // 對每個段落，如果太長就進一步分段
      if (paragraph.length <= 150) {
        // 段落不長，直接加入
        segments.push(paragraph.trim());
      } else {
        // 段落太長，按句子分段
        const sentences: string[] = [];
        let currentSentence = '';
        
        // 使用更細緻的分句規則
        const sentencePattern = /([^。！？；：、，\n]+[。！？；：、，\n]?)/g;
        const matches = paragraph.match(sentencePattern) || [paragraph];
        
        for (const match of matches) {
          const sentence = match.trim();
          if (!sentence) continue;
          
          // 判斷是否為句子結束標點
          const isEndPunctuation = /[。！？]$/.test(sentence);
          const isMiddlePunctuation = /[；：、，]$/.test(sentence);
          
          if (currentSentence.length === 0) {
            currentSentence = sentence;
          } else if (currentSentence.length + sentence.length <= 150) {
            // 還可以繼續累積
            currentSentence += sentence;
          } else {
            // 當前句子已經夠長，保存並開始新句
            if (currentSentence.trim()) {
              sentences.push(currentSentence.trim());
            }
            currentSentence = sentence;
          }
          
          // 如果遇到句子結束標點且已有一定長度，就分段
          if (isEndPunctuation && currentSentence.length >= 50) {
            if (currentSentence.trim()) {
              sentences.push(currentSentence.trim());
            }
            currentSentence = '';
          }
        }
        
        // 加入最後累積的句子
        if (currentSentence.trim()) {
          sentences.push(currentSentence.trim());
        }
        
        segments.push(...sentences);
      }
    }
    
    // 過濾太短的片段並返回
    return segments
      .map(s => s.trim())
      .filter(s => s.length >= 3);
  };

  const playAudioSegment = async (text: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('播放片段，長度:', text.length);
        
        const { data, error } = await supabase.functions.invoke('text-to-speech', {
          body: { 
            text: text, 
            voice: 'kGjJqO6wdwRN9iJsoeIC' // ElevenLabs 中文母語者語音 ID
          }
        });

        if (error) throw error;

        if (data?.audioContent) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
          audioRef.current = audio;
          
          audio.onended = () => {
            audioRef.current = null;
            resolve();
          };

          audio.onerror = (e) => {
            console.error('音頻播放失敗:', e);
            audioRef.current = null;
            reject(e);
          };

          await audio.play();
        } else {
          resolve();
        }
      } catch (error) {
        console.error('片段播放錯誤:', error);
        reject(error);
      }
    });
  };

  const processAudioQueue = async (segments: string[]) => {
    if (isProcessingQueue || segments.length === 0) return;
    
    setIsProcessingQueue(true);
    setIsPlayingAudio(true);
    
    try {
      for (let i = 0; i < segments.length; i++) {
        // 檢查是否被停止
        if (!isVoiceEnabled) {
          console.log('語音已關閉，停止播放');
          break;
        }
        
        const segment = segments[i];
        console.log(`播放第 ${i + 1}/${segments.length} 段（${segment.length} 字）: ${segment.substring(0, 20)}...`);
        await playAudioSegment(segment);
        
        // 根據文本內容決定停頓時間
        if (i < segments.length - 1) {
          // 判斷當前段落的結束標點
          const lastChar = segment.trim().slice(-1);
          let pauseDuration = 300; // 預設停頓
          
          if (lastChar === '。' || lastChar === '！' || lastChar === '？') {
            pauseDuration = 500; // 句號、驚嘆號、問號停頓較長
          } else if (lastChar === '；' || lastChar === '：') {
            pauseDuration = 400; // 分號、冒號中等停頓
          } else if (lastChar === '、' || lastChar === '，') {
            pauseDuration = 250; // 頓號、逗號短停頓
          }
          
          await new Promise(resolve => setTimeout(resolve, pauseDuration));
        }
      }
    } catch (error) {
      console.error('隊列處理錯誤:', error);
    } finally {
      setIsProcessingQueue(false);
      setIsPlayingAudio(false);
      setAudioQueue([]);
    }
  };

  const playTextToSpeech = async (text: string) => {
    if (!isVoiceEnabled || !text || isPlayingAudio) return;

    try {
      // 將文本分段
      const segments = splitTextIntoSegments(text);
      
      if (segments.length === 0) {
        console.log('沒有可播放的文本段落');
        return;
      }

      console.log(`文本已分為 ${segments.length} 段`);
      setAudioQueue(segments);
      
      // 開始處理隊列
      await processAudioQueue(segments);
      
    } catch (error) {
      console.error('語音播放錯誤:', error);
      setIsPlayingAudio(false);
      setIsProcessingQueue(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
    setIsProcessingQueue(false);
    setAudioQueue([]);
  };

  const toggleVoice = () => {
    const newState = !isVoiceEnabled;
    setIsVoiceEnabled(newState);
    
    // 如果關閉語音，停止當前播放
    if (!newState) {
      stopAudio();
    }

    toast({
      title: newState ? "🔊 語音已開啟" : "🔇 語音已關閉",
      description: newState ? "小安會用語音回覆您" : "小安只會顯示文字",
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

          <div className="flex items-center gap-2">
            {isPlayingAudio && (
              <Button
                variant="ghost"
                size="sm"
                onClick={stopAudio}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                title="停止語音"
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleVoice}
              className="text-primary-foreground hover:bg-primary-foreground/10"
              title={isVoiceEnabled ? "關閉語音" : "開啟語音"}
            >
              {isVoiceEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
            
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
      </div>

      {/* 主要內容區 */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="shadow-2xl overflow-hidden border-primary/20 h-[calc(100vh-200px)] flex flex-col">
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
                    className={`flex gap-3 items-start ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {/* AI 助手頭像和名字 */}
                    {message.role === "assistant" && (
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                        <Avatar className="h-14 w-14 border-3 border-primary/30 shadow-lg ring-2 ring-primary/10">
                          <AvatarImage src={assistantAvatar} alt="小安" className="object-cover" />
                          <AvatarFallback className="bg-primary text-primary-foreground text-base">小安</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold text-muted-foreground">小安</span>
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[75%]">
                      <div
                        className={`rounded-3xl px-4 py-3 md:px-5 md:py-3.5 whitespace-pre-wrap transition-all duration-300 ${
                          message.role === "user"
                            ? "bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                            : "bg-gradient-to-br from-muted to-muted/80 shadow-md border border-border/50"
                        }`}
                      >
                        {message.content}
                      </div>
                      
                      {/* 時間戳記 */}
                      {message.timestamp && (
                        <div className={`text-[10px] text-muted-foreground/60 px-2 ${
                          message.role === "user" ? "text-right" : "text-left"
                        }`}>
                          {new Date(message.timestamp).toLocaleTimeString('zh-TW', { 
                            hour: '2-digit', 
                            minute: '2-digit'
                          })}
                        </div>
                      )}
                    </div>

                    {/* 用戶頭像 */}
                    {message.role === "user" && (
                      <div className="flex flex-col items-center gap-1 flex-shrink-0 group">
                        <Avatar className="h-10 w-10 border-2 border-primary/20 shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-xl hover:border-primary/40 hover:-translate-y-1 cursor-pointer">
                          <AvatarFallback className="bg-primary text-primary-foreground transition-transform duration-300 group-hover:scale-105">
                            <User className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-muted-foreground transition-colors duration-300 group-hover:text-primary">訪客</span>
                      </div>
                    )}
                  </div>
                  
                  {/* 顯示工具調用結果 */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {message.toolCalls.map((tool, toolIdx) => (
                        <div key={toolIdx}>
                          {/* 房型列表 */}
                          {tool.type === 'rooms' && (
                            <div className="space-y-4 mt-4">
                              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2 px-1">
                                <span className="text-lg">🏠</span>
                                <span>為您推薦以下房型</span>
                              </p>
                              {tool.data.map((room: any, roomIdx: number) => (
                                <Card key={roomIdx} className="overflow-hidden hover:shadow-xl transition-all duration-300 border-primary/20 group">
                                  {/* 房型圖片 */}
                                  {room.photos && room.photos.length > 0 && (
                                    <div className="relative h-48 overflow-hidden bg-muted">
                                      <img 
                                        src={room.photos[0]} 
                                        alt={room.name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                                      <div className="absolute bottom-3 left-4 right-4">
                                        <h3 className="text-white text-xl font-bold drop-shadow-lg">{room.name}</h3>
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="p-4 space-y-3">
                                    {/* 房型資訊 */}
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-base">👥</span>
                                        <span>{room.capacity}人</span>
                                      </div>
                                      {room.size_sqm && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-base">📐</span>
                                          <span>{room.size_sqm}㎡</span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* 房型描述 */}
                                    {room.description && (
                                      <p className="text-sm text-muted-foreground line-clamp-2">
                                        {room.description}
                                      </p>
                                    )}
                                    
                                    {/* 價格資訊 */}
                                    <div className="bg-primary/5 rounded-lg p-3 space-y-1.5">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">平日價格</span>
                                        <span className="font-semibold text-primary text-base">
                                          NT$ {room.weekday_price?.toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">假日價格</span>
                                        <span className="font-semibold text-primary text-base">
                                          NT$ {room.weekend_price?.toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* 選擇按鈕 */}
                                    <Button
                                      size="default"
                                      variant="default"
                                      className="w-full shadow-md hover:shadow-lg transition-all duration-300"
                                      onClick={() => sendMessageWithContent(`我要預訂 ${room.name}`)}
                                      disabled={isLoading}
                                    >
                                      <span className="mr-2">✨</span>
                                      選擇此房型
                                    </Button>
                                  </div>
                                </Card>
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
              
              {/* 小安打字指示器 */}
              {isLoading && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <Avatar className="h-10 w-10 border-2 border-primary/20 shadow-sm">
                      <AvatarImage src={assistantAvatar} alt="小安" />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">小安</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-muted-foreground">小安</span>
                  </div>
                  
                  <div className="bg-muted rounded-2xl px-5 py-3 shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">小安正在輸入中</span>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* 輸入區域 */}
          <div className="p-4 md:p-6 border-t bg-background/50 backdrop-blur-sm">
            <div className="flex gap-3">
              <Button
                onClick={toggleRecording}
                disabled={isLoading}
                size="icon"
                variant={isRecording ? "destructive" : "outline"}
                className={`h-12 w-12 transition-all duration-200 ${isRecording ? "animate-pulse" : ""}`}
                title={isRecording ? "停止錄音" : "語音輸入"}
              >
                {isRecording ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isRecording ? "🎤 正在錄音中..." : "輸入訊息或點擊麥克風說話..."}
                disabled={isLoading || isRecording}
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
          </div>
        </Card>
      </div>
    </div>
  );
}
