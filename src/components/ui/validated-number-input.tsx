import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ValidatedNumberInputProps extends Omit<React.ComponentProps<"input">, 'type' | 'onChange' | 'onBlur'> {
  label?: string;
  error?: string;
  required?: boolean;
  prefix?: string;
  suffix?: string;
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
    onChange,
    onBlur,
    onValidate,
    className,
    ...props 
  }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const numValue = value === '' ? 0 : parseInt(value) || 0;
      onChange?.(numValue);
      onValidate?.(value);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const numValue = value === '' ? 0 : parseInt(value) || 0;
      onBlur?.(numValue);
      onValidate?.(value);
    };

    const inputElement = (
      <Input
        ref={ref}
        type="number"
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(error ? "border-destructive" : "", className)}
        {...props}
      />
    );

    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={props.id}>
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
        )}
        {(prefix || suffix) ? (
          <div className="flex items-center gap-2">
            {prefix && <span className="text-sm">{prefix}</span>}
            {inputElement}
            {suffix && <span className="text-sm">{suffix}</span>}
          </div>
        ) : (
          inputElement
        )}
        {error && (
          <div className="flex items-center gap-1 text-destructive text-sm">
            <AlertCircle className="h-3 w-3" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }
);

ValidatedNumberInput.displayName = "ValidatedNumberInput";

export { ValidatedNumberInput };
