import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

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
