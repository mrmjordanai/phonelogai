/**
 * ComponentOptimizer - React component optimization utilities
 * 
 * Provides HOCs, hooks, and utilities for optimizing React Native
 * component performance with memoization, virtualization, and more.
 */

import React, { 
  memo, 
  useMemo, 
  useCallback, 
  useRef, 
  useEffect, 
  ComponentType,
  forwardRef,
} from 'react';
import { View, ViewStyle, LayoutChangeEvent } from 'react-native';
import PerformanceMonitor from '../services/PerformanceMonitor';

// Performance monitoring HOC
export function withPerformanceMonitoring<P extends {}>(
  WrappedComponent: ComponentType<P>,
  componentName?: string
) {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const EnhancedComponent = forwardRef<unknown, P>((props, ref) => {
    const performanceMonitor = PerformanceMonitor.getInstance();
    const mountStartTime = useRef<number>(Date.now());
    const renderStartTime = useRef<number>(0);

    useEffect(() => {
      const mountTime = Date.now() - mountStartTime.current;
      performanceMonitor.recordScreenMount(displayName, mountTime);
      
      return () => {
        // Component unmounting
        console.log(`[ComponentOptimizer] ${displayName} unmounted`);
      };
    }, []);

    useEffect(() => {
      if (renderStartTime.current > 0) {
        const renderTime = Date.now() - renderStartTime.current;
        performanceMonitor.recordScreenRender(displayName, renderTime);
      }
    });

    renderStartTime.current = Date.now();

    return <WrappedComponent {...props} ref={ref} />;
  });

  EnhancedComponent.displayName = `withPerformanceMonitoring(${displayName})`;
  
  return EnhancedComponent;
}

// Memoization HOC with custom comparison
export function withOptimizedMemo<P extends {}>(
  WrappedComponent: ComponentType<P>,
  propsAreEqual?: (_prevProps: P, _nextProps: P) => boolean
) {
  const defaultPropsAreEqual = (prevProps: P, nextProps: P): boolean => {
    const prevKeys = Object.keys(prevProps as Record<string, unknown>);
    const nextKeys = Object.keys(nextProps as Record<string, unknown>);
    
    if (prevKeys.length !== nextKeys.length) {
      return false;
    }
    
    for (const key of prevKeys) {
      if ((prevProps as Record<string, unknown>)[key] !== (nextProps as Record<string, unknown>)[key]) {
        return false;
      }
    }
    
    return true;
  };

  return memo(WrappedComponent, propsAreEqual || defaultPropsAreEqual);
}

// Lazy loading HOC
export function withLazyLoading<P extends {}>(
  componentLoader: () => Promise<{ default: ComponentType<P> }>,
  fallback?: React.ComponentType
): ComponentType<P> {
  const LazyComponent = React.lazy(componentLoader);
  
  const LazyWrapper = (props: P) => (
    <React.Suspense fallback={fallback ? React.createElement(fallback) : <View />}>
      <LazyComponent {...(props as any)} />
    </React.Suspense>
  );
  
  return LazyWrapper;
}

// Performance-optimized list item HOC
export function withListItemOptimization<P extends { index?: number }>(
  WrappedComponent: ComponentType<P>
) {
  return memo(WrappedComponent, (prevProps: P, nextProps: P) => {
    // Optimize for list items by comparing critical props
    if (prevProps.index !== nextProps.index) {
      return false;
    }
    
    // Deep comparison for other props
    const prevKeys = Object.keys(prevProps as Record<string, unknown>).filter(key => key !== 'index');
    const nextKeys = Object.keys(nextProps as Record<string, unknown>).filter(key => key !== 'index');
    
    if (prevKeys.length !== nextKeys.length) {
      return false;
    }
    
    for (const key of prevKeys) {
      if ((prevProps as Record<string, unknown>)[key] !== (nextProps as Record<string, unknown>)[key]) {
        return false;
      }
    }
    
    return true;
  });
}

