import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons as Icon } from '@expo/vector-icons';

import { DataCollectionMethod } from '../../../services/DataCollectionGuidanceService';
import { SmsLogCollector } from '../../../services/android/SmsLogCollector';
import { OfflineQueue } from '../../../services/OfflineQueue';

interface ManualEntryFormsProps {
  selectedMethod: DataCollectionMethod | null;
  onBack: () => void;
}

interface CallFormData {
  number: string;
  contactName: string;
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  duration: string;
  callType: 'voice' | 'video';
  status?: 'answered' | 'missed' | 'declined';
}

interface SmsFormData {
  number: string;
  contactName: string;
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  content: string;
}

interface ContactFormData {
  name: string;
  phoneNumbers: string[];
  email: string;
  notes: string;
}

export function ManualEntryForms({ selectedMethod: _selectedMethod, onBack }: ManualEntryFormsProps) {
  const [activeForm, setActiveForm] = useState<'call' | 'sms' | 'contact'>('call');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [, setShowTimePicker] = useState(false);
  
  // Call form state
  const [callData, setCallData] = useState<CallFormData>({
    number: '',
    contactName: '',
    timestamp: new Date(),
    direction: 'inbound',
    duration: '',
    callType: 'voice',
    status: 'answered',
  });

  // SMS form state
  const [smsData, setSmsData] = useState<SmsFormData>({
    number: '',
    contactName: '',
    timestamp: new Date(),
    direction: 'inbound',
    content: '',
  });

  // Contact form state
  const [contactData, setContactData] = useState<ContactFormData>({
    name: '',
    phoneNumbers: [''],
    email: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleDateTimeChange = (event: unknown, selectedDate?: Date) => {
    setShowDatePicker(false);
    setShowTimePicker(false);
    
    if (selectedDate) {
      if (activeForm === 'call') {
        setCallData(prev => ({ ...prev, timestamp: selectedDate }));
      } else if (activeForm === 'sms') {
        setSmsData(prev => ({ ...prev, timestamp: selectedDate }));
      }
    }
  };

  const validateCallForm = (): string | null => {
    if (!callData.number.trim()) return 'Phone number is required';
    if (!callData.duration.trim()) return 'Duration is required';
    if (isNaN(Number(callData.duration))) return 'Duration must be a number (seconds)';
    return null;
  };

  const validateSmsForm = (): string | null => {
    if (!smsData.number.trim()) return 'Phone number is required';
    if (!smsData.content.trim()) return 'Message content is required';
    return null;
  };

  const validateContactForm = (): string | null => {
    if (!contactData.name.trim()) return 'Contact name is required';
    if (!contactData.phoneNumbers[0]?.trim()) return 'At least one phone number is required';
    return null;
  };

  const handleSubmitCall = async () => {
    const validationError = validateCallForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Create manual event entry
      const entry = {
        id: `manual_call_${Date.now()}`,
        user_id: '', // Will be set by queue service
        line_id: `manual_${Date.now()}`,
        ts: callData.timestamp.toISOString(),
        number: callData.number,
        direction: callData.direction,
        type: 'call' as const,
        duration: parseInt(callData.duration, 10),
        status: callData.status || 'answered' as const,
        source: 'manual_entry',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add to offline queue for sync
      const offlineQueue = OfflineQueue;
      await offlineQueue.enqueueEvent(entry, 'CREATE_EVENT');

      Alert.alert(
        'Call Added',
        'Call entry has been saved and will sync when online.',
        [{ text: 'OK', onPress: resetCallForm }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to save call entry. Please try again.',
        [{ text: 'OK' }]
      );
      console.error('Error saving call entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitSms = async () => {
    const validationError = validateSmsForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      
      const smsCollector = SmsLogCollector;
      const processedEntry = smsCollector.createManualEntry({
        number: smsData.number,
        timestamp: smsData.timestamp,
        direction: smsData.direction,
        content: smsData.content,
        contactName: smsData.contactName || undefined,
      });

      // Convert ProcessedSmsEntry to Event for queue
      const entry = {
        id: processedEntry.id,
        user_id: '', // Will be set by queue service
        line_id: `manual_${Date.now()}`,
        ts: processedEntry.timestamp.toISOString(),
        number: processedEntry.number,
        direction: processedEntry.direction,
        type: processedEntry.type,
        content: processedEntry.content,
        source: 'manual_entry',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add to offline queue for sync
      const offlineQueue = OfflineQueue;
      await offlineQueue.enqueueEvent(entry, 'CREATE_EVENT');

      Alert.alert(
        'Message Added',
        'SMS entry has been saved and will sync when online.',
        [{ text: 'OK', onPress: resetSmsForm }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to save SMS entry. Please try again.',
        [{ text: 'OK' }]
      );
      console.error('Error saving SMS entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitContact = async () => {
    const validationError = validateContactForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Add to offline queue for sync (Contact needs to be converted to proper Contact interface)
      const contact = {
        id: `manual_contact_${Date.now()}`,
        user_id: '', // Will be set by queue service
        number: contactData.phoneNumbers[0] || '',
        name: contactData.name,
        company: '',
        email: contactData.email,
        tags: [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        total_calls: 0,
        total_sms: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const offlineQueue = OfflineQueue;
      await offlineQueue.enqueueContact(contact, 'CREATE_CONTACT');

      Alert.alert(
        'Contact Added',
        'Contact has been saved and will sync when online.',
        [{ text: 'OK', onPress: resetContactForm }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to save contact. Please try again.',
        [{ text: 'OK' }]
      );
      console.error('Error saving contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCallForm = () => {
    setCallData({
      number: '',
      contactName: '',
      timestamp: new Date(),
      direction: 'inbound',
      duration: '',
      callType: 'voice',
    });
  };

  const resetSmsForm = () => {
    setSmsData({
      number: '',
      contactName: '',
      timestamp: new Date(),
      direction: 'inbound',
      content: '',
    });
  };

  const resetContactForm = () => {
    setContactData({
      name: '',
      phoneNumbers: [''],
      email: '',
      notes: '',
    });
  };

  const addPhoneNumber = () => {
    setContactData(prev => ({
      ...prev,
      phoneNumbers: [...prev.phoneNumbers, ''],
    }));
  };

  const removePhoneNumber = (index: number) => {
    if (contactData.phoneNumbers.length > 1) {
      setContactData(prev => ({
        ...prev,
        phoneNumbers: prev.phoneNumbers.filter((_, i) => i !== index),
      }));
    }
  };

  const updatePhoneNumber = (index: number, value: string) => {
    setContactData(prev => ({
      ...prev,
      phoneNumbers: prev.phoneNumbers.map((num, i) => i === index ? value : num),
    }));
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#2196F3" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Manual Data Entry</Text>
          <Text style={styles.subtitle}>Enter important communication data manually</Text>
        </View>
      </View>

      {/* Form Type Selector */}
      <View style={styles.typeSelector}>
        <TouchableOpacity
          style={[styles.typeButton, activeForm === 'call' && styles.activeTypeButton]}
          onPress={() => setActiveForm('call')}
        >
          <Icon name="call" size={20} color={activeForm === 'call' ? '#fff' : '#666'} />
          <Text style={[styles.typeButtonText, activeForm === 'call' && styles.activeTypeButtonText]}>
            Call
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.typeButton, activeForm === 'sms' && styles.activeTypeButton]}
          onPress={() => setActiveForm('sms')}
        >
          <Icon name="message" size={20} color={activeForm === 'sms' ? '#fff' : '#666'} />
          <Text style={[styles.typeButtonText, activeForm === 'sms' && styles.activeTypeButtonText]}>
            SMS
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.typeButton, activeForm === 'contact' && styles.activeTypeButton]}
          onPress={() => setActiveForm('contact')}
        >
          <Icon name="person" size={20} color={activeForm === 'contact' ? '#fff' : '#666'} />
          <Text style={[styles.typeButtonText, activeForm === 'contact' && styles.activeTypeButtonText]}>
            Contact
          </Text>
        </TouchableOpacity>
      </View>

      {/* Call Form */}
      {activeForm === 'call' && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add Call Entry</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.textInput}
              value={callData.number}
              onChangeText={(text) => setCallData(prev => ({ ...prev, number: text }))}
              placeholder="+1234567890"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Name (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={callData.contactName}
              onChangeText={(text) => setCallData(prev => ({ ...prev, contactName: text }))}
              placeholder="John Doe"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date & Time</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Icon name="event" size={20} color="#666" />
              <Text style={styles.dateText}>{formatDateTime(callData.timestamp)}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Direction</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={callData.direction}
                onValueChange={(value) => setCallData(prev => ({ ...prev, direction: value }))}
              >
                <Picker.Item label="Incoming Call" value="inbound" />
                <Picker.Item label="Outgoing Call" value="outbound" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Duration (seconds) *</Text>
            <TextInput
              style={styles.textInput}
              value={callData.duration}
              onChangeText={(text) => setCallData(prev => ({ ...prev, duration: text }))}
              placeholder="120"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Call Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={callData.callType}
                onValueChange={(value) => setCallData(prev => ({ ...prev, callType: value }))}
              >
                <Picker.Item label="Voice Call" value="voice" />
                <Picker.Item label="Video Call" value="video" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Call Status</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={callData.status || 'answered'}
                onValueChange={(value) => setCallData(prev => ({ ...prev, status: value }))}
              >
                <Picker.Item label="Answered" value="answered" />
                <Picker.Item label="Missed" value="missed" />
                <Picker.Item label="Declined" value="declined" />
              </Picker>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.disabledButton]}
            onPress={handleSubmitCall}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : 'Save Call Entry'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SMS Form */}
      {activeForm === 'sms' && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add SMS Entry</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.textInput}
              value={smsData.number}
              onChangeText={(text) => setSmsData(prev => ({ ...prev, number: text }))}
              placeholder="+1234567890"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Name (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={smsData.contactName}
              onChangeText={(text) => setSmsData(prev => ({ ...prev, contactName: text }))}
              placeholder="John Doe"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date & Time</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Icon name="event" size={20} color="#666" />
              <Text style={styles.dateText}>{formatDateTime(smsData.timestamp)}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Direction</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={smsData.direction}
                onValueChange={(value) => setSmsData(prev => ({ ...prev, direction: value }))}
              >
                <Picker.Item label="Received Message" value="inbound" />
                <Picker.Item label="Sent Message" value="outbound" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Message Content *</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={smsData.content}
              onChangeText={(text) => setSmsData(prev => ({ ...prev, content: text }))}
              placeholder="Enter message content..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.disabledButton]}
            onPress={handleSubmitSms}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : 'Save SMS Entry'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Contact Form */}
      {activeForm === 'contact' && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add Contact</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Name *</Text>
            <TextInput
              style={styles.textInput}
              value={contactData.name}
              onChangeText={(text) => setContactData(prev => ({ ...prev, name: text }))}
              placeholder="John Doe"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Numbers *</Text>
            {contactData.phoneNumbers.map((number, index) => (
              <View key={index} style={styles.phoneNumberRow}>
                <TextInput
                  style={[styles.textInput, styles.phoneNumberInput]}
                  value={number}
                  onChangeText={(text) => updatePhoneNumber(index, text)}
                  placeholder="+1234567890"
                  keyboardType="phone-pad"
                />
                {contactData.phoneNumbers.length > 1 && (
                  <TouchableOpacity
                    style={styles.removePhoneButton}
                    onPress={() => removePhoneNumber(index)}
                  >
                    <Icon name="remove" size={20} color="#F44336" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addPhoneButton} onPress={addPhoneNumber}>
              <Icon name="add" size={16} color="#2196F3" />
              <Text style={styles.addPhoneText}>Add Phone Number</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={contactData.email}
              onChangeText={(text) => setContactData(prev => ({ ...prev, email: text }))}
              placeholder="john@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={contactData.notes}
              onChangeText={(text) => setContactData(prev => ({ ...prev, notes: text }))}
              placeholder="Additional notes about this contact..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.disabledButton]}
            onPress={handleSubmitContact}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : 'Save Contact'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Date/Time Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={activeForm === 'call' ? callData.timestamp : smsData.timestamp}
          mode="datetime"
          display="default"
          onChange={handleDateTimeChange}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  activeTypeButton: {
    backgroundColor: '#2196F3',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginLeft: 8,
  },
  activeTypeButtonText: {
    color: '#fff',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 10,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  phoneNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  phoneNumberInput: {
    flex: 1,
    marginRight: 8,
  },
  removePhoneButton: {
    padding: 8,
  },
  addPhoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  addPhoneText: {
    fontSize: 14,
    color: '#2196F3',
    marginLeft: 4,
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});