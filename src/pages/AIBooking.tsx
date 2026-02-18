import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Send, Loader2, ArrowLeft, RotateCcw, User, Mic, MicOff, Volume2, VolumeX, Square, ClipboardList, MessageCircle, Settings, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubdomain } from "@/hooks/use-subdomain";
import { SEOHead } from "@/components/SEOHead";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import assistantAvatar from "@/assets/assistant-avatar-xiaoan.png";
import { sanitizeAIContent } from "@/utils/sanitizeHtml";
import { getThemeClassByAccommodation } from "@/constants/themes";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  toolCalls?: {
    type: string;
    data: any;
  }[];
  quickReplies?: string[];
  showDatePicker?: "check-in" | "check-out" | "range";
  selectedDates?: {
    checkIn?: Date;
    checkOut?: Date;
  };
}

export default function AIBooking() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { accommodationId } = useSubdomain();

  // 使用共用主題常數
  const themeClass = getThemeClassByAccommodation(accommodationId);
  const [accommodationName, setAccommodationName] = useState<string>("載入中...");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "您好！我是小安，您的專屬 AI 管家 😊\n我可以協助您查詢房型、檢查空房、了解價格，並直接完成訂房！\n有任何問題都可以隨時問我喔～",
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
  const [selectedCheckIn, setSelectedCheckIn] = useState<Date>();
  const [selectedCheckOut, setSelectedCheckOut] = useState<Date>();
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(() => searchParams.get('tab') === 'settings');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // 獲取住宿名稱
  useEffect(() => {
    const fetchAccommodationName = async () => {
      if (!accommodationId) return;
      
      const { data } = await supabase
        .from('accommodation_info')
        .select('name')
        .eq('id', accommodationId)
        .maybeSingle();
      
      if (data?.name) {
        setAccommodationName(data.name);
      }
    };
    
    fetchAccommodationName();
  }, [accommodationId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
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
            messages: (newMessages.length > 28 ? newMessages.slice(newMessages.length - 28) : newMessages).map(m => {
              // Include tool call context in message content so AI knows what was already shown
              let content = m.content;
              if (m.role === 'assistant' && m.toolCalls?.length) {
                const toolContext = m.toolCalls.map(tc => {
                  if (tc.type === 'rooms') {
                    const roomNames = tc.data.map((r: any) => r.name).join('、');
                    return `[系統：已向客人展示房型卡片：${roomNames}]`;
                  }
                  if (tc.type === 'booking' && tc.data?.success) {
                    return `[系統：已成功建立訂單 ${tc.data.order_number}]`;
                  }
                  if (tc.type === 'discount') {
                    return `[系統：折扣碼驗證結果 - ${tc.data.is_valid ? '有效' : '無效'}]`;
                  }
                  return '';
                }).filter(Boolean).join('\n');
                if (toolContext) {
                  content = (content || '') + '\n' + toolContext;
                }
              }
              return { role: m.role, content };
            }),
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
              // Check if rooms were already shown in previous messages
              const roomsAlreadyShown = newMessages.some(
                m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.type === 'rooms')
              );

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
                
                const toolCalls = parsed.results.map((r: any) => {
                  if (r.result?.rooms) {
                    // Skip rendering room cards if already shown
                    if (roomsAlreadyShown) return null;
                    return { type: 'rooms', data: r.result.rooms };
                  }
                  if (r.result?.success !== undefined) {
                    return { type: 'booking', data: r.result };
                  }
                  if (r.result?.is_valid !== undefined) {
                    return { type: 'discount', data: r.result };
                  }
                  return { type: 'unknown', data: r.result };
                }).filter(Boolean);

                updated[updated.length - 1] = {
                  ...lastMsg,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined
                };
                
                return updated;
              });
              continue;
            }

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              
              // Parse [SUGGEST: option1 | option2 | option3] markers from AI response
              let quickReplies: string[] = [];
              let showDatePicker: "check-in" | "check-out" | "range" | undefined = undefined;
              let displayContent = assistantMessage;
              
              // Extract SUGGEST markers
              const suggestMatch = assistantMessage.match(/\[SUGGEST:\s*([^\]]+)\]/);
              if (suggestMatch) {
                quickReplies = suggestMatch[1].split('|').map(s => s.trim()).filter(Boolean);
                displayContent = assistantMessage.replace(/\[SUGGEST:\s*[^\]]+\]/, '').trim();
              }
              
              // Date picker detection deferred to after streaming completes
              // to avoid calendar flicker during token-by-token rendering
              const lowerContent = displayContent.toLowerCase();

              // Update booking step based on context
              if (lowerContent.includes('房型') || lowerContent.includes('選擇')) {
                if (bookingStep < 2) setBookingStep(2);
              }
              if (lowerContent.includes('姓名') || lowerContent.includes('手機') || lowerContent.includes('聯絡')) {
                if (bookingStep < 3) setBookingStep(3);
              }
              if (lowerContent.includes('確認') && lowerContent.includes('訂單')) {
                if (bookingStep < 4) setBookingStep(4);
              }
              
              // Fallback: if AI didn't provide SUGGEST markers, use keyword detection
              if (quickReplies.length === 0) {
                if (lowerContent.includes('房型') && !lowerContent.includes('已選擇')) {
                  quickReplies = ["查看所有房型", "幫我推薦"];
                } else if (lowerContent.includes('姓名') || lowerContent.includes('手機')) {
                  quickReplies = ["確認無誤", "需要修改"];
                } else if (lowerContent.includes('確認') && lowerContent.includes('訂單')) {
                  quickReplies = ["確認訂房", "我再想想"];
                }
              }
              
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: displayContent,
                  quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
                  // No showDatePicker during streaming to avoid flicker
                };
                return updated;
              });
            }
          } catch (e) {
            console.error("解析失敗:", e);
          }
        }
      }

      // Date picker is now only shown via explicit user flow (handleSelectRoom)
      // No automatic keyword-based detection to avoid false positives

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

  // 本地取得房型並顯示卡片
  const fetchAndShowRoomTypes = async () => {
    if (!accommodationId) return;
    
    // 加入使用者訊息
    setMessages(prev => [...prev, { role: "user", content: "查看房型資訊", timestamp: new Date() }]);
    setIsLoading(true);

    try {
      // 取得房型
      const { data: roomTypes } = await supabase
        .from('room_types')
        .select('id, name, description, capacity, base_price, size_sqm, display_order')
        .eq('accommodation_id', accommodationId)
        .order('display_order', { ascending: true });

      if (!roomTypes || roomTypes.length === 0) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "目前尚未設定房型資訊，請稍後再試。",
          timestamp: new Date(),
        }]);
        setIsLoading(false);
        return;
      }

      // 取得房型照片
      const roomTypeIds = roomTypes.map(r => r.id);
      const { data: photos } = await supabase
        .from('room_photos')
        .select('room_type_id, photo_url, display_order')
        .in('room_type_id', roomTypeIds)
        .order('display_order', { ascending: true });

      // 取得庫存價格範圍
      const { data: inventory } = await supabase
        .from('room_inventory_pricing')
        .select('room_type_id, price, price_2_meals, price_3_meals')
        .in('room_type_id', roomTypeIds);

      // 組合房型資料
      const roomData = roomTypes.map(room => {
        const roomPhotos = photos?.filter(p => p.room_type_id === room.id).map(p => p.photo_url) || [];
        const roomInventory = inventory?.filter(i => i.room_type_id === room.id) || [];
        
        const prices = roomInventory.map(i => i.price).filter(Boolean);
        const prices2 = roomInventory.map(i => i.price_2_meals).filter(Boolean) as number[];
        const prices3 = roomInventory.map(i => i.price_3_meals).filter(Boolean) as number[];

        return {
          ...room,
          photos: roomPhotos,
          min_price: prices.length > 0 ? Math.min(...prices) : null,
          max_price: prices.length > 0 ? Math.max(...prices) : null,
          min_2_meals: prices2.length > 0 ? Math.min(...prices2) : null,
          max_2_meals: prices2.length > 0 ? Math.max(...prices2) : null,
          min_3_meals: prices3.length > 0 ? Math.min(...prices3) : null,
          max_3_meals: prices3.length > 0 ? Math.max(...prices3) : null,
        };
      });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: "以下是我們的房型介紹，點擊您感興趣的房型即可開始選擇日期 😊",
        timestamp: new Date(),
        toolCalls: [{ type: 'rooms', data: roomData }],
      }]);
    } catch (error) {
      console.error('取得房型失敗:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "抱歉，取得房型資訊時發生錯誤，請稍後再試。",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 選擇房型後顯示確認訊息 + 日期選擇器
  const handleSelectRoom = (roomName: string) => {
    // 加入使用者選擇訊息
    setMessages(prev => [
      ...prev,
      { role: "user", content: `我選擇了「${roomName}」`, timestamp: new Date() },
      {
        role: "assistant",
        content: `好的！您已選擇「${roomName}」🎉\n請選擇您的入住與退房日期：`,
        timestamp: new Date(),
        showDatePicker: "range" as const,
      }
    ]);
    if (bookingStep < 2) setBookingStep(2);
  };

  // 處理快速回覆點擊
  const handleQuickReply = (reply: string) => {
    if (reply === '查看房型資訊') {
      fetchAndShowRoomTypes();
    } else {
      sendMessageWithContent(reply);
    }
  };

  const handleRestart = () => {
    setMessages([
      {
        role: "assistant",
        content: "您好！我是森山寫照的 AI 管家 😊\n\n我可以直接幫您完成訂房！請問您想什麼時候入住呢？\n\n請提供您的：\n📅 入住日期\n📅 退房日期",
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
            voice: 'nova' // OpenAI TTS 語音（適合中文）
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

  const [mobileTab, setMobileTab] = useState<"chat" | "voice" | "settings">("chat");

  return (
    <div className={`h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20 ${themeClass}`}>
      <SEOHead
        title={`${accommodationName} - AI 管家`}
        description="使用 AI 管家快速完成訂房流程，即時查詢房型、價格和空房狀況"
        keywords={["AI 管家", "智能助手", "線上訂房", accommodationName]}
      />

      {/* 頂部導航 - 手機版精簡 */}
      <div className="hidden md:block bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-3 py-3 md:px-4 md:py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">返回首頁</span>
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="text-center">
              <h1 className="text-base md:text-xl font-bold">{accommodationName}</h1>
            </div>
          </div>

          {/* 桌面版工具列 */}
          <div className="hidden md:flex items-center gap-2">
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
              重新開始
            </Button>
          </div>

          {/* 手機版只顯示重新開始 */}
          <div className="flex md:hidden items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRestart}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="md:container md:mx-auto md:px-4 md:py-6 md:max-w-4xl flex-1 flex flex-col min-h-0">
        <Card className="shadow-none md:shadow-2xl overflow-hidden border-0 md:border md:border-primary/20 md:h-[calc(100vh-200px)] flex-1 flex flex-col rounded-none md:rounded-xl mb-[120px] md:mb-0">
          {/* 訊息區域 */}
          <ScrollArea className="flex-1 p-3 md:p-6" ref={scrollRef}>
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
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer" onClick={() => setShowAvatarLightbox(true)}>
                        <Avatar className="h-14 w-14 border-3 border-primary/30 shadow-lg ring-2 ring-primary/10 transition-transform hover:scale-110">
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
                        {/* Sanitize AI-generated content to prevent XSS attacks */}
                        {message.role === "assistant" 
                          ? sanitizeAIContent(message.content) 
                          : message.content}
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
                                       {room.min_price && room.max_price ? (
                                         <div className="flex items-center justify-between text-sm">
                                           <span className="text-muted-foreground">純住宿</span>
                                           <span className="font-semibold text-primary text-base">
                                             {room.min_price === room.max_price 
                                               ? `NT$ ${room.min_price.toLocaleString()}`
                                               : `NT$ ${room.min_price.toLocaleString()} ~ ${room.max_price.toLocaleString()}`
                                             }
                                           </span>
                                         </div>
                                       ) : (
                                         <div className="flex items-center justify-between text-sm">
                                           <span className="text-muted-foreground">參考價格</span>
                                           <span className="font-semibold text-primary text-base">
                                             NT$ {room.base_price?.toLocaleString()}
                                           </span>
                                         </div>
                                       )}
                                       {room.min_2_meals && (
                                         <div className="flex items-center justify-between text-sm">
                                           <span className="text-muted-foreground">一泊二食</span>
                                           <span className="font-semibold text-primary">
                                             {room.min_2_meals === room.max_2_meals
                                               ? `NT$ ${room.min_2_meals.toLocaleString()}`
                                               : `NT$ ${room.min_2_meals.toLocaleString()} ~ ${room.max_2_meals.toLocaleString()}`
                                             }
                                           </span>
                                         </div>
                                       )}
                                       {room.min_3_meals && (
                                         <div className="flex items-center justify-between text-sm">
                                           <span className="text-muted-foreground">一泊三食</span>
                                           <span className="font-semibold text-primary">
                                             {room.min_3_meals === room.max_3_meals
                                               ? `NT$ ${room.min_3_meals.toLocaleString()}`
                                               : `NT$ ${room.min_3_meals.toLocaleString()} ~ ${room.max_3_meals.toLocaleString()}`
                                             }
                                           </span>
                                         </div>
                                       )}
                                     </div>
                                    
                                    {/* 選擇按鈕 */}
                                    <Button
                                      size="default"
                                      variant="default"
                                      className="w-full shadow-md hover:shadow-lg transition-all duration-300"
                                      onClick={() => handleSelectRoom(room.name)}
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
                            <div className="border rounded-xl overflow-hidden bg-success/10 border-success/30 shadow-lg">
                              <div className="bg-success/20 px-5 py-4 border-b border-success/30">
                                <div className="flex items-center gap-3 text-success font-semibold text-lg">
                                  <span className="text-2xl">✅</span>
                                  <span>訂單創建成功！</span>
                                </div>
                              </div>
                              
                              <div className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">訂單編號</span>
                                  <span className="font-mono font-semibold text-success text-lg">
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
                  
                  {/* 日期選擇器 */}
                  {message.role === "assistant" && message.showDatePicker && (
                    <div className="mt-3">
                      <Card className="p-3 bg-background/50 border">
                        <Calendar
                          mode="range"
                          selected={{
                            from: selectedCheckIn,
                            to: selectedCheckOut,
                          }}
                          onSelect={(range) => {
                            setSelectedCheckIn(range?.from);
                            setSelectedCheckOut(range?.to);
                          }}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          numberOfMonths={2}
                          locale={zhTW}
                          className="pointer-events-auto"
                          variant="frontend"
                        />
                        <Button
                          onClick={() => {
                            if (selectedCheckIn && selectedCheckOut) {
                              // Use local date formatting to avoid UTC shift
                              const formatLocal = (d: Date) => {
                                const y = d.getFullYear();
                                const m = String(d.getMonth() + 1).padStart(2, '0');
                                const dd = String(d.getDate()).padStart(2, '0');
                                return `${y}-${m}-${dd}`;
                              };
                              const dateMessage = `入住日期：${formatLocal(selectedCheckIn)}，退房日期：${formatLocal(selectedCheckOut)}`;
                              sendMessageWithContent(dateMessage);
                              setSelectedCheckIn(undefined);
                              setSelectedCheckOut(undefined);
                            } else {
                              toast({
                                title: "請選擇日期",
                                description: "請選擇入住和退房日期",
                                variant: "destructive"
                              });
                            }
                          }}
                          disabled={!selectedCheckIn || !selectedCheckOut || isLoading}
                          className="w-full mt-3"
                          size="sm"
                        >
                          確認
                        </Button>
                      </Card>
                    </div>
                  )}
                  
                  {/* 快速回覆按鈕 */}
                  {message.role === "assistant" && message.quickReplies && message.quickReplies.length > 0 && index === messages.length - 1 && (
                    <div className="mt-3 flex flex-wrap gap-2 ml-[68px] md:ml-[72px]">
                      {message.quickReplies.map((reply, replyIdx) => (
                        <Button
                          key={replyIdx}
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickReply(reply)}
                          disabled={isLoading}
                          className="text-sm border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm hover:shadow-md transition-all duration-200 rounded-full px-4"
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

          {/* 桌面版輸入區域 */}
          <div className="hidden md:block p-6 border-t bg-background/50 backdrop-blur-sm">
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

      {/* 手機版固定底部：輸入框 + Tab 列 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] z-50">
        {/* 輸入框 */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isRecording ? "🎤 錄音中..." : "輸入訊息..."}
              disabled={isLoading || isRecording}
              className="flex-1 h-10 text-sm rounded-full px-4 focus:ring-2 focus:ring-primary/20"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* 設定面板 */}
        {showSettingsPanel && (
          <div className="px-3 py-3 border-t border-border/30 bg-muted/30 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">語音輸入</span>
              <button
                onClick={toggleRecording}
                disabled={isLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                  isRecording 
                    ? "text-destructive bg-destructive/10 animate-pulse" 
                    : "text-muted-foreground hover:text-primary hover:bg-primary/5 border border-border"
                }`}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{isRecording ? "停止錄音" : "開始錄音"}</span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">語音播放</span>
              <button
                onClick={toggleVoice}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 border ${
                  isVoiceEnabled 
                    ? "text-primary bg-primary/5 border-primary/30" 
                    : "text-muted-foreground hover:text-primary hover:bg-primary/5 border-border"
                }`}
              >
                {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                <span>{isVoiceEnabled ? "已開啟" : "已關閉"}</span>
              </button>
            </div>
            {isPlayingAudio && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">正在播放</span>
                <button
                  onClick={stopAudio}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive bg-destructive/10 transition-all duration-200"
                >
                  <Square className="h-4 w-4" />
                  <span>停止播放</span>
                </button>
              </div>
            )}
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200 border border-border"
            >
              <RotateCcw className="h-4 w-4" />
              <span>重新開始對話</span>
            </button>
          </div>
        )}

        {/* 底部功能 Tab 列 */}
        <div className="flex items-center justify-around px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] border-t border-border/30">
          {/* 對話 */}
          <button
            onClick={() => { setShowSettingsPanel(false); searchParams.delete('tab'); setSearchParams(searchParams, { replace: true }); }}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 ${
              !showSettingsPanel
                ? "text-primary bg-primary/5"
                : "text-muted-foreground hover:text-primary hover:bg-primary/5"
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-[10px] font-medium">對話</span>
          </button>

          {/* 訂單 */}
          <button
            onClick={() => navigate('/order-search?from=ai-booking')}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
          >
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] font-medium">訂單</span>
          </button>

          {/* 我的 */}
          <button
            onClick={() => navigate('/profile?from=ai-booking')}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
          >
            <UserCircle className="h-5 w-5" />
            <span className="text-[10px] font-medium">我的</span>
          </button>

          {/* 設定 */}
          <button
            onClick={() => setShowSettingsPanel(prev => !prev)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 ${
              showSettingsPanel 
                ? "text-primary bg-primary/5" 
                : "text-muted-foreground hover:text-primary hover:bg-primary/5"
            }`}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px] font-medium">設定</span>
          </button>
        </div>
      </div>
      
      {/* 小安頭像大圖 */}
      {showAvatarLightbox && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowAvatarLightbox(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img 
              src={assistantAvatar} 
              alt="小安" 
              className="w-64 h-64 md:w-80 md:h-80 rounded-full object-cover shadow-2xl border-4 border-background"
            />
            <button
              onClick={() => setShowAvatarLightbox(false)}
              className="absolute -top-2 -right-2 bg-background text-foreground rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-muted transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
