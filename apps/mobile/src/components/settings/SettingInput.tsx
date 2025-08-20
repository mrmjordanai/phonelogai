import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SettingInputProps {
  label: string;
  value: string;
  onChangeText: (_text: string) => void;
  placeholder?: string;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onClear?: () => void;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}

export function SettingInput({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  multiline = false,
  numberOfLines = 1,
  error,
  icon,
  onClear,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  maxLength,
}: SettingInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      
      <View style={[
        styles.inputContainer,
        !editable ? styles.readOnlyContainer : {},
        error ? styles.errorContainer : {},
      ]}>
        {icon && (
          <Ionicons 
            name={icon} 
            size={20} 
            color={editable ? '#6B7280' : '#9CA3AF'} 
            style={styles.icon}
          />
        )}
        
        <TextInput
          style={[
            styles.input,
            multiline ? styles.multilineInput : {},
            !editable ? styles.readOnlyInput : {},
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
        />
        
        {editable && value && onClear && (
          <TouchableOpacity onPress={onClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
      
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
      
      {maxLength && editable && (
        <Text style={styles.charCount}>
          {value.length}/{maxLength}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    minHeight: 48,
  },
  readOnlyContainer: {
    backgroundColor: '#F9FAFB',
    borderColor: '#F3F4F6',
  },
  errorContainer: {
    borderColor: '#EF4444',
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 12,
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
  readOnlyInput: {
    color: '#6B7280',
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginTop: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
});