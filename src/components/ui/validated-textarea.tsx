import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ValidatedTextareaProps extends Omit<React.ComponentProps<"textarea">, 'onChange' | 'onBlur'> {
  label?: string;
  error?: string;
  showCharCount?: boolean;
  maxLength?: number;
  required?: boolean;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  onValidate?: (value: string) => void;
}

const ValidatedTextarea = React.forwardRef<HTMLTextAreaElement, ValidatedTextareaProps>(
  ({ 
    label, 
    error, 
    showCharCount = false, 
    maxLength,
    required = false,
    onChange,
    onBlur,
    onValidate,
    className,
    ...props 
  }, ref) => {
    const [charCount, setCharCount] = React.useState(0);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setCharCount(value.length);
      onChange?.(value);
      onValidate?.(value);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      onBlur?.(value);
      onValidate?.(value);
    };

    React.useEffect(() => {
      if (props.value) {
        setCharCount(String(props.value).length);
      }
    }, [props.value]);

    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={props.id}>
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
        )}
        <Textarea
          ref={ref}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={maxLength}
          className={cn(error ? "border-destructive" : "", className)}
          {...props}
        />
        {error && (
          <div className="flex items-center gap-1 text-destructive text-sm">
            <AlertCircle className="h-3 w-3" />
            <span>{error}</span>
          </div>
        )}
        {showCharCount && maxLength && (
          <p className="text-xs text-muted-foreground">
            {charCount}/{maxLength} 字元
          </p>
        )}
      </div>
    );
  }
);

ValidatedTextarea.displayName = "ValidatedTextarea";

export { ValidatedTextarea };
