import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // 檢查是否為錯誤格式的 acc 參數 (例如 /acc=tiansong-villa 應該是 /?acc=tiansong-villa)
    const accMatch = location.pathname.match(/^\/acc=(.+)$/);
    if (accMatch) {
      const accValue = accMatch[1];
      setIsRedirecting(true);
      // 重定向到正確的 URL 格式
      navigate(`/?acc=${accValue}`, { replace: true });
      return;
    }

    if (import.meta.env.DEV) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname, navigate]);

  // 如果正在重定向，顯示載入狀態
  if (isRedirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">正在跳轉...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-8xl md:text-9xl font-bold text-primary">404</h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground">找不到頁面</h2>
        </div>
        <p className="text-base md:text-lg text-muted-foreground">
          抱歉，您訪問的頁面不存在或已被移除
        </p>
        <a 
          href="/" 
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-base shadow-md hover:shadow-lg"
        >
          返回首頁
        </a>
      </div>
    </div>
  );
};

export default NotFound;
