import { useEffect, useRef } from "react";

interface ImageViewerPortalProps {
  imageUrl: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageViewerPortal = ({ imageUrl, onClose, onPrev, onNext }: ImageViewerPortalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // 保存滾動位置
    scrollPositionRef.current = {
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop,
    };

    // 創建容器
    const container = document.createElement('div');
    container.id = 'image-viewer-portal';
    
    // 設置樣式
    Object.assign(container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      zIndex: '999999',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0',
      padding: '0',
      overflow: 'hidden',
    });

    // 阻止所有觸控和滾動
    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    container.addEventListener('touchmove', preventScroll, { passive: false });
    container.addEventListener('wheel', preventScroll, { passive: false });
    container.addEventListener('scroll', preventScroll, { passive: false });

    // 鎖定 body
    const originalBodyStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      width: document.body.style.width,
      height: document.body.style.height,
    };

    Object.assign(document.body.style, {
      overflow: 'hidden',
      position: 'fixed',
      top: `-${scrollPositionRef.current.y}px`,
      left: `-${scrollPositionRef.current.x}px`,
      width: '100%',
      height: '100%',
    });

    // 創建圖片
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '查看照片';
    Object.assign(img.style, {
      maxWidth: '90vw',
      maxHeight: '80vh',
      width: 'auto',
      height: 'auto',
      objectFit: 'contain',
      userSelect: 'none',
      pointerEvents: 'none',
    });

    // 創建關閉按鈕
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: '48px',
      height: '48px',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '50%',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    closeBtn.onclick = onClose;

    // 創建左箭頭
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>';
    Object.assign(prevBtn.style, {
      position: 'absolute',
      left: '24px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '56px',
      height: '56px',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '50%',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    prevBtn.onclick = onPrev;

    // 創建右箭頭
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>';
    Object.assign(nextBtn.style, {
      position: 'absolute',
      right: '24px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '56px',
      height: '56px',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '50%',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    nextBtn.onclick = onNext;

    // 添加元素到容器
    container.appendChild(img);
    container.appendChild(closeBtn);
    container.appendChild(prevBtn);
    container.appendChild(nextBtn);

    // 添加到 body
    document.body.appendChild(container);
    containerRef.current = container;

    // 清理函數
    return () => {
      if (containerRef.current && document.body.contains(containerRef.current)) {
        document.body.removeChild(containerRef.current);
      }

      // 恢復 body 樣式
      Object.assign(document.body.style, originalBodyStyle);

      // 恢復滾動位置
      window.scrollTo(scrollPositionRef.current.x, scrollPositionRef.current.y);

      // 移除事件監聽
      container.removeEventListener('touchmove', preventScroll);
      container.removeEventListener('wheel', preventScroll);
      container.removeEventListener('scroll', preventScroll);
    };
  }, [imageUrl, onClose, onPrev, onNext]);

  // 這個組件不渲染任何 React 內容，因為我們直接操作 DOM
  return null;
};
