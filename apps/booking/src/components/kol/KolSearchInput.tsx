import { useEffect, useRef } from "react";
import { Input } from "@lakeze/shared/components/ui/input";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  className?: string;
  testId?: string;
};

// 搜尋框：避免 iOS Safari 誤判為帳號欄（關閉自動填入）。
// 注音／拼音選字中不送出、不改寫 input（input 不受 React 控制），compositionend 才用最終文字送出。
export const KolSearchInput = ({ value, onValueChange, placeholder, className, testId }: Props) => {
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const lastSent = useRef(value);

  // 只有外部改值（例如清除搜尋）才寫回 input；選字中一律不動
  useEffect(() => {
    const el = ref.current;
    if (!el || composing.current) return;
    if (value !== lastSent.current && el.value !== value) el.value = value;
    lastSent.current = value;
  }, [value]);

  const send = (v: string) => {
    if (v === lastSent.current) return;
    lastSent.current = v;
    onValueChange(v);
  };

  const finishComposing = (v: string) => {
    composing.current = false;
    send(v);
  };

  return (
    <Input
      ref={ref}
      type="search"
      name="kol-list-search"
      inputMode="search"
      enterKeyHint="search"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      placeholder={placeholder}
      className={className}
      data-testid={testId}
      defaultValue={value}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => finishComposing(e.currentTarget.value)}
      onBlur={(e) => {
        // iOS 偶爾沒送 compositionend 就離開欄位
        if (composing.current) finishComposing(e.currentTarget.value);
      }}
      onChange={(e) => {
        if (composing.current || (e.nativeEvent as InputEvent).isComposing) return;
        send(e.target.value);
      }}
    />
  );
};
