import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSubdomain } from "./use-subdomain";

export const useOrderNotifications = () => {
  const { accommodationId } = useSubdomain();

  useEffect(() => {
    if (!accommodationId) return;

    const channel = supabase
      .channel('order-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `accommodation_id=eq.${accommodationId}`
        },
        (payload) => {
          const order = payload.new as any;
          toast({
            title: "🎉 新訂單通知",
            description: `訂單編號：${order.order_number}\n客戶：${order.guest_name}\n金額：$${order.final_price.toLocaleString()}`,
            duration: 10000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `accommodation_id=eq.${accommodationId}`
        },
        (payload) => {
          const oldOrder = payload.old as any;
          const newOrder = payload.new as any;
          
          // 只在狀態改變時通知
          if (oldOrder.order_status !== newOrder.order_status) {
            const statusMap: { [key: string]: string } = {
              'pending': '待確認',
              'confirmed': '已確認',
              'checked_in': '已入住',
              'checked_out': '已退房',
              'cancelled': '已取消'
            };
            
            toast({
              title: "📋 訂單狀態更新",
              description: `訂單編號：${newOrder.order_number}\n狀態：${statusMap[oldOrder.order_status] || oldOrder.order_status} → ${statusMap[newOrder.order_status] || newOrder.order_status}`,
              duration: 8000,
            });
          }
          
          // 付款狀態改變時通知
          if (oldOrder.payment_status !== newOrder.payment_status && newOrder.payment_status === 'paid') {
            toast({
              title: "💰 付款完成",
              description: `訂單編號：${newOrder.order_number}\n已收到款項：$${newOrder.paid_amount.toLocaleString()}`,
              duration: 8000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId]);
};
