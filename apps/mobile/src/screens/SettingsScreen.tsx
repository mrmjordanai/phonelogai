import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuth } from '../components/AuthProvider';
import { Ionicons } from '@expo/vector-icons';

import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../navigation/SettingsStack';

interface SettingsScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'SettingsMain'>;
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const SettingItem = ({ title, icon, onPress, destructive = false }: {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    destructive?: boolean;
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingItemLeft}>
        <Ionicons 
          name={icon} 
          size={24} 
          color={destructive ? '#EF4444' : '#6B7280'} 
        />
        <Text style={[
          styles.settingItemText,
          destructive && styles.destructiveText
        ]}>
          {title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        <View style={styles.section}>
          <SettingItem
            title="Profile"
            icon="person"
            onPress={() => navigation.navigate('ProfileSettings')}
          />
          <SettingItem
            title="Privacy"
            icon="shield-checkmark"
            onPress={() => navigation.navigate('PrivacySettings')}
          />
          <SettingItem
            title="Notifications"
            icon="notifications"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <SettingItem
            title="Data & Storage"
            icon="server"
            onPress={() => navigation.navigate('DataStorageSettings')}
          />
        </View>

        <View style={styles.section}>
          <SettingItem
            title="Help & Support"
            icon="help-circle"
            onPress={() => navigation.navigate('HelpSupport')}
          />
          <SettingItem
            title="About"
            icon="information-circle"
            onPress={() => navigation.navigate('About')}
          />
        </View>

        <View style={styles.section}>
          <SettingItem
            title="Sign Out"
            icon="log-out"
            onPress={handleSignOut}
            destructive
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  userInfo: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  userEmail: {
    fontSize: 16,
    color: '#6B7280',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingItemText: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 12,
  },
  destructiveText: {
    color: '#EF4444',
  },
});