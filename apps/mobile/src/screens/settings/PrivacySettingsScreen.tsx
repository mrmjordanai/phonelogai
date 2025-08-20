import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../components/AuthProvider';
import { useOfflinePermission } from '../../rbac/hooks/useMobileRBAC';
import {
  SettingToggle,
  SettingPicker,
  SettingButton,
  PrivacyRuleList,
  PickerOption,
  PrivacyRule,
} from '../../components/settings';
import { supabase } from '@phonelogai/database';
import type { VisibilityType } from '@phonelogai/database';

import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsStack';

interface PrivacySettingsScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'PrivacySettings'>;
}

interface PrivacySettings {
  defaultVisibility: VisibilityType;
  anonymizePhoneNumbers: boolean;
  anonymizeContent: boolean;
  allowDataExport: boolean;
  allowAnalytics: boolean;
  allowMLTraining: boolean;
  dataRetentionDays: number;
  autoAnonymization: boolean;
  gdprCompliance: boolean;
}

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  defaultVisibility: 'team',
  anonymizePhoneNumbers: false,
  anonymizeContent: false,
  allowDataExport: true,
  allowAnalytics: true,
  allowMLTraining: false,
  dataRetentionDays: 365,
  autoAnonymization: false,
  gdprCompliance: true,
};

const VISIBILITY_OPTIONS: PickerOption[] = [
  {
    label: 'Private',
    value: 'private',
    description: 'Only you and admins can see this data',
    icon: 'lock-closed',
  },
  {
    label: 'Team',
    value: 'team',
    description: 'Your team members can see this data (default)',
    icon: 'people',
  },
  {
    label: 'Public',
    value: 'public',
    description: 'Anyone in your organization can see this data',
    icon: 'globe',
  },
];

const RETENTION_OPTIONS: PickerOption[] = [
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '365' },
  { label: '2 years', value: '730' },
  { label: 'Unlimited', value: '-1' },
];

