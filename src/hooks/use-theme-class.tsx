import * as React from "react";

/**
 * Hook to get the current theme class from the DOM
 * Useful for Portal components that render outside the theme context
 */
export function useThemeClass() {
  const [themeClass, setThemeClass] = React.useState<string>('');

  React.useEffect(() => {
    // 尋找帶有主題 class 的元素
    const findThemeClass = () => {
      const themeElement = document.querySelector('[class*="theme-"]');
      if (themeElement instanceof HTMLElement) {
        const foundClass = themeElement.className
          .split(' ')
          .find(c => c.startsWith('theme-'));
        return foundClass || '';
      }
      return '';
    };
    
    setThemeClass(findThemeClass());

    // 監聽 DOM 變化以更新主題
    const observer = new MutationObserver(() => {
      setThemeClass(findThemeClass());
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return themeClass;
}