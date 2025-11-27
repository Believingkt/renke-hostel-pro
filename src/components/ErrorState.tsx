import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ 
  title = "載入失敗", 
  message = "無法載入資料，請檢查網路連線後重試",
  onRetry,
  retryLabel = "重試",
  className 
}: ErrorStateProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 md:py-16 px-3 sm:px-4">
        <Alert variant="destructive" className="w-full max-w-md mb-4 sm:mb-6">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
          <AlertTitle className="text-sm sm:text-base md:text-lg break-words pr-6">
            {title}
          </AlertTitle>
          <AlertDescription className="text-xs sm:text-sm md:text-base mt-1 sm:mt-2 break-words leading-relaxed">
            {message}
          </AlertDescription>
        </Alert>
        {onRetry && (
          <Button 
            onClick={onRetry} 
            size="lg"
            variant="outline"
            className="gap-2 w-full sm:w-auto max-w-xs"
          >
            <RefreshCw className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{retryLabel}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
