import { useCallback, useRef } from "react";

// 預載入路由對應的組件
const routePreloadMap: Record<string, () => Promise<any>> = {
  '/booking': () => import('@/pages/BookingFlow'),
  '/order-search': () => import('@/pages/OrderSearch'),
  '/admin': () => import('@/pages/Dashboard'),
  '/admin/website-content': () => import('@/pages/WebsiteContent'),
  '/admin/orders': () => import('@/pages/Orders'),
  '/admin/pricing': () => import('@/pages/Pricing'),
  '/admin/accounts': () => import('@/pages/Accounts'),
  '/admin/kol-discount': () => import('@/pages/KolDiscount'),
  '/admin/customers': () => import('@/pages/Customers'),
  '/admin/faq': () => import('@/pages/Faq'),
  '/admin/public-holidays': () => import('@/pages/PublicHolidays'),
  '/admin/notifications': () => import('@/pages/Notifications'),
  '/admin/data-backup': () => import('@/pages/DataBackup'),
};

export const useRoutePreload = () => {
  const preloadedRoutes = useRef<Set<string>>(new Set());

  const preloadRoute = useCallback((path: string) => {
    // 避免重複預載入
    if (preloadedRoutes.current.has(path)) {
      return;
    }

    const preloadFn = routePreloadMap[path];
    if (preloadFn) {
      preloadedRoutes.current.add(path);
      
      // 使用 requestIdleCallback 在瀏覽器空閒時預載入
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          preloadFn().catch((error) => {
            console.warn(`Failed to preload route ${path}:`, error);
            // 預載入失敗時從集合中移除，允許重試
            preloadedRoutes.current.delete(path);
          });
        });
      } else {
        // 降級方案：使用 setTimeout
        setTimeout(() => {
          preloadFn().catch((error) => {
            console.warn(`Failed to preload route ${path}:`, error);
            preloadedRoutes.current.delete(path);
          });
        }, 0);
      }
    }
  }, []);

  return { preloadRoute };
};
