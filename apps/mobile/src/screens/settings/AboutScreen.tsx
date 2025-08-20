import React, { useState, useEffect } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import * as Device from 'expo-device';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsStack';
import { APP_NAME, APP_VERSION } from '@phonelogai/shared';

interface AboutScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'About'>;
}

interface SystemInfo {
  appName: string;
  appVersion: string;
  buildVersion: string;
  buildNumber: string;
  releaseChannel: string;
  deviceName: string;
  deviceModel: string;
  osVersion: string;
  platform: string;
  installationId: string;
  sessionId: string;
}

interface LicenseInfo {
  name: string;
  version: string;
  license: string;
  description: string;
}

const TERMS_URL = 'https://phonelogai.com/terms';
const PRIVACY_URL = 'https://phonelogai.com/privacy';
const WEBSITE_URL = 'https://phonelogai.com';
const GITHUB_URL = 'https://github.com/phonelogai/phonelogai';

const OPEN_SOURCE_LICENSES: LicenseInfo[] = [
  {
    name: 'React Native',
    version: '0.72.10',
    license: 'MIT',
    description: 'A framework for building native apps using React'
  },
  {
    name: 'Expo',
    version: '~49.0.0',
    license: 'MIT',
    description: 'An open-source platform for universal React applications'
  },
  {
    name: 'React Navigation',
    version: '6.x',
    license: 'MIT',
    description: 'Routing and navigation for React Native apps'
  },
  {
    name: 'Supabase JS',
    version: '2.x',
    license: 'MIT',
    description: 'JavaScript client for Supabase'
  },
  {
    name: 'Ionicons',
    version: '13.x',
    license: 'MIT',
    description: 'Premium designed icons for use in web, iOS, Android apps'
  },
  {
    name: 'React Query',
    version: '5.x',
    license: 'MIT',
    description: 'Powerful data synchronization for React'
  }
];

const DEVELOPMENT_TEAM = [
  {
    name: 'PhoneLog AI Team',
    role: 'Core Development',
    description: 'Mobile app architecture and development'
  },
  {
    name: 'Community Contributors',
    role: 'Open Source',
    description: 'Bug reports, feature requests, and contributions'
  }
];

