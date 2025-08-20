import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MailComposer from 'expo-mail-composer';
import * as WebBrowser from 'expo-web-browser';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsStack';
import { useAuth } from '../../components/AuthProvider';
import { APP_NAME, APP_VERSION } from '@phonelogai/shared';

interface HelpSupportScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'HelpSupport'>;
}

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    id: '1',
    category: 'Account',
    question: 'How do I reset my password?',
    answer: 'You can reset your password by going to the sign-in screen and tapping "Forgot Password". We\'ll send you a reset link via email.'
  },
  {
    id: '2',
    category: 'Account',
    question: 'How do I change my email address?',
    answer: 'Currently, email addresses cannot be changed directly. Please contact our support team for assistance with email changes.'
  },
  {
    id: '3',
    category: 'Data Collection',
    question: 'Why can\'t I access call logs on iOS?',
    answer: 'iOS restricts access to call and SMS logs for privacy reasons. You can manually import carrier files (CDR, CSV, PDF) using the file import feature.'
  },
  {
    id: '4',
    category: 'Data Collection',
    question: 'What file formats are supported?',
    answer: 'We support CSV, PDF, and Excel files from major carriers. Files should contain call/SMS records with timestamps, phone numbers, and duration information.'
  },
  {
    id: '5',
    category: 'Privacy',
    question: 'How is my data protected?',
    answer: 'All data is encrypted in transit and at rest. We use industry-standard security measures and comply with privacy regulations. You control data sharing settings.'
  },
  {
    id: '6',
    category: 'Privacy',
    question: 'Can I delete my data?',
    answer: 'Yes, you can delete specific contacts, events, or your entire account from the Privacy Settings. Deleted data is permanently removed from our systems.'
  },
  {
    id: '7',
    category: 'Sync Issues',
    question: 'My data isn\'t syncing. What should I do?',
    answer: 'Check your internet connection and try pulling down to refresh. If issues persist, go to Data & Storage settings to check sync status or contact support.'
  },
  {
    id: '8',
    category: 'Sync Issues',
    question: 'I see duplicate entries. How do I fix this?',
    answer: 'The app automatically detects and resolves duplicates. If you notice persistent duplicates, try refreshing your data or contact support for manual resolution.'
  },
  {
    id: '9',
    category: 'General',
    question: 'How do I export my data?',
    answer: 'You can export your data from the Events screen using the export button. Choose from CSV, JSON, or PDF formats based on your needs.'
  },
  {
    id: '10',
    category: 'General',
    question: 'Can I use this app offline?',
    answer: 'Yes, the app works offline. Your actions are queued and synchronized when you reconnect to the internet.'
  }
];

const SUPPORT_EMAIL = 'support@phonelogai.com';
const USER_GUIDE_URL = 'https://docs.phonelogai.com/user-guide';
const TROUBLESHOOTING_URL = 'https://docs.phonelogai.com/troubleshooting';