export function PrivacySettingsScreen({ navigation }: PrivacySettingsScreenProps) {
  const { user } = useAuth();
  const { allowed: hasWritePermission } = useOfflinePermission('privacy_rules', 'write');
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [privacyRules, setPrivacyRules] = useState<PrivacyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadPrivacySettings();
    loadPrivacyRules();
  }, []);

  const loadPrivacySettings = async () => {
    try {
      setLoading(true);
      
      // Load user's privacy preferences from the database
      const { data: userSettings, error } = await supabase
        .from('user_preferences')
        .select('privacy_settings')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      if (userSettings?.privacy_settings) {
        setSettings({ ...DEFAULT_PRIVACY_SETTINGS, ...userSettings.privacy_settings });
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error);
      Alert.alert('Error', 'Failed to load privacy settings');
    } finally {
      setLoading(false);
    }
  };

  const loadPrivacyRules = async () => {
    if (!user?.id) return;

    try {
      // For now, load empty rules - this will be integrated with the privacy system later
      setPrivacyRules([]);
    } catch (error) {
      console.error('Error loading privacy rules:', error);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadPrivacySettings(),
      loadPrivacyRules(),
    ]);
    setRefreshing(false);
  }, [user?.id]);

  const handleSettingChange = <K extends keyof PrivacySettings>(
    key: K,
    value: PrivacySettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    if (!user?.id || !hasChanges) return;

    try {
      setSaving(true);

      // Save privacy settings to database
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          privacy_settings: settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        throw error;
      }

      // Note: Privacy rule updates will be integrated with the privacy system later

      setHasChanges(false);
      Alert.alert('Success', 'Privacy settings saved successfully');
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      Alert.alert('Error', 'Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };


  const handleRuleEdit = (_rule: PrivacyRule) => {
    // In a full implementation, this would navigate to a rule editor
    Alert.alert(
      'Edit Privacy Rule',
      'Privacy rule editing will be available in a future update.',
      [{ text: 'OK' }]
    );
  };

  const handleRuleDelete = async (_ruleId: string) => {
    // Privacy rule deletion will be integrated with the privacy system later
    Alert.alert('Coming Soon', 'Privacy rule deletion will be available in a future update.');
  };

  const handleRuleToggle = async (_ruleId: string, _isActive: boolean) => {
    // Privacy rule toggling will be integrated with the privacy system later
    Alert.alert('Coming Soon', 'Privacy rule toggling will be available in a future update.');
  };

  const handleDataRequest = (requestType: string) => {
    Alert.alert(
      'Data Subject Request',
      `Submit a ${requestType} request? This will be processed according to GDPR/CCPA regulations when the compliance system is integrated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Coming Soon',
          onPress: () => Alert.alert('Coming Soon', 'Data subject requests will be available in a future update.'),
        },
      ]
    );
  };

  const handleGoBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved privacy settings. What would you like to do?',
        [
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Save', onPress: handleSaveSettings },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading privacy settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canManagePrivacy = hasWritePermission;
  const canRequestData = hasWritePermission;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Default Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Privacy Settings</Text>
          <Text style={styles.sectionDescription}>
            These settings apply to new contacts and data unless overridden by specific privacy rules.
          </Text>
          
          <SettingPicker
            label="Default Visibility"
            description="Who can see your data by default"
            value={settings.defaultVisibility}
            options={VISIBILITY_OPTIONS}
            onValueChange={(value) => handleSettingChange('defaultVisibility', value as VisibilityType)}
            icon="eye"
            disabled={!canManagePrivacy}
          />

          <SettingToggle
            label="Hide Phone Numbers"
            description="Anonymize phone numbers in team views"
            value={settings.anonymizePhoneNumbers}
            onValueChange={(value) => handleSettingChange('anonymizePhoneNumbers', value)}
            icon="call"
            disabled={!canManagePrivacy}
          />

          <SettingToggle
            label="Hide Message Content"
            description="Anonymize message and call content in team views"
            value={settings.anonymizeContent}
            onValueChange={(value) => handleSettingChange('anonymizeContent', value)}
            icon="chatbubble"
            disabled={!canManagePrivacy}
          />
        </View>

        {/* Data Usage Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Usage Permissions</Text>
          
          <SettingToggle
            label="Allow Data Export"
            description="Allow your data to be exported by team members"
            value={settings.allowDataExport}
            onValueChange={(value) => handleSettingChange('allowDataExport', value)}
            icon="download"
            disabled={!canManagePrivacy}
          />

          <SettingToggle
            label="Allow Analytics"
            description="Allow your data to be used for analytics and reporting"
            value={settings.allowAnalytics}
            onValueChange={(value) => handleSettingChange('allowAnalytics', value)}
            icon="analytics"
            disabled={!canManagePrivacy}
          />

          <SettingToggle
            label="Allow ML Training"
            description="Allow your data to be used for machine learning improvements"
            value={settings.allowMLTraining}
            onValueChange={(value) => handleSettingChange('allowMLTraining', value)}
            icon="bulb"
            disabled={!canManagePrivacy}
          />
        </View>

        {/* Data Retention */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Retention</Text>
          
          <SettingPicker
            label="Data Retention Period"
            description="How long to keep your data before automatic deletion"
            value={settings.dataRetentionDays.toString()}
            options={RETENTION_OPTIONS}
            onValueChange={(value) => handleSettingChange('dataRetentionDays', parseInt(value))}
            icon="time"
            disabled={!canManagePrivacy}
          />

          <SettingToggle
            label="Auto-Anonymization"
            description="Automatically anonymize data after retention period"
            value={settings.autoAnonymization}
            onValueChange={(value) => handleSettingChange('autoAnonymization', value)}
            icon="shield-checkmark"
            disabled={!canManagePrivacy}
          />
        </View>

        {/* Privacy Rules */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Privacy Rules</Text>
            <Text style={styles.ruleCount}>
              {privacyRules.length} {privacyRules.length === 1 ? 'rule' : 'rules'}
            </Text>
          </View>
          <Text style={styles.sectionDescription}>
            Specific privacy rules that override your default settings for certain contacts or patterns.
          </Text>
          
          <PrivacyRuleList
            rules={privacyRules}
            onRuleEdit={handleRuleEdit}
            onRuleDelete={handleRuleDelete}
            onRuleToggle={handleRuleToggle}
            loading={saving}
          />
        </View>

        {/* GDPR/CCPA Compliance */}
        {canRequestData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Rights (GDPR/CCPA)</Text>
            <Text style={styles.sectionDescription}>
              Exercise your rights under data protection regulations.
            </Text>
            
            <SettingButton
              title="Request My Data"
              onPress={() => handleDataRequest('access')}
              icon="document-text"
              variant="secondary"
              disabled={saving}
            />

            <SettingButton
              title="Export My Data"
              onPress={() => handleDataRequest('portability')}
              icon="download"
              variant="secondary"
              disabled={saving}
            />

            <SettingButton
              title="Delete My Data"
              onPress={() => handleDataRequest('erasure')}
              icon="trash"
              variant="destructive"
              disabled={saving}
            />
          </View>
        )}

        {/* Save Changes */}
        {hasChanges && (
          <View style={styles.section}>
            <SettingButton
              title="Save Privacy Settings"
              onPress={handleSaveSettings}
              loading={saving}
              variant="primary"
              icon="checkmark"
            />
          </View>
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  section: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  ruleCount: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
});