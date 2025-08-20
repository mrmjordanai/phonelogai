import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { PrivacyControlsProps } from '../types';

export function PrivacyControls({
  contactId: _contactId,
  currentPrivacy,
  onPrivacyUpdate,
  disabled = false,
}: PrivacyControlsProps) {
  
  const currentVisibility = currentPrivacy?.visibility || 'team';
  const anonymizeNumber = currentPrivacy?.anonymize_number || false;
  const anonymizeContent = currentPrivacy?.anonymize_content || false;

  const visibilityOptions = [
    { value: 'private', label: 'Private', icon: '🔒', description: 'Only you can see' },
    { value: 'team', label: 'Team', icon: '👥', description: 'Team members can see' },
    { value: 'public', label: 'Public', icon: '🌐', description: 'Everyone can see' },
  ] as const;

  const handleVisibilityChange = (visibility: 'private' | 'team' | 'public') => {
    onPrivacyUpdate({ visibility });
  };

  const handleAnonymizeToggle = (field: 'number' | 'content') => {
    if (field === 'number') {
      onPrivacyUpdate({ anonymize_number: !anonymizeNumber });
    } else {
      onPrivacyUpdate({ anonymize_content: !anonymizeContent });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Privacy Settings</Text>

      {/* Visibility Controls */}
      <View style={styles.section}>
        <Text style={styles.label}>Who can see this contact</Text>
        <View style={styles.optionsContainer}>
          {visibilityOptions.map((option) => {
            const isSelected = currentVisibility === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  isSelected && styles.selectedOption,
                  disabled && styles.disabledOption,
                ]}
                onPress={() => handleVisibilityChange(option.value)}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${option.label}: ${option.description}`}
              >
                <Text style={[styles.optionIcon, isSelected && styles.selectedOptionIcon]}>
                  {option.icon}
                </Text>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionLabel, isSelected && styles.selectedOptionLabel]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.optionDescription, isSelected && styles.selectedOptionDescription]}>
                    {option.description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Anonymization Controls */}
      <View style={styles.section}>
        <Text style={styles.label}>Data Protection</Text>
        
        <TouchableOpacity
          style={[
            styles.toggleOption,
            anonymizeNumber && styles.toggleOptionEnabled,
            disabled && styles.disabledOption,
          ]}
          onPress={() => handleAnonymizeToggle('number')}
          disabled={disabled}
          accessibilityRole="switch"
          accessibilityState={{ checked: anonymizeNumber }}
          accessibilityLabel="Hide phone number"
        >
          <View style={styles.toggleContent}>
            <Text style={[styles.toggleLabel, anonymizeNumber && styles.toggleLabelEnabled]}>
              Hide Phone Number
            </Text>
            <Text style={[styles.toggleDescription, anonymizeNumber && styles.toggleDescriptionEnabled]}>
              Replace digits with asterisks (***-***-1234)
            </Text>
          </View>
          <View style={[styles.toggle, anonymizeNumber && styles.toggleEnabled]}>
            <Text style={styles.toggleIcon}>
              {anonymizeNumber ? '✓' : ''}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleOption,
            anonymizeContent && styles.toggleOptionEnabled,
            disabled && styles.disabledOption,
          ]}
          onPress={() => handleAnonymizeToggle('content')}
          disabled={disabled}
          accessibilityRole="switch"
          accessibilityState={{ checked: anonymizeContent }}
          accessibilityLabel="Hide message content"
        >
          <View style={styles.toggleContent}>
            <Text style={[styles.toggleLabel, anonymizeContent && styles.toggleLabelEnabled]}>
              Hide Message Content
            </Text>
            <Text style={[styles.toggleDescription, anonymizeContent && styles.toggleDescriptionEnabled]}>
              Replace SMS text with [Content Hidden]
            </Text>
          </View>
          <View style={[styles.toggle, anonymizeContent && styles.toggleEnabled]}>
            <Text style={styles.toggleIcon}>
              {anonymizeContent ? '✓' : ''}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  optionsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  selectedOption: {
    borderColor: '#3b82f6',
    backgroundColor: '#f0f9ff',
  },
  disabledOption: {
    opacity: 0.5,
  },
  optionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  selectedOptionIcon: {
    // Icon styling when selected
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  selectedOptionLabel: {
    color: '#1e40af',
  },
  optionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  selectedOptionDescription: {
    color: '#3b82f6',
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  toggleOptionEnabled: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  toggleContent: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  toggleLabelEnabled: {
    color: '#065f46',
  },
  toggleDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  toggleDescriptionEnabled: {
    color: '#10b981',
  },
  toggle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  toggleEnabled: {
    borderColor: '#10b981',
    backgroundColor: '#10b981',
  },
  toggleIcon: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
});