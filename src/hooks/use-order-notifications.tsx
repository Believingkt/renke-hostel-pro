import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSubdomain } from "./use-subdomain";

export const useOrderNotifications = () => {
  const { accommodationId } = useSubdomain();

  useEffect(() => {
    if (!accommodationId) return;

    const saveNotification = async (title: string, description: string, type: string, orderId?: string) => {
      try {
        await supabase.from("notifications").insert({
          accommodation_id: accommodationId,
          title,
          description,
          type,
          order_id: orderId || null,
        });
      } catch (error) {
        console.error("Error saving notification:", error);
      }
    };

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
          const title = "🎉 新訂單通知";
          const description = `訂單編號：${order.order_number}\n客戶：${order.guest_name}\n金額：$${order.final_price.toLocaleString()}`;
          
          toast({
            title,
            description,
            duration: 10000,
          });

          saveNotification(title, description, 'new_order', order.id);
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
            
            const title = "📋 訂單狀態更新";
            const description = `訂單編號：${newOrder.order_number}\n狀態：${statusMap[oldOrder.order_status] || oldOrder.order_status} → ${statusMap[newOrder.order_status] || newOrder.order_status}`;
            
            toast({
              title,
              description,
              duration: 8000,
            });

            saveNotification(title, description, 'status_update', newOrder.id);
          }
          
          // 付款狀態改變時通知
          if (oldOrder.payment_status !== newOrder.payment_status && newOrder.payment_status === 'paid') {
            const title = "💰 付款完成";
            const description = `訂單編號：${newOrder.order_number}\n已收到款項：$${newOrder.paid_amount.toLocaleString()}`;
            
            toast({
              title,
              description,
              duration: 8000,
            });

            saveNotification(title, description, 'payment', newOrder.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId]);
};
