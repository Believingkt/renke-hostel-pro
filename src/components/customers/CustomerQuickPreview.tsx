import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { User, Phone, Mail, Calendar, FileText, BarChart3 } from "lucide-react";
import { format } from "date-fns";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  first_order_date: string | null;
  visit_count: number;
  notes: string | null;
}

interface CustomerQuickPreviewProps {
  customer: Customer;
  children: React.ReactNode;
}

export function CustomerQuickPreview({ customer, children }: CustomerQuickPreviewProps) {
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <User className="w-4 h-4" />
              {customer.name}
            </h4>
          </div>

          <div className="space-y-2 text-sm">
            {customer.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{customer.phone}</span>
              </div>
            )}

            {customer.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span className="truncate">{customer.email}</span>
              </div>
            )}

            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  來訪次數
                </span>
                <span className="font-medium">{customer.visit_count} 次</span>
              </div>

              {customer.first_order_date && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    首次訂房
                  </span>
                  <span className="font-medium">
                    {format(new Date(customer.first_order_date), "yyyy-MM-dd")}
                  </span>
                </div>
              )}
            </div>

            {customer.notes && (
              <div className="pt-2 border-t">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs line-clamp-3">{customer.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
