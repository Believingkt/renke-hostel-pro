import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  suggestions?: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
  }>;
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  secondaryAction,
  suggestions,
  className 
}: EmptyStateProps) {
  return (
    <div className={className}>
      <Card className="animate-fade-in">
        <CardContent className="flex flex-col items-center justify-center py-12 md:py-16 px-4">
          {/* 主圖標 */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse" />
            <div className="relative rounded-full bg-gradient-to-br from-muted to-muted/50 p-6 md:p-8">
              <Icon className="h-10 w-10 md:h-14 md:w-14 text-primary" />
            </div>
          </div>

          {/* 標題和描述 */}
          <h3 className="text-xl md:text-2xl font-bold mb-3 text-center bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            {title}
          </h3>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-md mb-6">
            {description}
          </p>

          {/* 行動按鈕 */}
          {(action || secondaryAction) && (
            <div className="flex flex-col sm:flex-row gap-3">
              {action && (
                <Button 
                  onClick={action.onClick} 
                  size="lg"
                  className="shadow-lg hover:shadow-xl transition-all"
                >
                  {action.label}
                </Button>
              )}
              {secondaryAction && (
                <Button 
                  onClick={secondaryAction.onClick} 
                  size="lg"
                  variant="outline"
                >
                  {secondaryAction.label}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 建議卡片 */}
      {suggestions && suggestions.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {suggestions.map((suggestion, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <suggestion.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h4 className="font-semibold text-sm">{suggestion.title}</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {suggestion.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
