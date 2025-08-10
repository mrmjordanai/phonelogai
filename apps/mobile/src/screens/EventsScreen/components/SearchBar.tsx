import * as React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  FlatList,
  StyleSheet,
  ViewStyle,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import { SearchSuggestion } from '../types';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  suggestions?: SearchSuggestion[];
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  showSuggestions?: boolean;
  style?: ViewStyle;
  autoFocus?: boolean;
  disabled?: boolean;
}

interface SearchSuggestionItemProps {
  suggestion: SearchSuggestion;
  onPress: (suggestion: SearchSuggestion) => void;
  query: string;
}

function SearchSuggestionItem({ suggestion, onPress, query }: SearchSuggestionItemProps) {
  const getIcon = () => {
    switch (suggestion.type) {
      case 'contact': return '👤';
      case 'number': return '📞';
      case 'recent': return '🕒';
      default: return '🔍';
    }
  };

  const getHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, index) => (
      <Text
        key={index}
        style={part.toLowerCase() === highlight.toLowerCase() ? styles.highlightText : styles.suggestionText}
      >
        {part}
      </Text>
    ));
  };

  return (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => onPress(suggestion)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Search for ${suggestion.display}`}
    >
      <Text style={styles.suggestionIcon}>{getIcon()}</Text>
      <View style={styles.suggestionContent}>
        <Text style={styles.suggestionText} numberOfLines={1}>
          {getHighlightedText(suggestion.display, query)}
        </Text>
        {suggestion.metadata?.name && suggestion.metadata.name !== suggestion.display && (
          <Text style={styles.suggestionSecondary} numberOfLines={1}>
            {suggestion.metadata.name}
          </Text>
        )}
        {suggestion.metadata?.company && (
          <Text style={styles.suggestionSecondary} numberOfLines={1}>
            {suggestion.metadata.company}
          </Text>
        )}
      </View>
      {suggestion.type === 'recent' && (
        <Text style={styles.recentBadge}>Recent</Text>
      )}
    </TouchableOpacity>
  );
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onFocus,
  onBlur,
  placeholder = 'Search events...',
  suggestions = [],
  onSuggestionSelect,
  showSuggestions = true,
  style,
  autoFocus = false,
  disabled = false
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestionsList, setShowSuggestionsList] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const suggestionsHeight = useRef(new Animated.Value(0)).current;

  const hasText = value.trim().length > 0;
  const hasSuggestions = suggestions.length > 0;

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowSuggestionsList(showSuggestions && hasSuggestions);
    onFocus?.();
  }, [showSuggestions, hasSuggestions, onFocus]);

  // Handle blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Delay hiding suggestions to allow for tap
    setTimeout(() => setShowSuggestionsList(false), 150);
    onBlur?.();
  }, [onBlur]);

  // Handle text change
  const handleChangeText = useCallback((text: string) => {
    onChangeText(text);
    setShowSuggestionsList(showSuggestions && text.trim().length > 0 && hasSuggestions);
  }, [onChangeText, showSuggestions, hasSuggestions]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (hasText) {
      onSubmit?.(value.trim());
      textInputRef.current?.blur();
      Keyboard.dismiss();
    }
  }, [hasText, value, onSubmit]);

  // Handle clear
  const handleClear = useCallback(() => {
    onChangeText('');
    textInputRef.current?.focus();
  }, [onChangeText]);

  // Handle suggestion select
  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    onChangeText(suggestion.value);
    onSuggestionSelect?.(suggestion);
    textInputRef.current?.blur();
    setShowSuggestionsList(false);
    Keyboard.dismiss();
  }, [onChangeText, onSuggestionSelect]);

  // Animate suggestions list
  useEffect(() => {
    Animated.timing(suggestionsHeight, {
      toValue: showSuggestionsList ? Math.min(suggestions.length * 60, 240) : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [showSuggestionsList, suggestions.length, suggestionsHeight]);

  const containerStyle = [
    styles.container,
    style
  ];

  const inputContainerStyle = [
    styles.inputContainer,
    isFocused && styles.inputContainerFocused,
    disabled && styles.inputContainerDisabled
  ];

  return (
    <View style={containerStyle}>
      <View style={inputContainerStyle}>
        {/* Search Icon */}
        <Text style={styles.searchIcon}>🔍</Text>

        {/* Text Input */}
        <TextInput
          ref={textInputRef}
          style={styles.textInput}
          value={value}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={!disabled}
          selectTextOnFocus={true}
          accessibilityLabel="Search events"
          accessibilityRole="search"
        />

        {/* Clear Button */}
        {hasText && !disabled && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Search Button */}
        {hasText && (
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSubmit}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions List */}
      {showSuggestions && (
        <Animated.View
          style={[
            styles.suggestionsContainer,
            { height: suggestionsHeight }
          ]}
        >
          {showSuggestionsList && (
            <FlatList
              data={suggestions}
              keyExtractor={(item, index) => `${item.type}_${item.value}_${index}`}
              renderItem={({ item }) => (
                <SearchSuggestionItem
                  suggestion={item}
                  onPress={handleSuggestionSelect}
                  query={value}
                />
              )}
              style={styles.suggestionsList}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={Platform.OS === 'android'}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 1000, // Ensure suggestions appear above other content
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  inputContainerFocused: {
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputContainerDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    fontSize: 16,
    color: '#6B7280',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 8,
    minHeight: 24,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  clearIcon: {
    fontSize: 14,
    color: '#6B7280',
  },
  searchButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  searchButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionsList: {
    maxHeight: 240,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  suggestionIcon: {
    fontSize: 16,
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionText: {
    fontSize: 16,
    color: '#111827',
  },
  highlightText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
    backgroundColor: '#FEF3C7',
  },
  suggestionSecondary: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  recentBadge: {
    fontSize: 12,
    color: '#8B5CF6',
    fontWeight: '500',
  },
});

export default SearchBar;