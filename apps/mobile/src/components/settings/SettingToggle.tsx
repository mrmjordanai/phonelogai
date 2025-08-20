import React from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SettingToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (_value: boolean) => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}

export function SettingToggle({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  icon,
  testID,
}: SettingToggleProps) {
  const handlePress = () => {
    if (!disabled) {
      onValueChange(!value);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        disabled && styles.disabled
      ]}
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {icon && (
            <Ionicons 
              name={icon} 
              size={20} 
              color={disabled ? '#9CA3AF' : '#6B7280'} 
            />
          )}
        </View>
        
        <View style={styles.textContainer}>
          <Text style={[
            styles.label,
            disabled && styles.disabledText
          ]}>
            {label}
          </Text>
          {description && (
            <Text style={[
              styles.description,
              disabled && styles.disabledText
            ]}>
              {description}
            </Text>
          )}
        </View>
        
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ 
            false: '#E5E7EB', 
            true: '#3B82F6' 
          }}
          thumbColor={value ? '#FFFFFF' : '#F3F4F6'}
          ios_backgroundColor="#E5E7EB"
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.6,
  },
  disabledText: {
    color: '#9CA3AF',
  },
});