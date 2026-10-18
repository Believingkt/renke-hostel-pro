import { useEffect, useRef, useState } from "react";
import { Input } from "@lakeze/shared/components/ui/input";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  className?: string;
  testId?: string;
};

// 搜尋框：避免 iOS Safari 誤判為帳號欄（關閉自動填入）；注音／拼音選字完成才送出
export const KolSearchInput = ({ value, onValueChange, placeholder, className, testId }: Props) => {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);

  useEffect(() => {
    if (!composing.current) setDraft(value);
  }, [value]);

  return (
    <Input
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
      value={draft}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        setDraft(e.currentTarget.value);
        onValueChange(e.currentTarget.value);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        if (!composing.current) onValueChange(e.target.value);
      }}
    />
  );
};
