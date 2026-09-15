import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import AccommodationLogo from './AccommodationLogo';

// Mock useAccommodationLogo hook
vi.mock('@/hooks/use-accommodation-logo', () => ({
  useAccommodationLogo: vi.fn(),
}));

import { useAccommodationLogo } from '@/hooks/use-accommodation-logo';

const mockUseAccommodationLogo = vi.mocked(useAccommodationLogo);

describe('AccommodationLogo', () => {
  describe('Loading 狀態', () => {
    it('應顯示 skeleton 當 isLoaded 為 false', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: false,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo />);
      
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeTruthy();
    });

    it('不應顯示 skeleton 當 showSkeleton 為 false', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: false,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo showSkeleton={false} />);
      
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeFalsy();
    });

    it('header variant 應使用正確的 skeleton 樣式', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: false,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo variant="header" />);
      
      const skeleton = container.querySelector('[class*="bg-muted"]');
      expect(skeleton).toBeTruthy();
    });

    it('footer variant 應使用正確的 skeleton 樣式', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: false,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo variant="footer" />);
      
      const skeleton = container.querySelector('[class*="bg-white"]');
      expect(skeleton).toBeTruthy();
    });
  });

  describe('有 Logo 狀態', () => {
    it('應顯示 logo 圖片', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: 'https://example.com/logo.png',
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo accommodationName="測試住宿" />);
      
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
      expect(img?.getAttribute('alt')).toBe('測試住宿');
    });

    it('應套用自訂 imgClassName', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: 'https://example.com/logo.png',
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo imgClassName="custom-img-class" />);
      
      const img = container.querySelector('img');
      expect(img?.classList.contains('custom-img-class')).toBe(true);
    });

    it('圖片應有 lazy loading 屬性', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: 'https://example.com/logo.png',
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo />);
      
      const img = container.querySelector('img');
      expect(img?.getAttribute('loading')).toBe('lazy');
    });
  });

  describe('無 Logo 狀態', () => {
    it('應顯示住宿名稱文字', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo accommodationName="美麗民宿" />);
      
      expect(container.textContent).toContain('美麗民宿');
    });

    it('應顯示預設文字當無 accommodationName', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo />);
      
      expect(container.textContent).toContain('住宿');
    });

    it('應套用自訂 textClassName', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo accommodationName="測試" textClassName="custom-text-class" />);
      
      const textElement = container.querySelector('.custom-text-class');
      expect(textElement).toBeTruthy();
      expect(textElement?.textContent).toBe('測試');
    });

    it('header variant 應使用正確的文字樣式', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo variant="header" accommodationName="測試" />);
      
      const span = container.querySelector('span');
      expect(span?.classList.contains('font-semibold')).toBe(true);
      expect(span?.classList.contains('text-white')).toBe(false);
    });

    it('footer variant 應使用白色文字樣式', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo variant="footer" accommodationName="測試" />);
      
      const span = container.querySelector('span');
      expect(span?.classList.contains('text-white')).toBe(true);
    });
  });

  describe('互動功能', () => {
    it('有 onClick 時應顯示為可點擊按鈕', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(<AccommodationLogo onClick={() => {}} accommodationName="測試" />);
      
      const button = container.querySelector('[role="button"]');
      expect(button).toBeTruthy();
      expect(button?.classList.contains('cursor-pointer')).toBe(true);
    });

    it('onClick 應被觸發', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: null,
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const handleClick = vi.fn();
      const { container } = render(<AccommodationLogo onClick={handleClick} accommodationName="測試" />);
      
      const button = container.querySelector('[role="button"]') as HTMLElement;
      button?.click();
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('外部狀態覆蓋', () => {
    it('應使用外部傳入的 logoUrl 和 isLoaded', () => {
      mockUseAccommodationLogo.mockReturnValue({
        logoUrl: 'https://example.com/external-logo.png',
        isLoaded: true,
        accommodationId: 'test-id',
        accommodationName: '',
      });

      const { container } = render(
        <AccommodationLogo
          logoUrl="https://example.com/external-logo.png"
          isLoaded={true}
          accommodationName="外部住宿"
        />
      );
      
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe('https://example.com/external-logo.png');
    });
  });
});
