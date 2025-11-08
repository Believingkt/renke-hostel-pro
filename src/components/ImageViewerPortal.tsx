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
    
    // 創建完全獨立的根容器（body 的直接子元素，與 #root 平行）
    let viewerRoot = document.getElementById('viewer-root');
    if (!viewerRoot) {
      viewerRoot = document.createElement('div');
      viewerRoot.id = 'viewer-root';
      viewerRoot.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none;';
      document.body.appendChild(viewerRoot);
    }
    
    // 創建完全獨立的容器
    const overlay = document.createElement('div');
    overlay.id = 'photo-viewer-overlay';
    
    // 獲取視口尺寸
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    
    // 設置容器樣式 - 完全固定，不受任何影響
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background-color: rgba(0, 0, 0, 0.95) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      pointer-events: auto !important;
    `;
    
    // 創建圖片
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '查看照片';
    img.style.cssText = `
      max-width: 90vw !important;
      max-height: 80vh !important;
      object-fit: contain !important;
      user-select: none !important;
      pointer-events: none !important;
    `;
    img.draggable = false;
    
    // 關閉按鈕
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      position: absolute !important;
      top: 16px !important;
      right: 16px !important;
      width: 48px !important;
      height: 48px !important;
      border-radius: 50% !important;
      background-color: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      font-size: 24px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    closeBtn.onclick = onClose;
    
    // 上一張按鈕
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '‹';
    prevBtn.style.cssText = `
      position: absolute !important;
      left: 24px !important;
      top: 50% !important;
      margin-top: -28px !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      background-color: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      font-size: 40px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    prevBtn.onclick = onPrev;
    
    // 下一張按鈕
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '›';
    nextBtn.style.cssText = `
      position: absolute !important;
      right: 24px !important;
      top: 50% !important;
      margin-top: -28px !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      background-color: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      font-size: 40px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
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
    
    // 使用 RAF 持續強制鎖定輪播位置
    let rafId: number;
    const lockCarousel = () => {
      const emblaContainers = document.querySelectorAll('.embla__container');
      emblaContainers.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.transform = 'translate3d(0, 0, 0)';
        htmlEl.style.webkitTransform = 'translate3d(0, 0, 0)';
        htmlEl.style.transition = 'none';
      });
      rafId = requestAnimationFrame(lockCarousel);
    };
    lockCarousel();
    
    // 鎖定滾動
    root.style.overflow = 'hidden';
    root.style.position = 'fixed';
    root.style.width = '100%';
    root.style.top = `-${scrollY}px`;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    
    // 添加到獨立的 viewer root
    viewerRoot.appendChild(overlay);
    containerRef.current = overlay;
    
    // 鍵盤事件
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    
    return () => {
      // 停止 RAF
      cancelAnimationFrame(rafId);
      
      // 清理
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      
      // 恢復輪播
      const emblaContainers = document.querySelectorAll('.embla__container');
      emblaContainers.forEach((el) => {
        (el as HTMLElement).style.transform = '';
        (el as HTMLElement).style.webkitTransform = '';
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
