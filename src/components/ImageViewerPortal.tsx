import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageViewerPortalProps {
  imageUrl: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageViewerPortal = ({ imageUrl, onClose, onPrev, onNext }: ImageViewerPortalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 創建完全獨立的容器，直接掛載到 body
    const container = document.createElement('div');
    container.id = 'image-viewer-root';
    
    // 獲取實際視口尺寸
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    // 使用內聯樣式，完全隔離
    container.setAttribute('style', `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: ${vw}px !important;
      height: ${vh}px !important;
      background-color: rgba(0, 0, 0, 0.95) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      pointer-events: auto !important;
    `);
    
    // 圖片
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '查看照片';
    img.setAttribute('style', `
      max-width: ${vw * 0.9}px !important;
      max-height: ${vh * 0.8}px !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      user-select: none !important;
      pointer-events: none !important;
      transform: none !important;
    `);
    img.draggable = false;
    
    // 關閉按鈕
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    closeBtn.setAttribute('style', `
      position: absolute !important;
      top: 16px !important;
      right: 16px !important;
      width: 48px !important;
      height: 48px !important;
      border-radius: 50% !important;
      background-color: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transform: none !important;
    `);
    closeBtn.onclick = onClose;
    
    // 上一張
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>`;
    prevBtn.setAttribute('style', `
      position: absolute !important;
      left: 24px !important;
      top: ${vh / 2}px !important;
      margin-top: -28px !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      background-color: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transform: none !important;
    `);
    prevBtn.onclick = onPrev;
    
    // 下一張
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>`;
    nextBtn.setAttribute('style', `
      position: absolute !important;
      right: 24px !important;
      top: ${vh / 2}px !important;
      margin-top: -28px !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      background-color: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transform: none !important;
    `);
    nextBtn.onclick = onNext;
    
    // 組裝
    container.appendChild(img);
    container.appendChild(closeBtn);
    container.appendChild(prevBtn);
    container.appendChild(nextBtn);
    
    // 背景點擊關閉
    container.onclick = (e) => {
      if (e.target === container) onClose();
    };
    
    // 掛載到 body
    document.body.appendChild(container);
    containerRef.current = container;
    
    // 鎖定頁面
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    
    // 鍵盤事件
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      // 清理
      if (containerRef.current && document.body.contains(containerRef.current)) {
        document.body.removeChild(containerRef.current);
      }
      
      // 恢復頁面
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
      
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [imageUrl, onClose, onPrev, onNext]);

  return null;
};
