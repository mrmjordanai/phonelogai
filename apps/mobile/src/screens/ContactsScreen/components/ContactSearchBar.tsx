import React, { useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Keyboard,
} from 'react-native';
import { ContactSearchBarProps } from '../types';

export function ContactSearchBar({
  searchTerm,
  onSearchChange,
  onClear,
  onFocus,
  onBlur,
  placeholder = 'Search contacts...',
  autoFocus = false,
}: ContactSearchBarProps & {
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const inputRef = useRef<TextInput>(null);

  const handleClear = () => {
    onClear();
    inputRef.current?.focus();
  };

  const handleCancel = () => {
    onClear();
    Keyboard.dismiss();
    onBlur?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        {/* Search Icon */}
        <View style={styles.searchIcon}>
          <Text style={styles.searchIconText}>🔍</Text>
        </View>

        {/* Text Input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={searchTerm}
          onChangeText={onSearchChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="words"
          clearButtonMode="never" // We'll handle our own clear button
          returnKeyType="search"
          accessibilityLabel="Search contacts"
          accessibilityHint="Type to search for contacts by name, number, or company"
        />

        {/* Clear Button */}
        {searchTerm.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Cancel Button (shown when focused) */}
      {searchTerm.length > 0 && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchIconText: {
    fontSize: 16,
    color: '#6b7280',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 0, // Remove default padding on Android
    minHeight: 20, // Ensure consistent height
  },
  clearButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '500',
  },
});