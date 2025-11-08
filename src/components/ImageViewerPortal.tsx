import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageViewerPortalProps {
  imageUrl: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageViewerPortal = ({ imageUrl, onClose, onPrev, onNext }: ImageViewerPortalProps) => {
  useEffect(() => {
    // 完全禁用頁面滾動和動畫
    const root = document.documentElement;
    const body = document.body;
    
    // 保存原始樣式
    const originalStyles = {
      rootOverflow: root.style.overflow,
      rootPosition: root.style.position,
      rootTop: root.style.top,
      rootLeft: root.style.left,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
    };
    
    // 獲取當前滾動位置
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    
    // 鎖定 html 和 body
    root.style.overflow = 'hidden';
    root.style.position = 'fixed';
    root.style.top = `-${scrollY}px`;
    root.style.left = `-${scrollX}px`;
    root.style.width = '100%';
    root.style.height = '100%';
    
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = '100%';
    body.style.height = '100%';
    
    // 停止所有動畫
    const style = document.createElement('style');
    style.id = 'viewer-freeze';
    style.textContent = `
      * {
        animation-play-state: paused !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      // 恢復樣式
      root.style.overflow = originalStyles.rootOverflow;
      root.style.position = originalStyles.rootPosition;
      root.style.top = originalStyles.rootTop;
      root.style.left = originalStyles.rootLeft;
      root.style.width = '';
      root.style.height = '';
      
      body.style.overflow = originalStyles.bodyOverflow;
      body.style.position = originalStyles.bodyPosition;
      body.style.top = originalStyles.bodyTop;
      body.style.left = originalStyles.bodyLeft;
      body.style.width = '';
      body.style.height = '';
      
      // 移除動畫停止樣式
      const freezeStyle = document.getElementById('viewer-freeze');
      if (freezeStyle) {
        freezeStyle.remove();
      }
      
      // 恢復滾動位置
      window.scrollTo(scrollX, scrollY);
      
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onPrev, onNext]);

  const viewer = (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
      onClick={onClose}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* 圖片 */}
      <img
        src={imageUrl}
        alt="查看照片"
        style={{
          maxWidth: '90vw',
          maxHeight: '80vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          userSelect: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* 關閉按鈕 */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={24} />
      </button>

      {/* 上一張 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        style={{
          position: 'absolute',
          left: '24px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronLeft size={28} />
      </button>

      {/* 下一張 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        style={{
          position: 'absolute',
          right: '24px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronRight size={28} />
      </button>
    </div>
  );

  return createPortal(viewer, document.body);
};
