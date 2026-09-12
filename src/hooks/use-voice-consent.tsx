import { useCallback, useState } from "react";

const VOICE_CONSENT_KEY = "ai_voice_openai_consent_v1";

function readVoiceConsent() {
  try {
    return localStorage.getItem(VOICE_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

/** Separate consent required before microphone capture or speech transcription begins. */
export function useVoiceConsent() {
  const [granted, setGranted] = useState(readVoiceConsent);

  const grant = useCallback(() => {
    try {
      localStorage.setItem(VOICE_CONSENT_KEY, "granted");
    } catch {
      /* Consent still applies for the current session when storage is unavailable. */
    }
    setGranted(true);
  }, []);

  return { granted, grant };
}