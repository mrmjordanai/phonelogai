import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SettingButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline';
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function SettingButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  icon,
  iconPosition = 'left',
  fullWidth = true,
  size = 'medium',
}: SettingButtonProps) {
  const getButtonStyle = () => {
    const baseStyle: ViewStyle[] = [styles.button];
    
    if (fullWidth) baseStyle.push(styles.fullWidth);
    
    switch (size) {
      case 'small':
        baseStyle.push(styles.smallButton);
        break;
      case 'large':
        baseStyle.push(styles.largeButton);
        break;
      default:
        baseStyle.push(styles.mediumButton);
    }
    
    switch (variant) {
      case 'primary':
        baseStyle.push(styles.primaryButton);
        break;
      case 'secondary':
        baseStyle.push(styles.secondaryButton);
        break;
      case 'destructive':
        baseStyle.push(styles.destructiveButton);
        break;
      case 'outline':
        baseStyle.push(styles.outlineButton);
        break;
    }
    
    if (disabled || loading) {
      baseStyle.push(styles.disabledButton);
    }
    
    return baseStyle;
  };

  const getTextStyle = () => {
    const baseStyle: TextStyle[] = [styles.buttonText];
    
    switch (size) {
      case 'small':
        baseStyle.push(styles.smallText);
        break;
      case 'large':
        baseStyle.push(styles.largeText);
        break;
      default:
        baseStyle.push(styles.mediumText);
    }
    
    switch (variant) {
      case 'primary':
        baseStyle.push(styles.primaryText);
        break;
      case 'secondary':
        baseStyle.push(styles.secondaryText);
        break;
      case 'destructive':
        baseStyle.push(styles.destructiveText);
        break;
      case 'outline':
        baseStyle.push(styles.outlineText);
        break;
    }
    
    if (disabled || loading) {
      baseStyle.push(styles.disabledText);
    }
    
    return baseStyle;
  };

  const getIconColor = () => {
    if (disabled || loading) return '#9CA3AF';
    
    switch (variant) {
      case 'primary':
        return '#FFFFFF';
      case 'secondary':
        return '#374151';
      case 'destructive':
        return '#FFFFFF';
      case 'outline':
        return '#3B82F6';
      default:
        return '#FFFFFF';
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator 
            size="small" 
            color={getIconColor()} 
            style={{ marginRight: 8 }}
          />
          <Text style={getTextStyle()}>{title}</Text>
        </View>
      );
    }

    const iconElement = icon && (
      <Ionicons 
        name={icon} 
        size={size === 'small' ? 16 : size === 'large' ? 24 : 20} 
        color={getIconColor()}
        style={iconPosition === 'left' ? { marginRight: 8 } : { marginLeft: 8 }}
      />
    );

    return (
      <View style={styles.contentContainer}>
        {iconPosition === 'left' && iconElement}
        <Text style={getTextStyle()}>{title}</Text>
        {iconPosition === 'right' && iconElement}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {renderContent()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
  mediumButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  largeButton: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 56,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
  },
  destructiveButton: {
    backgroundColor: '#EF4444',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  disabledButton: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#374151',
  },
  destructiveText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: '#3B82F6',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});