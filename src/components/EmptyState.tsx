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
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center py-12 md:py-16 px-4">
        <div className="rounded-full bg-muted p-4 md:p-6 mb-4 md:mb-6">
          <Icon className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg md:text-xl font-semibold mb-2 text-center">
          {title}
        </h3>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-md mb-6">
          {description}
        </p>
        {action && (
          <Button onClick={action.onClick} size="lg">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