// Debounced callback hook
export function useDebouncedCallback<T extends (..._args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: React.DependencyList
): T {
  const callbackRef = useRef<T>(callback);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update callback ref when deps change
  useEffect(() => {
    callbackRef.current = callback;
  }, deps);
  
  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

// Memoized style hook
export function useMemoizedStyle<T extends ViewStyle>(
  styleFactory: () => T,
  deps: React.DependencyList
): T {
  return useMemo(styleFactory, deps);
}

// Optimized children rendering hook
export function useOptimizedChildren(
  children: React.ReactNode,
  shouldUpdate: boolean = true
): React.ReactNode {
  const memoizedChildren = useMemo(() => children, [shouldUpdate ? children : null]);
  return memoizedChildren;
}

// Performance tracking hook
export function usePerformanceTracking(componentName: string) {
  const performanceMonitor = PerformanceMonitor.getInstance();
  const renderCount = useRef<number>(0);
  const renderStartTime = useRef<number>(0);
  
  useEffect(() => {
    renderStartTime.current = Date.now();
    renderCount.current += 1;
  });
  
  useEffect(() => {
    if (renderStartTime.current > 0) {
      const renderTime = Date.now() - renderStartTime.current;
      performanceMonitor.recordScreenRender(componentName, renderTime);
      
      if (renderTime > 100) {
        console.warn(`[ComponentOptimizer] Slow render in ${componentName}: ${renderTime}ms (render #${renderCount.current})`);
      }
    }
  });
  
  return {
    renderCount: renderCount.current,
    recordCustomMetric: (name: string, value: number) => {
      console.log(`[ComponentOptimizer] ${componentName} - ${name}: ${value}`);
    },
  };
}

// Optimized event handler hook
export function useOptimizedEventHandler<T extends (..._args: unknown[]) => unknown>(
  handler: T,
  deps: React.DependencyList
): T {
  return useCallback(handler, deps);
}

// Memory-efficient data processing hook
export function useMemoryEfficientProcessor<T, R>(
  data: T[],
  processor: (_item: T, _index: number) => R,
  batchSize: number = 100
): R[] {
  return useMemo(() => {
    if (data.length <= batchSize) {
      return data.map(processor);
    }
    
    // Process in batches for large datasets
    const results: R[] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      results.push(...batch.map((item, batchIndex) => processor(item, i + batchIndex)));
    }
    
    return results;
  }, [data, processor, batchSize]);
}

// Component size optimization hook
export function useComponentSizeOptimization(
  targetSize: { width?: number; height?: number } = {}
) {
  const viewRef = useRef<View>(null);
  const [measuredSize, setMeasuredSize] = React.useState(targetSize);
  
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasuredSize({ width, height });
  }, []);
  
  const optimizedStyle = useMemo(() => {
    const style: ViewStyle = {};
    
    if (targetSize.width && measuredSize.width !== targetSize.width) {
      style.width = targetSize.width;
    }
    
    if (targetSize.height && measuredSize.height !== targetSize.height) {
      style.height = targetSize.height;
    }
    
    return style;
  }, [targetSize, measuredSize]);
  
  return {
    viewRef,
    onLayout,
    optimizedStyle,
    measuredSize,
  };
}

// Performance-optimized image loading hook
export function useOptimizedImageLoading(
  uri: string,
  dimensions: { width: number; height: number }
) {
  const optimizedUri = useMemo(() => {
    if (!uri || !uri.startsWith('http')) {
      return uri;
    }
    
    try {
      const url = new globalThis.URL(uri);
      url.searchParams.set('w', dimensions.width.toString());
      url.searchParams.set('h', dimensions.height.toString());
      url.searchParams.set('q', '80');
      
      return url.toString();
    } catch {
      return uri;
    }
  }, [uri, dimensions.width, dimensions.height]);
  
  return optimizedUri;
}

// Component visibility optimization hook
export function useVisibilityOptimization(threshold: number = 0.5) {
  const [isVisible] = React.useState(true);
  const observerRef = useRef<{ disconnect?: () => void } | null>(null);
  const elementRef = useRef<View>(null);
  
  useEffect(() => {
    // In a real implementation, you would use an intersection observer
    // For React Native, this would be implemented differently
    return () => {
      observerRef.current?.disconnect?.();
    };
  }, [threshold]);
  
  return {
    elementRef,
    isVisible,
  };
}

// Batch state updates hook
export function useBatchedUpdates<T>(initialState: T) {
  const [state, setState] = React.useState<T>(initialState);
  const batchedUpdates = useRef<Partial<T>[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const batchUpdate = useCallback((update: Partial<T>) => {
    batchedUpdates.current.push(update);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      const mergedUpdate = batchedUpdates.current.reduce(
        (acc, update) => ({ ...acc, ...update }),
        {}
      );
      
      setState(prevState => ({ ...prevState, ...mergedUpdate }));
      batchedUpdates.current = [];
    }, 16); // Next frame
  }, []);
  
  return [state, batchUpdate] as const;
}

// Performance wrapper component for debugging
export const PerformanceWrapper: React.FC<{
  name: string;
  children: React.ReactNode;
  enableLogging?: boolean;
}> = ({ name, children, enableLogging = __DEV__ }) => {
  const renderCount = useRef(0);
  
  useEffect(() => {
    renderCount.current += 1;
    
    if (enableLogging) {
      console.log(`[PerformanceWrapper] ${name} rendered (count: ${renderCount.current})`);
    }
  });
  
  if (enableLogging && renderCount.current > 10) {
    console.warn(`[PerformanceWrapper] ${name} has rendered ${renderCount.current} times - check for unnecessary re-renders`);
  }
  
  return <>{children}</>;
};

// Export all optimization utilities
export const ComponentOptimizer = {
  withPerformanceMonitoring,
  withOptimizedMemo,
  withLazyLoading,
  withListItemOptimization,
  useDebouncedCallback,
  useMemoizedStyle,
  useOptimizedChildren,
  usePerformanceTracking,
  useOptimizedEventHandler,
  useMemoryEfficientProcessor,
  useComponentSizeOptimization,
  useOptimizedImageLoading,
  useVisibilityOptimization,
  useBatchedUpdates,
  PerformanceWrapper,
};

export default ComponentOptimizer;