import { useState, useEffect } from "react";
import { Order } from "@/types/order";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Calendar, User, Phone, FileText, Bed, Utensils } from "lucide-react";
import { getPaymentStatusConfig, getOrderStatusConfig } from "@/utils/orderHelpers";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";

interface CustomMealPlan {
  id: string;
  name: string;
}

interface OrderQuickPreviewProps {
  order: Order;
  children: React.ReactNode;
}

export function OrderQuickPreview({ order, children }: OrderQuickPreviewProps) {
  const { currentAccommodationId } = useAccommodation();
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  const orderStatusConfig = getOrderStatusConfig(order.order_status);
  const paymentStatusConfig = getPaymentStatusConfig(order.payment_status);

  useEffect(() => {
    const fetchCustomMealPlans = async () => {
      if (!currentAccommodationId) return;
      
      const { data } = await supabase
        .from('pricing_templates')
        .select('meal_plans')
        .eq('accommodation_id', currentAccommodationId)
        .eq('is_default', true)
        .maybeSingle();
      
      if (data?.meal_plans && Array.isArray(data.meal_plans)) {
        setCustomMealPlans(data.meal_plans as unknown as CustomMealPlan[]);
      }
    };

    fetchCustomMealPlans();
  }, [currentAccommodationId]);

  const getMealPlanDisplayName = (mealPlan: string | null): string => {
    if (!mealPlan) return '無';
    
    const customPlan = customMealPlans.find(p => p.id === mealPlan);
    if (customPlan) return customPlan.name;
    
    const defaultNames: Record<string, string> = {
      'no_meal': '不含餐',
      '2_meals': '一泊二食',
      '3_meals': '一泊三食'
    };
    return defaultNames[mealPlan] || mealPlan;
  };
  
  const balance = order.final_price - order.paid_amount;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{order.order_number}</h4>
            <div className="flex gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${orderStatusConfig.className}`}>
                {orderStatusConfig.label}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${paymentStatusConfig.className}`}>
                {paymentStatusConfig.label}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="font-medium">{order.guest_name}</span>
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span>{order.guest_phone}</span>
            </div>

            {order.room_types && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bed className="w-4 h-4" />
                <span>{order.room_types.name}</span>
              </div>
            )}

            {order.meal_plan && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Utensils className="w-4 h-4" />
                <span>{getMealPlanDisplayName(order.meal_plan)}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{order.check_in_date} ~ {order.check_out_date}</span>
            </div>

            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">訂單金額</span>
                <span className="font-medium">${order.final_price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">已付金額</span>
                <span className="font-medium text-cyan-600">${order.paid_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">待付金額</span>
                <span className={`font-medium ${balance > 0 ? 'text-orange-600' : 'text-cyan-600'}`}>
                  ${balance.toLocaleString()}
                </span>
              </div>
            </div>

            {order.notes && (
              <div className="pt-2 border-t">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4 mt-0.5" />
                  <p className="text-xs line-clamp-3">{order.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
