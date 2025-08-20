import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface PickerOption {
  label: string;
  value: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface SettingPickerProps {
  label: string;
  description?: string;
  value: string;
  options: PickerOption[];
  onValueChange: (_value: string) => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}

export function SettingPicker({
  label,
  description,
  value,
  options,
  onValueChange,
  disabled = false,
  icon,
  testID,
}: SettingPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  
  const selectedOption = options.find(option => option.value === value);

  const handleOptionSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setModalVisible(false);
  };

  const renderOption = ({ item }: { item: PickerOption }) => (
    <TouchableOpacity
      style={[
        styles.option,
        item.value === value && styles.selectedOption
      ]}
      onPress={() => handleOptionSelect(item.value)}
    >
      <View style={styles.optionContent}>
        {item.icon && (
          <Ionicons
            name={item.icon}
            size={20}
            color={item.value === value ? '#3B82F6' : '#6B7280'}
            style={styles.optionIcon}
          />
        )}
        <View style={styles.optionText}>
          <Text style={[
            styles.optionLabel,
            item.value === value && styles.selectedOptionLabel
          ]}>
            {item.label}
          </Text>
          {item.description && (
            <Text style={styles.optionDescription}>
              {item.description}
            </Text>
          )}
        </View>
        {item.value === value && (
          <Ionicons
            name="checkmark"
            size={20}
            color="#3B82F6"
          />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.selector,
          disabled && styles.disabled
        ]}
        onPress={() => !disabled && setModalVisible(true)}
        disabled={disabled}
        testID={testID}
      >
        <View style={styles.selectorContent}>
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
            <Text style={[
              styles.selectedValue,
              disabled && styles.disabledText
            ]}>
              {selectedOption?.label || 'Select...'}
            </Text>
          </View>
          
          <Ionicons
            name="chevron-down"
            size={20}
            color={disabled ? '#9CA3AF' : '#6B7280'}
          />
        </View>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={renderOption}
              style={styles.optionsList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  selector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  selectorContent: {
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
    marginBottom: 4,
  },
  selectedValue: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.6,
  },
  disabledText: {
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  optionsList: {
    paddingHorizontal: 20,
  },
  option: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectedOption: {
    backgroundColor: '#F0F9FF',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: 12,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  selectedOptionLabel: {
    color: '#3B82F6',
  },
  optionDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 18,
  },
});