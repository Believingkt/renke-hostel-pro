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
      <CardContent className="flex flex-col items-center justify-center py-12 md:py-16 px-4">
        <Alert variant="destructive" className="max-w-md mb-6">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-base md:text-lg">{title}</AlertTitle>
          <AlertDescription className="text-sm md:text-base mt-2">
            {message}
          </AlertDescription>
        </Alert>
        {onRetry && (
          <Button 
            onClick={onRetry} 
            size="lg"
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