export function HelpSupportScreen({ navigation }: HelpSupportScreenProps) {
  const { user } = useAuth();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(FAQ_DATA.map(item => item.category)))];
  const filteredFAQ = selectedCategory === 'All' 
    ? FAQ_DATA 
    : FAQ_DATA.filter(item => item.category === selectedCategory);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const getSystemInfo = async () => {
    try {
      return {
        appName: APP_NAME,
        appVersion: APP_VERSION,
        buildVersion: Constants.expoConfig?.version || 'Unknown',
        deviceName: Device.deviceName || 'Unknown',
        deviceModel: Device.modelName || 'Unknown',
        osVersion: Device.osVersion || 'Unknown',
        platform: Device.osName || 'Unknown',
        installationId: Constants.installationId,
        sessionId: Constants.sessionId,
      };
    } catch {
      return {
        appName: APP_NAME,
        appVersion: APP_VERSION,
        buildVersion: 'Unknown',
        deviceName: 'Unknown',
        deviceModel: 'Unknown',
        osVersion: 'Unknown',
        platform: 'Unknown',
        installationId: 'Unknown',
        sessionId: 'Unknown',
      };
    }
  };

  const handleContactSupport = async () => {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'Email Not Available',
          `Please send an email to ${SUPPORT_EMAIL} from your email app.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const systemInfo = await getSystemInfo();
      
      const emailBody = `
Hi PhoneLog AI Support Team,

Please describe your issue or question below:

[Your message here]

---
System Information (please don't remove):
App Version: ${systemInfo.appVersion}
Build Version: ${systemInfo.buildVersion}
Device: ${systemInfo.deviceName} (${systemInfo.deviceModel})
OS: ${systemInfo.platform} ${systemInfo.osVersion}
Installation ID: ${systemInfo.installationId}
User ID: ${user?.id || 'Not available'}
Email: ${user?.email || 'Not available'}
      `.trim();

      await MailComposer.composeAsync({
        recipients: [SUPPORT_EMAIL],
        subject: `${APP_NAME} Support Request`,
        body: emailBody,
      });
    } catch (error) {
      console.error('Error opening email composer:', error);
      Alert.alert(
        'Error',
        `Failed to open email. Please contact us at ${SUPPORT_EMAIL}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleBugReport = async () => {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'Email Not Available',
          `Please send a bug report to ${SUPPORT_EMAIL} from your email app.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const systemInfo = await getSystemInfo();
      
      const bugReportBody = `
Bug Report for ${APP_NAME}

Steps to reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected behavior:
[What you expected to happen]

Actual behavior:
[What actually happened]

Additional context:
[Any additional information, screenshots, or context]

---
System Information (please don't remove):
App Version: ${systemInfo.appVersion}
Build Version: ${systemInfo.buildVersion}
Device: ${systemInfo.deviceName} (${systemInfo.deviceModel})
OS: ${systemInfo.platform} ${systemInfo.osVersion}
Installation ID: ${systemInfo.installationId}
Session ID: ${systemInfo.sessionId}
User ID: ${user?.id || 'Not available'}
Email: ${user?.email || 'Not available'}
      `.trim();

      await MailComposer.composeAsync({
        recipients: [SUPPORT_EMAIL],
        subject: `${APP_NAME} Bug Report`,
        body: bugReportBody,
      });
    } catch (error) {
      console.error('Error opening email composer for bug report:', error);
      Alert.alert(
        'Error',
        `Failed to open email. Please contact us at ${SUPPORT_EMAIL}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenUserGuide = async () => {
    try {
      await WebBrowser.openBrowserAsync(USER_GUIDE_URL);
    } catch (error) {
      console.error('Error opening user guide:', error);
      Alert.alert(
        'Error',
        'Failed to open user guide. Please check your internet connection.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenTroubleshooting = async () => {
    try {
      await WebBrowser.openBrowserAsync(TROUBLESHOOTING_URL);
    } catch (error) {
      console.error('Error opening troubleshooting guide:', error);
      Alert.alert(
        'Error',
        'Failed to open troubleshooting guide. Please check your internet connection.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleExportLogs = async () => {
    // This would typically export app logs for debugging
    // For now, we'll show system info
    try {
      const systemInfo = await getSystemInfo();
      const logData = JSON.stringify(systemInfo, null, 2);
      
      Alert.alert(
        'System Information',
        `App Version: ${systemInfo.appVersion}\nDevice: ${systemInfo.deviceModel}\nOS: ${systemInfo.platform} ${systemInfo.osVersion}`,
        [
          { text: 'Copy Info', onPress: () => {
            // In a real implementation, you'd copy to clipboard
            console.log('System info:', logData);
          }},
          { text: 'OK' }
        ]
      );
    } catch {
      Alert.alert('Error', 'Failed to generate system information.');
    }
  };

  const SectionHeader = ({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={20} color="#3B82F6" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const ActionButton = ({ 
    title, 
    subtitle, 
    icon, 
    onPress 
  }: { 
    title: string; 
    subtitle: string; 
    icon: keyof typeof Ionicons.glyphMap; 
    onPress: () => void 
  }) => (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionButtonLeft}>
        <Ionicons name={icon} size={24} color="#3B82F6" />
        <View style={styles.actionButtonText}>
          <Text style={styles.actionButtonTitle}>{title}</Text>
          <Text style={styles.actionButtonSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  const FAQCategoryFilter = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryFilter}>
      {categories.map((category) => (
        <TouchableOpacity
          key={category}
          style={[
            styles.categoryButton,
            selectedCategory === category && styles.categoryButtonActive
          ]}
          onPress={() => setSelectedCategory(category)}
        >
          <Text style={[
            styles.categoryButtonText,
            selectedCategory === category && styles.categoryButtonTextActive
          ]}>
            {category}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const FAQItem = ({ item }: { item: FAQItem }) => {
    const isExpanded = expandedItems.has(item.id);
    
    return (
      <View style={styles.faqItem}>
        <TouchableOpacity
          style={styles.faqHeader}
          onPress={() => toggleExpanded(item.id)}
        >
          <View style={styles.faqHeaderLeft}>
            <Text style={styles.faqCategory}>{item.category}</Text>
            <Text style={styles.faqQuestion}>{item.question}</Text>
          </View>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#6B7280" 
          />
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.faqAnswer}>
            <Text style={styles.faqAnswerText}>{item.answer}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Contact Support Section */}
        <View style={styles.section}>
          <SectionHeader title="Get Help" icon="help-circle" />
          
          <ActionButton
            title="Contact Support"
            subtitle="Send us an email with your question"
            icon="mail"
            onPress={handleContactSupport}
          />
          
          <ActionButton
            title="Report a Bug"
            subtitle="Help us improve by reporting issues"
            icon="bug"
            onPress={handleBugReport}
          />
        </View>

        {/* Resources Section */}
        <View style={styles.section}>
          <SectionHeader title="Resources" icon="library" />
          
          <ActionButton
            title="User Guide"
            subtitle="Learn how to use all features"
            icon="book"
            onPress={handleOpenUserGuide}
          />
          
          <ActionButton
            title="Troubleshooting"
            subtitle="Solve common issues yourself"
            icon="construct"
            onPress={handleOpenTroubleshooting}
          />
          
          <ActionButton
            title="System Diagnostics"
            subtitle="View system information for support"
            icon="analytics"
            onPress={handleExportLogs}
          />
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <SectionHeader title="Frequently Asked Questions" icon="chatbubbles" />
          
          <FAQCategoryFilter />
          
          <View style={styles.faqContainer}>
            {filteredFAQ.map((item) => (
              <FAQItem key={item.id} item={item} />
            ))}
          </View>
          
          {filteredFAQ.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search" size={48} color="#9CA3AF" />
              <Text style={styles.emptyStateText}>No FAQs found for this category</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  section: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionButtonText: {
    marginLeft: 12,
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  actionButtonSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryFilter: {
    marginBottom: 16,
  },
  categoryButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#3B82F6',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  faqContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  faqHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  faqCategory: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  faqQuestion: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
    lineHeight: 20,
  },
  faqAnswer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  faqAnswerText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 12,
  },
});