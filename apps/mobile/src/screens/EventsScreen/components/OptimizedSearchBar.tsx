/**
 * OptimizedSearchBar - High-performance search component
 * 
 * Optimized search with debouncing, caching, and performance monitoring
 * for handling large datasets efficiently.
 */

import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import { SearchSuggestion } from '../types';
import { useDebounce } from '../hooks';
import PerformanceMonitor from '../../../services/PerformanceMonitor';

interface OptimizedSearchBarProps {
  value: string;
  placeholder?: string;
  suggestions?: SearchSuggestion[];
  recentSearches?: string[];
  maxSuggestions?: number;
  debounceMs?: number;
  onChangeText: (_text: string) => void;
  onSearch: (_query: string) => void;
  onSuggestionPress: (_suggestion: SearchSuggestion) => void;
  onClear: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  enablePerformanceMonitoring?: boolean;
}

// Performance configuration
const PERFORMANCE_CONFIG = {
  DEBOUNCE_MS: 300,
  MAX_SUGGESTIONS: 5,
  MAX_RECENT_SEARCHES: 10,
  ANIMATION_DURATION: 200,
  SUGGESTION_RENDER_THRESHOLD: 100, // Log if suggestion rendering takes > 100ms
};

// Memoized suggestion item
const SuggestionItem = memo<{
  suggestion: SearchSuggestion;
  onPress: (_suggestion: SearchSuggestion) => void;
  index: number;
}>(({ suggestion, onPress, index }) => {
  const handlePress = useCallback(() => {
    onPress(suggestion);
  }, [suggestion, onPress]);

  return (
    <TouchableOpacity
      style={[styles.suggestionItem, index === 0 && styles.firstSuggestionItem]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Search suggestion: ${suggestion.display}`}
    >
      <View style={styles.suggestionContent}>
        <Text style={styles.suggestionText} numberOfLines={1}>
          {suggestion.display}
        </Text>
        {suggestion.metadata && (
          <Text style={styles.suggestionCount}>
            {suggestion.type}
          </Text>
        )}
      </View>
      {suggestion.type && (
        <Text style={styles.suggestionType}>
          {suggestion.type}
        </Text>
      )}
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.suggestion.display === nextProps.suggestion.display &&
    prevProps.suggestion.value === nextProps.suggestion.value &&
    prevProps.index === nextProps.index
  );
});

SuggestionItem.displayName = 'SuggestionItem';

const OptimizedSearchBar: React.FC<OptimizedSearchBarProps> = ({
  value,
  placeholder = 'Search events...',
  suggestions = [],
  recentSearches = [],
  maxSuggestions = PERFORMANCE_CONFIG.MAX_SUGGESTIONS,
  debounceMs = PERFORMANCE_CONFIG.DEBOUNCE_MS,
  onChangeText,
  onSearch,
  onSuggestionPress,
  onClear,
  onFocus,
  onBlur,
  enablePerformanceMonitoring = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchStartTime, setSearchStartTime] = useState<number>(0);
  
  const inputRef = useRef<TextInput>(null);
  const suggestionsHeight = useRef(new Animated.Value(0)).current;
  const performanceMonitor = PerformanceMonitor.getInstance();

  // Debounced search value for performance
  const debouncedValue = useDebounce(value, debounceMs);

  /**
   * Performance monitoring for search operations
   */
  useEffect(() => {
    if (enablePerformanceMonitoring && searchStartTime > 0 && debouncedValue) {
      const searchTime = Date.now() - searchStartTime;
      performanceMonitor.recordNetworkRequest(
        'search',
        'GET',
        searchTime,
        debouncedValue.length,
        true
      );
      
      console.log(`[OptimizedSearchBar] Search completed in ${searchTime}ms for "${debouncedValue}"`);
    }
  }, [debouncedValue, searchStartTime, enablePerformanceMonitoring]);

  /**
   * Optimized suggestions with caching
   */
  const optimizedSuggestions = useMemo(() => {
    const startTime = Date.now();
    
    let allSuggestions: SearchSuggestion[] = [];
    
    // Add search suggestions
    if (suggestions.length > 0) {
      allSuggestions = [...suggestions];
    }
    
    // Add recent searches as suggestions if no current suggestions
    if (allSuggestions.length === 0 && recentSearches.length > 0 && value.length === 0) {
      allSuggestions = recentSearches.slice(0, maxSuggestions).map(search => ({
        value: search,
        display: search,
        type: 'recent',
      }));
    }
    
    // Filter and limit suggestions
    const filteredSuggestions = allSuggestions
      .filter(suggestion => 
        suggestion.display.toLowerCase().includes(value.toLowerCase()) ||
        value.length === 0
      )
      .slice(0, maxSuggestions);
    
    const processingTime = Date.now() - startTime;
    
    if (enablePerformanceMonitoring && processingTime > PERFORMANCE_CONFIG.SUGGESTION_RENDER_THRESHOLD) {
      console.warn(`[OptimizedSearchBar] Slow suggestion processing: ${processingTime}ms`);
    }
    
    return filteredSuggestions;
  }, [suggestions, recentSearches, value, maxSuggestions, enablePerformanceMonitoring]);

  /**
   * Handle text change with performance tracking
   */
  const handleChangeText = useCallback((text: string) => {
    if (text !== value) {
      setSearchStartTime(Date.now());
      onChangeText(text);
      
      // Show/hide suggestions based on text
      const shouldShowSuggestions = text.length > 0 || (isFocused && recentSearches.length > 0);
      setShowSuggestions(shouldShowSuggestions);
    }
  }, [value, onChangeText, isFocused, recentSearches.length]);

  /**
   * Handle search submission
   */
  const handleSearch = useCallback(() => {
    if (value.trim()) {
      onSearch(value.trim());
      setShowSuggestions(false);
      Keyboard.dismiss();
    }
  }, [value, onSearch]);

  /**
   * Handle suggestion press
   */
  const handleSuggestionPress = useCallback((suggestion: SearchSuggestion) => {
    onSuggestionPress(suggestion);
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, [onSuggestionPress]);

  /**
   * Handle clear
   */
  const handleClear = useCallback(() => {
    onClear();
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [onClear]);

  /**
   * Handle focus
   */
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowSuggestions(value.length > 0 || recentSearches.length > 0);
    onFocus?.();
  }, [value.length, recentSearches.length, onFocus]);

  /**
   * Handle blur
   */
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Delay hiding suggestions to allow suggestion press
    setTimeout(() => setShowSuggestions(false), 150);
    onBlur?.();
  }, [onBlur]);

  /**
   * Animate suggestions visibility
   */
  useEffect(() => {
    const targetHeight = showSuggestions && optimizedSuggestions.length > 0 
      ? optimizedSuggestions.length * 50 
      : 0;
    
    Animated.timing(suggestionsHeight, {
      toValue: targetHeight,
      duration: PERFORMANCE_CONFIG.ANIMATION_DURATION,
      useNativeDriver: false,
    }).start();
  }, [showSuggestions, optimizedSuggestions.length, suggestionsHeight]);

  /**
   * Render suggestions list
   */
  const renderSuggestions = useCallback(() => {
    if (!showSuggestions || optimizedSuggestions.length === 0) {
      return null;
    }

    return (
      <Animated.View 
        style={[
          styles.suggestionsContainer,
          { height: suggestionsHeight }
        ]}
      >
        <View style={styles.suggestionsList}>
          {optimizedSuggestions.map((suggestion, index) => (
            <SuggestionItem
              key={`${suggestion.display}-${index}`}
              suggestion={suggestion}
              onPress={handleSuggestionPress}
              index={index}
            />
          ))}
        </View>
      </Animated.View>
    );
  }, [showSuggestions, optimizedSuggestions, handleSuggestionPress, suggestionsHeight]);

  return (
    <View style={styles.container}>
      <View style={[styles.searchInputContainer, isFocused && styles.searchInputFocused]}>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          value={value}
          placeholder={placeholder}
          placeholderTextColor="#6c757d"
          onChangeText={handleChangeText}
          onSubmitEditing={handleSearch}
          onFocus={handleFocus}
          onBlur={handleBlur}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
          accessible={true}
          accessibilityLabel="Search input"
          accessibilityHint="Enter search terms to filter events"
        />
        
        {value.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearButtonText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {renderSuggestions()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  searchInputFocused: {
    borderColor: '#007AFF',
    backgroundColor: '#fff',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
    paddingVertical: 0, // Remove default padding
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  clearButtonText: {
    fontSize: 20,
    color: '#6c757d',
    fontWeight: 'bold',
  },
  suggestionsContainer: {
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  suggestionsList: {
    paddingHorizontal: 16,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
    minHeight: 50,
  },
  firstSuggestionItem: {
    borderTopWidth: 1,
    borderTopColor: '#f8f9fa',
  },
  suggestionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 8,
  },
  suggestionText: {
    fontSize: 14,
    color: '#212529',
    flex: 1,
  },
  suggestionCount: {
    fontSize: 12,
    color: '#6c757d',
    marginLeft: 8,
    fontWeight: '500',
  },
  suggestionType: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default OptimizedSearchBar;