export function AboutScreen({ navigation }: AboutScreenProps) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    loadSystemInfo();
  }, []);

  const loadSystemInfo = async () => {
    try {
      const info: SystemInfo = {
        appName: APP_NAME,
        appVersion: APP_VERSION,
        buildVersion: Constants.expoConfig?.version || 'Unknown',
        buildNumber: Constants.expoConfig?.android?.versionCode?.toString() || 
                     Constants.expoConfig?.ios?.buildNumber || 'Unknown',
        releaseChannel: Constants.expoConfig && typeof Constants.expoConfig === 'object' && 'releaseChannel' in Constants.expoConfig
          ? (Constants.expoConfig.releaseChannel as string) || 'development'
          : 'development',
        deviceName: Device.deviceName || 'Unknown',
        deviceModel: Device.modelName || 'Unknown',
        osVersion: Device.osVersion || 'Unknown',
        platform: Device.osName || 'Unknown',
        installationId: Constants.installationId,
        sessionId: Constants.sessionId,
      };
      setSystemInfo(info);
    } catch (error) {
      console.error('Error loading system info:', error);
    }
  };

  const handleVersionTap = () => {
    setTapCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 7) {
        setDebugMode(true);
        setTapCount(0);
        Alert.alert(
          'Debug Mode Enabled',
          'Additional debug information is now available.',
          [{ text: 'OK' }]
        );
        return 0; // Reset count after enabling debug mode
      }
      return newCount;
    });
  };

  const handleOpenUrl = async (url: string, name: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error(`Error opening ${name}:`, error);
      Alert.alert(
        'Error',
        `Failed to open ${name}. Please check your internet connection.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleShareDebugInfo = async () => {
    if (!systemInfo) return;

    try {
      const debugInfo = `${APP_NAME} Debug Information

App Version: ${systemInfo.appVersion}
Build Version: ${systemInfo.buildVersion}
Build Number: ${systemInfo.buildNumber}
Release Channel: ${systemInfo.releaseChannel}

Device Information:
Name: ${systemInfo.deviceName}
Model: ${systemInfo.deviceModel}
OS: ${systemInfo.platform} ${systemInfo.osVersion}

Technical Details:
Installation ID: ${systemInfo.installationId}
Session ID: ${systemInfo.sessionId}

Generated: ${new Date().toISOString()}
`;

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync('data:text/plain;base64,' + btoa(debugInfo), {
          mimeType: 'text/plain',
          dialogTitle: 'Share Debug Information'
        });
      } else {
        Alert.alert(
          'Debug Information',
          debugInfo,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error sharing debug info:', error);
      Alert.alert('Error', 'Failed to share debug information.');
    }
  };

  const InfoRow = ({ 
    label, 
    value, 
    onPress 
  }: { 
    label: string; 
    value: string; 
    onPress?: () => void 
  }) => (
    <TouchableOpacity 
      style={styles.infoRow} 
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, onPress && styles.infoValueTappable]}>{value}</Text>
    </TouchableOpacity>
  );

  const ActionButton = ({ 
    title, 
    icon, 
    onPress,
    destructive = false
  }: { 
    title: string; 
    icon: keyof typeof Ionicons.glyphMap; 
    onPress: () => void;
    destructive?: boolean;
  }) => (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionButtonLeft}>
        <Ionicons 
          name={icon} 
          size={24} 
          color={destructive ? '#EF4444' : '#3B82F6'} 
        />
        <Text style={[
          styles.actionButtonText,
          destructive && styles.actionButtonTextDestructive
        ]}>
          {title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  const SectionHeader = ({ 
    title, 
    icon 
  }: { 
    title: string; 
    icon: keyof typeof Ionicons.glyphMap 
  }) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={20} color="#3B82F6" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.title}>About</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* App Info Section */}
        <View style={styles.section}>
          <View style={styles.appIconContainer}>
            <View style={styles.appIcon}>
              <Ionicons name="phone-portrait" size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>{APP_NAME}</Text>
            <TouchableOpacity onPress={handleVersionTap}>
              <Text style={styles.appVersion}>Version {systemInfo?.appVersion || 'Loading...'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Version Information */}
        {systemInfo && (
          <View style={styles.section}>
            <SectionHeader title="Version Information" icon="information-circle" />
            <View style={styles.infoContainer}>
              <InfoRow label="App Version" value={systemInfo.appVersion} onPress={handleVersionTap} />
              <InfoRow label="Build Version" value={systemInfo.buildVersion} />
              <InfoRow label="Build Number" value={systemInfo.buildNumber} />
              <InfoRow label="Release Channel" value={systemInfo.releaseChannel} />
              {debugMode && (
                <InfoRow label="Installation ID" value={systemInfo.installationId} />
              )}
            </View>
          </View>
        )}

        {/* Device Information */}
        {systemInfo && debugMode && (
          <View style={styles.section}>
            <SectionHeader title="Device Information" icon="hardware-chip" />
            <View style={styles.infoContainer}>
              <InfoRow label="Device" value={systemInfo.deviceName} />
              <InfoRow label="Model" value={systemInfo.deviceModel} />
              <InfoRow label="OS Version" value={`${systemInfo.platform} ${systemInfo.osVersion}`} />
              <InfoRow label="Session ID" value={systemInfo.sessionId} />
            </View>
          </View>
        )}

        {/* Legal Section */}
        <View style={styles.section}>
          <SectionHeader title="Legal" icon="document-text" />
          
          <ActionButton
            title="Terms of Service"
            icon="document"
            onPress={() => handleOpenUrl(TERMS_URL, 'Terms of Service')}
          />
          
          <ActionButton
            title="Privacy Policy"
            icon="shield-checkmark"
            onPress={() => handleOpenUrl(PRIVACY_URL, 'Privacy Policy')}
          />
          
          <ActionButton
            title="Open Source Licenses"
            icon="code-slash"
            onPress={() => {
              // Show licenses modal or navigate to licenses screen
              Alert.alert(
                'Open Source Licenses',
                `This app uses ${OPEN_SOURCE_LICENSES.length} open source libraries. Visit our GitHub repository for complete license information.`,
                [
                  { text: 'View on GitHub', onPress: () => handleOpenUrl(GITHUB_URL, 'GitHub Repository') },
                  { text: 'OK' }
                ]
              );
            }}
          />
        </View>

        {/* Credits Section */}
        <View style={styles.section}>
          <SectionHeader title="Credits" icon="people" />
          
          <View style={styles.creditsContainer}>
            {DEVELOPMENT_TEAM.map((member, index) => (
              <View key={index} style={styles.creditItem}>
                <Text style={styles.creditName}>{member.name}</Text>
                <Text style={styles.creditRole}>{member.role}</Text>
                <Text style={styles.creditDescription}>{member.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Links Section */}
        <View style={styles.section}>
          <SectionHeader title="More Information" icon="link" />
          
          <ActionButton
            title="Visit Our Website"
            icon="globe"
            onPress={() => handleOpenUrl(WEBSITE_URL, 'Website')}
          />
          
          <ActionButton
            title="View Source Code"
            icon="logo-github"
            onPress={() => handleOpenUrl(GITHUB_URL, 'GitHub Repository')}
          />
          
          {debugMode && (
            <ActionButton
              title="Share Debug Information"
              icon="share"
              onPress={handleShareDebugInfo}
            />
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ by the PhoneLog AI team
          </Text>
          <Text style={styles.footerCopyright}>
            © 2024 PhoneLog AI. All rights reserved.
          </Text>
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
  appIconContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  appVersion: {
    fontSize: 16,
    color: '#6B7280',
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
  infoContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  infoValueTappable: {
    color: '#3B82F6',
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
    fontSize: 16,
    color: '#111827',
    marginLeft: 12,
    fontWeight: '500',
  },
  actionButtonTextDestructive: {
    color: '#EF4444',
  },
  creditsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  creditItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  creditName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  creditRole: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
    marginBottom: 4,
  },
  creditDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 24,
  },
  footerText: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  footerCopyright: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});