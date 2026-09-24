import { useEffect, useState, useRef } from "react";

export function useCounterAnimation(
  targetValue: number,
  duration: number = 1000,
  isActive: boolean = true
) {
  const [currentValue, setCurrentValue] = useState(0);
  const prevTargetRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (!isActive) {
      setCurrentValue(targetValue);
      prevTargetRef.current = targetValue;
      return;
    }

    if (prevTargetRef.current === targetValue && currentValue === targetValue) {
      return;
    }

    const startValue = currentValue;
    const difference = targetValue - startValue;

    if (difference === 0) {
      prevTargetRef.current = targetValue;
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const newValue = startValue + difference * easeProgress;

      setCurrentValue(Math.round(newValue));

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrentValue(targetValue);
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
