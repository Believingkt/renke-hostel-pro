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
    // 針對 Safari 的特殊處理
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    // 獲取真實視口尺寸（Safari 專用）
    const getViewportSize = () => {
      if (window.visualViewport) {
        return {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
        };
      }
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0,
      };
    };

    const viewport = getViewportSize();
    
    // 注入 CSS 完全凍結頁面所有動畫和輪播
    const freezeStyle = document.createElement('style');
    freezeStyle.id = 'viewer-freeze-all';
    freezeStyle.textContent = `
      body * {
        animation-play-state: paused !important;
        transition: none !important;
      }
      .embla__container,
      [class*="carousel"] [class*="container"] {
        transform: translate3d(0, 0, 0) !important;
        -webkit-transform: translate3d(0, 0, 0) !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(freezeStyle);
    
    // 創建容器
    const container = document.createElement('div');
    container.id = 'image-viewer-safari';
    
    // 獲取當前滾動位置
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const currentScrollX = window.pageXOffset || document.documentElement.scrollLeft;
    
    // 使用 absolute 定位，相對於滾動位置
    // Safari 的 fixed 定位有問題，改用 absolute
    const styleString = `
      position: absolute !important;
      top: ${currentScrollY}px !important;
      left: ${currentScrollX}px !important;
      width: ${viewport.width}px !important;
      height: ${viewport.height}px !important;
      background-color: rgba(0, 0, 0, 0.95) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      -webkit-transform: translate3d(0, 0, 0) !important;
      transform: translate3d(0, 0, 0) !important;
    `;
    
    container.setAttribute('style', styleString);
    
    // 圖片
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '查看照片';
    img.setAttribute('style', `
      max-width: ${viewport.width * 0.9}px !important;
      max-height: ${viewport.height * 0.8}px !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      pointer-events: none !important;
      -webkit-transform: translate3d(0, 0, 0) !important;
      transform: translate3d(0, 0, 0) !important;
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
      -webkit-transform: translate3d(0, 0, 0) !important;
      transform: translate3d(0, 0, 0) !important;
    `);
    closeBtn.onclick = onClose;
    
    // 上一張
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>`;
    prevBtn.setAttribute('style', `
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
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      -webkit-transform: translate3d(0, 0, 0) !important;
      transform: translate3d(0, 0, 0) !important;
    `);
    prevBtn.onclick = onPrev;
    
    // 下一張
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>`;
    nextBtn.setAttribute('style', `
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
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      -webkit-transform: translate3d(0, 0, 0) !important;
      transform: translate3d(0, 0, 0) !important;
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
    
    // 阻止所有觸控事件傳遞
    const preventTouch = (e: TouchEvent) => {
      if (e.target !== img) {
        e.preventDefault();
      }
    };
    container.addEventListener('touchmove', preventTouch, { passive: false });
    container.addEventListener('touchstart', preventTouch, { passive: false });
    
    // 掛載到 body
    document.body.appendChild(container);
    containerRef.current = container;
    
    // 完全鎖定頁面
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    
    // 保存原始樣式
    const originalHtmlStyle = htmlEl.getAttribute('style') || '';
    const originalBodyStyle = bodyEl.getAttribute('style') || '';
    
    // 鎖定
    htmlEl.style.overflow = 'hidden';
    htmlEl.style.position = 'fixed';
    htmlEl.style.width = '100%';
    htmlEl.style.height = '100%';
    htmlEl.style.top = `-${scrollY}px`;
    htmlEl.style.left = `-${scrollX}px`;
    
    bodyEl.style.overflow = 'hidden';
    bodyEl.style.position = 'fixed';
    bodyEl.style.width = '100%';
    bodyEl.style.height = '100%';
    bodyEl.style.top = `-${scrollY}px`;
    bodyEl.style.left = `-${scrollX}px`;
    
    // 鍵盤事件
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    
    // Safari 視口變化監聽
    const handleViewportResize = () => {
      const newViewport = getViewportSize();
      container.style.top = `${newViewport.offsetTop}px`;
      container.style.left = `${newViewport.offsetLeft}px`;
      container.style.width = `${newViewport.width}px`;
      container.style.height = `${newViewport.height}px`;
    };
    
    if (window.visualViewport && isSafari) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }
    
    return () => {
      // 清理
      if (containerRef.current && document.body.contains(containerRef.current)) {
        document.body.removeChild(containerRef.current);
      }
      
      // 移除凍結樣式
      const freeze = document.getElementById('viewer-freeze-all');
      if (freeze) {
        document.head.removeChild(freeze);
      }
      
      // 恢復頁面
      if (originalHtmlStyle) {
        htmlEl.setAttribute('style', originalHtmlStyle);
      } else {
        htmlEl.removeAttribute('style');
      }
      
      if (originalBodyStyle) {
        bodyEl.setAttribute('style', originalBodyStyle);
      } else {
        bodyEl.removeAttribute('style');
      }
      
      window.scrollTo(scrollX, scrollY);
      
      container.removeEventListener('touchmove', preventTouch);
      container.removeEventListener('touchstart', preventTouch);
      window.removeEventListener('keydown', handleKeyDown);
      
      if (window.visualViewport && isSafari) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
    };
  }, [imageUrl, onClose, onPrev, onNext]);

  return null;
};
