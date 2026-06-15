import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speech-to-text`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const AUTH_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function useVoiceChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const currentAbortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast({ title: "無法存取麥克風", description: "請確認瀏覽器已授權麥克風權限", variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        setIsRecording(false);
        setIsTranscribing(true);

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          
          // Convert to base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((res, rej) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              res(result.split(",")[1]);
            };
            reader.onerror = rej;
            reader.readAsDataURL(audioBlob);
          });

          const resp = await fetch(STT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${AUTH_KEY}`,
            },
            body: JSON.stringify({ audio: base64 }),
          });

          if (!resp.ok) throw new Error("語音辨識失敗");
          const data = await resp.json();
          resolve(data.text || null);
        } catch (e) {
          console.error("STT error:", e);
          toast({ title: "語音辨識失敗", description: "請稍後再試", variant: "destructive" });
          resolve(null);
        } finally {
          setIsTranscribing(false);
          // Stop all tracks
          recorder.stream.getTracks().forEach((t) => t.stop());
        }
      };

      recorder.stop();
    });
  }, [toast]);

  const playTTS = useCallback(async (text: string, messageIndex: number, options?: { forceRestart?: boolean }) => {
    // Always cancel any in-flight/playing audio first
    const wasPlayingSame = playingMessageIndex === messageIndex;
    playTokenRef.current += 1;
    if (currentAbortRef.current) {
      try { currentAbortRef.current.abort(); } catch {}
      currentAbortRef.current = null;
    }
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch {}
      currentAudioRef.current = null;
    }
    if (wasPlayingSame && !options?.forceRestart) {
      // Toggle off: don't start a new one
      setPlayingMessageIndex(null);
      return;
    }

    const myToken = playTokenRef.current;
    const abort = new AbortController();
    currentAbortRef.current = abort;
    setPlayingMessageIndex(messageIndex);

    try {
      const cleanText = text
        .replace(/[#*_~`>]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n+/g, "。")
        .trim();

      if (!cleanText) {
        setPlayingMessageIndex(null);
        return;
      }

      const resp = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AUTH_KEY}`,
        },
        body: JSON.stringify({ text: cleanText.slice(0, 500) }),
        signal: abort.signal,
      });

      if (myToken !== playTokenRef.current) return; // superseded
      if (!resp.ok) throw new Error("語音合成失敗");
      const data = await resp.json();
      if (myToken !== playTokenRef.current) return;

      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        if (currentAudioRef.current === audio) {
          setPlayingMessageIndex(null);
          currentAudioRef.current = null;
        }
      };
      audio.onerror = () => {
        if (currentAudioRef.current === audio) {
          setPlayingMessageIndex(null);
          currentAudioRef.current = null;
        }
      };

      await audio.play();
      if (myToken !== playTokenRef.current) {
        try { audio.pause(); } catch {}
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error("TTS error:", e);
      toast({ title: "語音播放失敗", description: "請稍後再試", variant: "destructive" });
      setPlayingMessageIndex(null);
    }
  }, [playingMessageIndex, toast]);

  const stopPlayback = useCallback(() => {
    playTokenRef.current += 1;
    if (currentAbortRef.current) {
      try { currentAbortRef.current.abort(); } catch {}
      currentAbortRef.current = null;
    }
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch {}
      currentAudioRef.current = null;
    }
    setPlayingMessageIndex(null);
  }, []);

  return {
    isRecording,
    isTranscribing,
    playingMessageIndex,
    startRecording,
    stopRecording,
    playTTS,
    stopPlayback,
  };
}
