import React, { useEffect, useRef, useCallback, useState, RefObject } from 'react';

/**
 * Standard debounce utility with cancel method
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
      timerId = null;
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return debounced;
}

/**
 * Standard throttle utility with cancel method
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limitMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      timeoutId = setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          throttled(...lastArgs);
          lastArgs = null;
        }
      }, limitMs);
    } else {
      lastArgs = args;
    }
  };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    inThrottle = false;
    lastArgs = null;
  };

  return throttled;
}

/**
 * Hook providing a debounced callback that auto-cleans up on unmount or dependency update
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cancel;
  }, [cancel]);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timeoutRef.current = null;
      }, delayMs);
    },
    [delayMs, cancel]
  );

  return Object.assign(debouncedFn, { cancel });
}

/**
 * Hook that listens to window resize with debouncing to avoid pegging main JS thread
 */
export function useDebouncedWindowResize(
  onResize?: (dimensions: { width: number; height: number }) => void,
  delayMs = 150
): { width: number; height: number } {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  }));

  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = debounce(() => {
      const next = { width: window.innerWidth, height: window.innerHeight };
      setDimensions(next);
      onResizeRef.current?.(next);
    }, delayMs);

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      handleResize.cancel();
      window.removeEventListener('resize', handleResize);
    };
  }, [delayMs]);

  return dimensions;
}

/**
 * Hook for observing element container bounds via ResizeObserver with debouncing
 */
export function useDebouncedElementResize(
  targetRef: React.RefObject<HTMLElement | null>,
  onResize: (entry: ResizeObserverEntry) => void,
  delayMs = 100
): void {
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const el = targetRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let latestEntry: ResizeObserverEntry | null = null;

    const debouncedNotify = debounce(() => {
      if (latestEntry) {
        onResizeRef.current(latestEntry);
      }
    }, delayMs);

    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        latestEntry = entries[0];
        debouncedNotify();
      }
    });

    observer.observe(el);

    return () => {
      debouncedNotify.cancel();
      observer.disconnect();
    };
  }, [targetRef, delayMs]);
}

/**
 * Hook to manage safe timeouts that auto-clear on unmount
 */
export function useSafeTimeout() {
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const setSafeTimeout = useCallback((callback: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      timeoutIdsRef.current.delete(id);
      callback();
    }, delayMs);
    timeoutIdsRef.current.add(id);
    return id;
  }, []);

  const clearSafeTimeout = useCallback((id: ReturnType<typeof setTimeout>) => {
    clearTimeout(id);
    timeoutIdsRef.current.delete(id);
  }, []);

  useEffect(() => {
    const ids = timeoutIdsRef.current;
    return () => {
      ids.forEach(id => clearTimeout(id));
      ids.clear();
    };
  }, []);

  return { setSafeTimeout, clearSafeTimeout };
}
