import { useState, useRef, useCallback } from "react";

export function usePullToRefresh(onRefresh) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const THRESHOLD = 60;

  const onTouchStart = useCallback((e) => {
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    } else {
      pulling.current = false;
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pulling.current) return;
    const distance = e.touches[0].clientY - startY.current;
    if (distance > 0 && window.scrollY <= 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance > THRESHOLD) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  return {
    pullDistance,
    isRefreshing,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd }
  };
}