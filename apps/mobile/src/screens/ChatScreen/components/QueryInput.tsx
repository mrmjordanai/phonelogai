/**
 * QueryInput Component
 * Input field with send button and voice input placeholder
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Keyboard,
  Platform
} from 'react-native';
import { ChatInputProps } from '../types';

const QueryInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading = false,
  placeholder = "Ask about your calls and messages...",
  disabled = false
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery && !isLoading && !disabled) {
      onSendMessage(trimmedQuery);
      setQuery('');
      Keyboard.dismiss();
    }
  }, [query, isLoading, disabled, onSendMessage]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleSubmitEditing = useCallback(() => {
    handleSend();
  }, [handleSend]);

  const canSend = query.trim().length > 0 && !isLoading && !disabled;

  return (
    <View style={[
      styles.container,
      isFocused && styles.containerFocused,
      disabled && styles.containerDisabled
    ]}>
      {/* Main input area */}
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[
            styles.textInput,
            isFocused && styles.textInputFocused,
            disabled && styles.textInputDisabled
          ]}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor="#8E8E93"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSubmitEditing}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={!disabled}
          accessibilityLabel="Query input"
          accessibilityHint="Enter your question about calls and messages"
        />

        {/* Character counter for long queries */}
        {query.length > 400 && (
          <Text style={styles.characterCounter}>
            {query.length}/500
          </Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionContainer}>
        {/* Voice input placeholder - future feature */}
        <TouchableOpacity
          style={[
            styles.voiceButton,
            disabled && styles.voiceButtonDisabled
          ]}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Voice input"
          accessibilityHint="Voice input coming soon"
        >
          <Text style={styles.voiceButtonText}>🎤</Text>
        </TouchableOpacity>

        {/* Send button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            canSend && styles.sendButtonActive,
            !canSend && styles.sendButtonDisabled
          ]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send query"
          accessibilityHint="Send your question"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[
              styles.sendButtonText,
              canSend && styles.sendButtonTextActive
            ]}>
              Send
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Quick action hints */}
      {!isFocused && query.length === 0 && (
        <View style={styles.hintsContainer}>
          <Text style={styles.hintsText}>
            Try: "Show my top contacts" or "How many calls today?"
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        paddingBottom: 34, // Account for home indicator on iOS
      },
    }),
  },
  containerFocused: {
    borderTopColor: '#007AFF',
  },
  containerDisabled: {
    backgroundColor: '#F8F8F8',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
    minHeight: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: '#000000',
    maxHeight: 100,
    paddingVertical: 6,
  },
  textInputFocused: {
    color: '#000000',
  },
  textInputDisabled: {
    color: '#8E8E93',
  },
  characterCounter: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 8,
    alignSelf: 'flex-end',
    paddingBottom: 6,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
  },
  voiceButtonDisabled: {
    opacity: 0.5,
  },
  voiceButtonText: {
    fontSize: 18,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
    minWidth: 70,
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#007AFF',
  },
  sendButtonDisabled: {
    backgroundColor: '#E5E5EA',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
  },
  sendButtonTextActive: {
    color: '#FFFFFF',
  },
  hintsContainer: {
    marginTop: 4,
  },
  hintsText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export { QueryInput };