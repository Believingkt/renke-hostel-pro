import { useEffect, useRef } from "react";

interface ImageViewerPortalProps {
  imageUrl: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageViewerPortal = ({ imageUrl, onClose, onPrev, onNext }: ImageViewerPortalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 發送停止輪播事件
    window.dispatchEvent(new CustomEvent('viewer-opened'));
    
    // 保存當前滾動位置
    const scrollY = window.scrollY;
    
    // 創建完全獨立的容器
    const overlay = document.createElement('div');
    overlay.id = 'photo-viewer-overlay';
    
    // 獲取視口尺寸
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    
    // 設置容器樣式 - 完全固定，不受任何影響
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: `${vw}px`,
      height: `${vh}px`,
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0',
      padding: '0',
      border: 'none',
      transform: 'translate3d(0, 0, 0)',
      WebkitTransform: 'translate3d(0, 0, 0)',
      willChange: 'auto',
      isolation: 'isolate',
    });
    
    // 創建圖片
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '查看照片';
    Object.assign(img.style, {
      maxWidth: `${vw * 0.9}px`,
      maxHeight: `${vh * 0.8}px`,
      objectFit: 'contain',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      pointerEvents: 'none',
    });
    img.draggable = false;
    
    // 關閉按鈕
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      color: 'white',
      fontSize: '24px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    closeBtn.onclick = onClose;
    
    // 上一張按鈕
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '‹';
    Object.assign(prevBtn.style, {
      position: 'absolute',
      left: '24px',
      top: '50%',
      marginTop: '-28px',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      color: 'white',
      fontSize: '40px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    prevBtn.onclick = onPrev;
    
    // 下一張按鈕
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '›';
    Object.assign(nextBtn.style, {
      position: 'absolute',
      right: '24px',
      top: '50%',
      marginTop: '-28px',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      color: 'white',
      fontSize: '40px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    nextBtn.onclick = onNext;
    
    // 組裝元素
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    
    // 點擊背景關閉
    overlay.onclick = (e) => {
      if (e.target === overlay) onClose();
    };
    
    // 停止輪播並鎖定頁面
    const root = document.documentElement;
    const body = document.body;
    
    // 完全凍結輪播
    const emblaContainers = document.querySelectorAll('.embla__container');
    emblaContainers.forEach((el) => {
      (el as HTMLElement).style.transform = 'translate3d(0, 0, 0)';
      (el as HTMLElement).style.transition = 'none';
    });
    
    // 鎖定滾動
    root.style.overflow = 'hidden';
    root.style.position = 'fixed';
    root.style.width = '100%';
    root.style.top = `-${scrollY}px`;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    
    // 添加到 DOM
    document.body.appendChild(overlay);
    containerRef.current = overlay;
    
    // 鍵盤事件
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    
    return () => {
      // 清理
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      
      // 恢復輪播
      emblaContainers.forEach((el) => {
        (el as HTMLElement).style.transform = '';
        (el as HTMLElement).style.transition = '';
      });
      
      // 恢復頁面
      root.style.overflow = '';
      root.style.position = '';
      root.style.width = '';
      root.style.top = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.width = '';
      
      window.scrollTo(0, scrollY);
      window.removeEventListener('keydown', handleKey);
      window.dispatchEvent(new CustomEvent('viewer-closed'));
    };
  }, [imageUrl, onClose, onPrev, onNext]);

  return null;
};
