import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Trash2, RefreshCw, BellOff, Home } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { NotificationsSkeleton } from "@/components/skeletons/NotificationsSkeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface Notification {
  id: string;
  title: string;
  description: string;
  type: string;
  order_id: string | null;
  is_read: boolean;
  created_at: string;
}

const Notifications = () => {
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'new_order' | 'payment' | 'status_update' | 'settled_amount_change'>('all');
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!accommodationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      let query = (supabase as any)
        .from("notifications")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("created_at", { ascending: false });

      if (filter === 'unread') {
        query = query.eq("is_read", false);
      }

      if (typeFilter !== 'all') {
        query = query.eq("type", typeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast({
        title: "載入失敗",
        description: "無法載入通知記錄",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset notifications immediately when accommodation changes
  useEffect(() => {
    setNotifications([]);
    setFilter('all');
    setTypeFilter('all');
  }, [accommodationId]);

  useEffect(() => {
    fetchNotifications();
  }, [accommodationId, filter, typeFilter]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!accommodationId) return;

    try {
      const { error } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true })
        .eq("accommodation_id", accommodationId)
        .eq("is_read", false);

      if (error) throw error;

      toast({
        title: "已標記為已讀",
        description: "所有通知已標記為已讀",
      });
      
      fetchNotifications();
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast({
        title: "操作失敗",
        description: "無法標記所有通知為已讀",
        variant: "destructive",
      });
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from("notifications")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== id));
      
      toast({
        title: "已刪除",
        description: "通知已刪除",
      });
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast({
        title: "刪除失敗",
        description: "無法刪除通知",
        variant: "destructive",
      });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_order':
        return '🎉';
      case 'status_update':
        return '📋';
      case 'payment':
        return '💰';
      case 'settled_amount_change':
        return '🔒';
      default:
        return '🔔';
    }
  };

  const getNotificationBadgeVariant = (notification: Notification): "default" | "info" | "success" | "destructive" => {
    if (notification.type === 'new_order') return 'info';
    if (notification.type === 'payment') return 'success';
    if (notification.type === 'settled_amount_change') return 'destructive';
    if (notification.type === 'status_update' && 
        (notification.title.includes('取消') || notification.description.includes('取消'))) {
      return 'destructive';
    }
    return 'default';
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    if (notification.order_id) {
      navigate(`/admin/orders/${notification.order_id}`);
    }
  };

  // 按日期分組通知
  const groupNotificationsByDate = (notifications: Notification[]) => {
    const groups: {
      today: Notification[];
      yesterday: Notification[];
      earlier: Notification[];
    } = {
      today: [],
      yesterday: [],
      earlier: []
    };

    notifications.forEach(notification => {
      const date = new Date(notification.created_at);
      if (isToday(date)) {
        groups.today.push(notification);
      } else if (isYesterday(date)) {
        groups.yesterday.push(notification);
      } else {
        groups.earlier.push(notification);
      }
    });

    return groups;
  };

  const groupedNotifications = groupNotificationsByDate(notifications);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>通知中心</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="通知中心"
        icon={Bell}
        action={
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNotifications()}
              className="flex-1 sm:flex-initial"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              重新整理
            </Button>
            
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="flex-1 sm:flex-initial"
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                全部標為已讀
              </Button>
            )}
          </div>
        }
      />

      <Card className="p-4 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="default"
              onClick={() => setFilter('all')}
              className="rounded-full px-6 h-10 font-medium transition-all hover:scale-105"
            >
              全部通知
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'outline'}
              size="default"
              onClick={() => setFilter('unread')}
              className="rounded-full px-6 h-10 font-medium transition-all hover:scale-105"
            >
              未讀 {unreadCount > 0 && `(${unreadCount})`}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={typeFilter === 'all' ? 'default' : 'outline'}
              size="default"
              onClick={() => setTypeFilter('all')}
              className="rounded-full px-6 h-10 font-medium transition-all hover:scale-105"
            >
              全部類型
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setTypeFilter('new_order')}
              className={`rounded-full px-6 h-10 font-medium transition-all hover:scale-105 ${
                typeFilter === 'new_order' 
                  ? 'bg-warning text-warning-foreground border-warning hover:bg-warning/90' 
                  : 'hover:bg-warning/10 hover:border-warning/50'
              }`}
            >
              🎉 新訂單
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setTypeFilter('payment')}
              className={`rounded-full px-6 h-10 font-medium transition-all hover:scale-105 ${
                typeFilter === 'payment' 
                  ? 'bg-success text-success-foreground border-success hover:bg-success/90' 
                  : 'hover:bg-success/10 hover:border-success/50'
              }`}
            >
              💰 付款通知
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setTypeFilter('status_update')}
              className={`rounded-full px-6 h-10 font-medium transition-all hover:scale-105 ${
                typeFilter === 'status_update' 
                  ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90' 
                  : 'hover:bg-primary/10 hover:border-primary/50'
              }`}
            >
              📋 狀態更新
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setTypeFilter('settled_amount_change')}
              className={`rounded-full px-6 h-10 font-medium transition-all hover:scale-105 ${
                typeFilter === 'settled_amount_change'
                  ? 'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90'
                  : 'hover:bg-destructive/10 hover:border-destructive/50'
              }`}
            >
              🔒 結清金額變動
            </Button>
          </div>
        </div>
      </Card>

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === 'unread' ? '沒有未讀通知' : '還沒有任何通知記錄'}
          description={filter === 'unread' ? '所有通知都已閱讀完畢' : '當有新訂單或重要更新時，會在這裡顯示通知'}
        />
      ) : (
        <div className="space-y-6">
          {/* 今天的通知 */}
          {groupedNotifications.today.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">今天</h3>
              {groupedNotifications.today.map((notification) => (
            <Card 
              key={notification.id}
              className={`transition-all hover:shadow-md cursor-pointer ${
                !notification.is_read ? 'bg-accent/10 border-primary/20' : ''
              } ${
                notification.type === 'new_order' ? 'border-l-4 border-l-warning' :
                notification.type === 'payment' ? 'border-l-4 border-l-success' :
                notification.type === 'status_update' ? 'border-l-4 border-l-primary' : notification.type === 'settled_amount_change' ? 'border-l-4 border-l-destructive' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="text-2xl mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        {notification.title}
                        {!notification.is_read && (
                          <Badge 
                            variant={getNotificationBadgeVariant(notification)} 
                            className="text-xs"
                          >
                            新
                          </Badge>
                        )}
                      </h3>
                      
                      <Button
                        variant="ghost-destructive"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground whitespace-pre-line mb-2">
                      {notification.description}
                    </p>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {format(new Date(notification.created_at), "HH:mm")}
                      </span>
                      
                      {!notification.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          標為已讀
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
            </div>
          )}

          {/* 昨天的通知 */}
          {groupedNotifications.yesterday.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">昨天</h3>
              {groupedNotifications.yesterday.map((notification) => (
            <Card 
              key={notification.id}
              className={`transition-all hover:shadow-md cursor-pointer ${
                !notification.is_read ? 'bg-accent/10 border-primary/20' : ''
              } ${
                notification.type === 'new_order' ? 'border-l-4 border-l-warning' :
                notification.type === 'payment' ? 'border-l-4 border-l-success' :
                notification.type === 'status_update' ? 'border-l-4 border-l-primary' : notification.type === 'settled_amount_change' ? 'border-l-4 border-l-destructive' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="text-2xl mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        {notification.title}
                        {!notification.is_read && (
                          <Badge 
                            variant={getNotificationBadgeVariant(notification)} 
                            className="text-xs"
                          >
                            新
                          </Badge>
                        )}
                      </h3>
                      
                      <Button
                        variant="ghost-destructive"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground whitespace-pre-line mb-2">
                      {notification.description}
                    </p>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {format(new Date(notification.created_at), "HH:mm")}
                      </span>
                      
                      {!notification.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          標為已讀
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
            </div>
          )}

          {/* 更早的通知 */}
          {groupedNotifications.earlier.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">更早</h3>
              {groupedNotifications.earlier.map((notification) => (
            <Card 
              key={notification.id}
              className={`transition-all hover:shadow-md cursor-pointer ${
                !notification.is_read ? 'bg-accent/10 border-primary/20' : ''
              } ${
                notification.type === 'new_order' ? 'border-l-4 border-l-warning' :
                notification.type === 'payment' ? 'border-l-4 border-l-success' :
                notification.type === 'status_update' ? 'border-l-4 border-l-primary' : notification.type === 'settled_amount_change' ? 'border-l-4 border-l-destructive' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="text-2xl mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        {notification.title}
                        {!notification.is_read && (
                          <Badge 
                            variant={getNotificationBadgeVariant(notification)} 
                            className="text-xs"
                          >
                            新
                          </Badge>
                        )}
                      </h3>
                      
                      <Button
                        variant="ghost-destructive"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground whitespace-pre-line mb-2">
                      {notification.description}
                    </p>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {format(new Date(notification.created_at), "yyyy/MM/dd HH:mm", { locale: zhTW })}
                      </span>
                      
                      {!notification.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          標為已讀
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Notifications;
