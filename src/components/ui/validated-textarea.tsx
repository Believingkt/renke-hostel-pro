import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ValidatedTextareaProps extends Omit<React.ComponentProps<"textarea">, 'onChange' | 'onBlur'> {
  label?: string;
  error?: string;
  showCharCount?: boolean;
  maxLength?: number;
  required?: boolean;
  showSuccessState?: boolean;
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
    showSuccessState = false,
    onChange,
    onBlur,
    onValidate,
    className,
    ...props 
  }, ref) => {
    const [charCount, setCharCount] = React.useState(0);
    const [isFocused, setIsFocused] = React.useState(false);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setCharCount(value.length);
      onChange?.(value);
      onValidate?.(value);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setIsFocused(false);
      onBlur?.(value);
      onValidate?.(value);
      
      if (showSuccessState && !error && value.length > 0) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      }
    };

    const handleFocus = () => {
      setIsFocused(true);
    };

    React.useEffect(() => {
      const valueLength = props.value != null ? String(props.value).length : 0;
      setCharCount(valueLength);
    }, [props.value]);

    const hasValue = props.value && String(props.value).length > 0;
    const isValid = showSuccessState && !error && hasValue && !isFocused;

    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={props.id} className="transition-colors duration-200">
            {label}
            {required && <span className="text-destructive ml-1 animate-pulse">*</span>}
          </Label>
        )}
        <div className="relative">
          <Textarea
            ref={ref}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            maxLength={maxLength}
            className={cn(
              "transition-all duration-200",
              error && "border-destructive focus-visible:ring-destructive/20 animate-shake",
              isValid && "border-green-500 focus-visible:ring-green-500/20",
              isFocused && !error && "ring-2 ring-primary/20",
              className
            )}
            {...props}
          />
          {isValid && showSuccess && (
            <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500 animate-scale-in" />
          )}
        </div>
        {error && (
          <div className="flex items-start gap-1.5 text-destructive text-xs sm:text-sm mt-1.5 animate-fade-in">
            <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0 mt-0.5 animate-pulse" />
            <span className="break-words leading-relaxed flex-1">{error}</span>
          </div>
        )}
        {showCharCount && maxLength && (
          <p className={cn(
            "text-[10px] sm:text-xs text-right transition-colors duration-200",
            charCount > maxLength * 0.9 ? "text-destructive font-medium" : "text-muted-foreground"
          )}>
            {charCount}/{maxLength} 字元
          </p>
        )}
      </div>
    );
  }
);

ValidatedTextarea.displayName = "ValidatedTextarea";

export { ValidatedTextarea };
