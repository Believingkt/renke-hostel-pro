import { useEffect, useState, useRef } from "react";

export function useCounterAnimation(
  targetValue: number,
  duration: number = 1000,
  isActive: boolean = true
) {
  const [currentValue, setCurrentValue] = useState(0);
  const prevTargetRef = useRef(targetValue);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!isActive) {
      setCurrentValue(targetValue);
      return;
    }

    // 如果目標值沒有改變，不執行動畫
    if (prevTargetRef.current === targetValue) {
      return;
    }

    const startValue = currentValue;
    const difference = targetValue - startValue;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 使用 easeOutCubic 緩動函數
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const newValue = startValue + difference * easeProgress;

      setCurrentValue(Math.round(newValue));

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        prevTargetRef.current = targetValue;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [targetValue, duration, isActive]);

  return currentValue;
}
