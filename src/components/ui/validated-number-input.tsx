import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ValidatedNumberInputProps extends Omit<React.ComponentProps<"input">, 'type' | 'onChange' | 'onBlur'> {
  label?: string;
  error?: string;
  required?: boolean;
  prefix?: string;
  suffix?: string;
  showSuccessState?: boolean;
  onChange?: (value: number) => void;
  onBlur?: (value: number) => void;
  onValidate?: (value: string) => void;
}

const ValidatedNumberInput = React.forwardRef<HTMLInputElement, ValidatedNumberInputProps>(
  ({ 
    label, 
    error, 
    required = false,
    prefix,
    suffix,
    showSuccessState = false,
    onChange,
    onBlur,
    onValidate,
    className,
    ...props 
  }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const numValue = value === '' ? 0 : parseInt(value) || 0;
      onChange?.(numValue);
      onValidate?.(value);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const numValue = value === '' ? 0 : parseInt(value) || 0;
      setIsFocused(false);
      onBlur?.(numValue);
      onValidate?.(value);
      
      if (showSuccessState && !error && value.length > 0) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      }
    };

    const handleFocus = () => {
      setIsFocused(true);
    };

    const hasValue = props.value !== undefined && props.value !== null && String(props.value).length > 0;
    const isValid = showSuccessState && !error && hasValue && !isFocused;

    const inputElement = (
      <div className="relative flex-1">
        <Input
          ref={ref}
          type="number"
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          className={cn(
            "transition-all duration-200",
            error && "border-destructive focus-visible:ring-destructive/20 animate-shake",
            isValid && "border-success focus-visible:ring-success/20",
            isFocused && !error && "ring-2 ring-primary/20",
            className
          )}
          {...props}
        />
        {isValid && showSuccess && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success animate-scale-in" />
        )}
      </div>
    );

    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={props.id} className="transition-colors duration-200">
            {label}
            {required && <span className="text-destructive ml-1 animate-pulse">*</span>}
          </Label>
        )}
        {(prefix || suffix) ? (
          <div className="flex items-center gap-2">
            {prefix && <span className="text-sm text-muted-foreground transition-colors duration-200">{prefix}</span>}
            {inputElement}
            {suffix && <span className="text-sm text-muted-foreground transition-colors duration-200">{suffix}</span>}
          </div>
        ) : (
          inputElement
        )}
        {error && (
          <div className="flex items-start gap-1.5 text-destructive text-xs sm:text-sm mt-1.5 animate-fade-in">
            <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0 mt-0.5 animate-pulse" />
            <span className="break-words leading-relaxed flex-1">{error}</span>
          </div>
        )}
      </div>
    );
  }
);

ValidatedNumberInput.displayName = "ValidatedNumberInput";

export { ValidatedNumberInput };
