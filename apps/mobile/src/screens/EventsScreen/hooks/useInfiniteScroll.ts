import { useCallback, useRef, useEffect, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

interface UseInfiniteScrollProps {
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  loading: boolean;
  threshold?: number; // Distance from bottom to trigger load (pixels)
  throttleMs?: number; // Throttle load more calls
  enabled?: boolean;
}

interface UseInfiniteScrollReturn {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onEndReached: () => void;
  onEndReachedThreshold: number;
  isLoadingMore: boolean;
  scrollMetrics: {
    scrollY: number;
    contentHeight: number;
    layoutHeight: number;
    isNearBottom: boolean;
    scrollProgress: number; // 0-1
  };
}

interface ScrollMetrics {
  scrollY: number;
  contentHeight: number;
  layoutHeight: number;
  isNearBottom: boolean;
  scrollProgress: number;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  threshold = 200,
  throttleMs = 1000,
  enabled = true
}: UseInfiniteScrollProps): UseInfiniteScrollReturn {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    scrollY: 0,
    contentHeight: 0,
    layoutHeight: 0,
    isNearBottom: false,
    scrollProgress: 0
  });

  const lastLoadTime = useRef(0);
  const isLoadingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Throttled load more function
  const throttledLoadMore = useCallback(async () => {
    if (!enabled || !hasMore || loading || isLoadingRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastLoadTime.current < throttleMs) {
      return;
    }

    try {
      setIsLoadingMore(true);
      isLoadingRef.current = true;
      lastLoadTime.current = now;

      await onLoadMore();
    } catch (error) {
      console.error('Error loading more items:', error);
    } finally {
      setIsLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [enabled, hasMore, loading, onLoadMore, throttleMs]);

  // Calculate scroll metrics and determine if should load more
  const updateScrollMetrics = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollY = contentOffset.y;
    const contentHeight = contentSize.height;
    const layoutHeight = layoutMeasurement.height;
    
    const distanceFromBottom = contentHeight - (scrollY + layoutHeight);
    const isNearBottom = distanceFromBottom <= threshold;
    const scrollProgress = contentHeight > layoutHeight 
      ? Math.min(1, Math.max(0, scrollY / (contentHeight - layoutHeight)))
      : 0;

    const metrics: ScrollMetrics = {
      scrollY,
      contentHeight,
      layoutHeight,
      isNearBottom,
      scrollProgress
    };

    setScrollMetrics(metrics);

    // Trigger load more if near bottom
    if (isNearBottom && enabled && hasMore && !loading && !isLoadingRef.current) {
      throttledLoadMore();
    }
  }, [threshold, enabled, hasMore, loading, throttledLoadMore]);

  // Debounced scroll handler to improve performance
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Update metrics immediately for smooth UI feedback
    updateScrollMetrics(event);

    // Debounce expensive operations
    scrollTimeoutRef.current = setTimeout(() => {
      // Any expensive scroll-related operations can go here
    }, 16); // ~60fps
  }, [updateScrollMetrics]);

  // FlatList onEndReached handler (fallback)
  const onEndReached = useCallback(() => {
    if (enabled && hasMore && !loading && !isLoadingRef.current) {
      throttledLoadMore();
    }
  }, [enabled, hasMore, loading, throttledLoadMore]);

  // Clean up timeouts
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Reset loading state when props change
  useEffect(() => {
    setIsLoadingMore(false);
    isLoadingRef.current = false;
  }, [hasMore, loading]);

  // Calculate onEndReachedThreshold for FlatList (0-1)
  const onEndReachedThreshold = 0.1; // Load when 10% from bottom

  return {
    onScroll,
    onEndReached,
    onEndReachedThreshold,
    isLoadingMore,
    scrollMetrics
  };
}

// Additional hook for scroll-to-top functionality
export function useScrollToTop() {
  const scrollRef = useRef<any>(null);

  const scrollToTop = useCallback((animated: boolean = true) => {
    scrollRef.current?.scrollToOffset?.({
      offset: 0,
      animated
    });
  }, []);

  const scrollToIndex = useCallback((index: number, animated: boolean = true) => {
    scrollRef.current?.scrollToIndex?.({
      index,
      animated
    });
  }, []);

  return {
    scrollRef,
    scrollToTop,
    scrollToIndex
  };
}

// Hook for scroll performance monitoring
export function useScrollPerformance() {
  const [metrics, setMetrics] = useState({
    averageFrameTime: 0,
    droppedFrames: 0,
    totalFrames: 0,
    lastUpdateTime: Date.now()
  });

  const frameTimeRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());

  const recordFrame = useCallback(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    frameTimeRef.current.push(frameTime);

    // Keep only recent frames (last 60)
    if (frameTimeRef.current.length > 60) {
      frameTimeRef.current.shift();
    }

    // Update metrics every 30 frames
    if (frameTimeRef.current.length % 30 === 0) {
      const avgFrameTime = frameTimeRef.current.reduce((a, b) => a + b, 0) / frameTimeRef.current.length;
      const droppedFrames = frameTimeRef.current.filter(time => time > 16.67).length; // 60fps = 16.67ms per frame

      setMetrics(prev => ({
        averageFrameTime: avgFrameTime,
        droppedFrames: prev.droppedFrames + droppedFrames,
        totalFrames: prev.totalFrames + frameTimeRef.current.length,
        lastUpdateTime: Date.now()
      }));
    }
  }, []);

  const resetMetrics = useCallback(() => {
    setMetrics({
      averageFrameTime: 0,
      droppedFrames: 0,
      totalFrames: 0,
      lastUpdateTime: Date.now()
    });
    frameTimeRef.current = [];
  }, []);

  return {
    metrics,
    recordFrame,
    resetMetrics
  };
}