import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ImageViewerProps {
  imageUrl: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageViewer = ({ imageUrl, onClose, onPrev, onNext }: ImageViewerProps) => {
  useEffect(() => {
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    
    // 鎖定滾動
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    return () => {
      // 恢復滾動
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.width = '';
      document.body.style.height = '';
      
      window.scrollTo(scrollX, scrollY);
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    zIndex: 999999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
  };

  const imageStyle: React.CSSProperties = {
    maxWidth: '90vw',
    maxHeight: '80vh',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
  };

  const buttonBaseStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '50%',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  };

  const closeButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    top: '16px',
    right: '16px',
    width: '48px',
    height: '48px',
  };

  const navButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '56px',
    height: '56px',
  };

  return createPortal(
    <div style={containerStyle}>
      <img 
        src={imageUrl} 
        alt="查看照片" 
        style={imageStyle}
      />
      
      <button 
        onClick={onClose}
        style={closeButtonStyle}
        aria-label="關閉"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      
      <button 
        onClick={onPrev}
        style={{ ...navButtonStyle, left: '24px' }}
        aria-label="上一張"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <button 
        onClick={onNext}
        style={{ ...navButtonStyle, right: '24px' }}
        aria-label="下一張"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>,
    document.body
  );
};
