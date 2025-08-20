import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../components/AuthProvider';
import { 
  SettingInput, 
  SettingButton, 
  AvatarPicker 
} from '../../components/settings';
import { 
  profileService, 
  ProfileData, 
  ProfileValidationError 
} from '../../services/ProfileService';

import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsStack';

interface ProfileSettingsScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'ProfileSettings'>;
}

export function ProfileSettingsScreen({ navigation }: ProfileSettingsScreenProps) {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '',
    avatarUrl: '',
    bio: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profileData = await profileService.getProfile(user?.id || '');
      
      if (profileData) {
        setProfile(profileData);
      } else {
        // Initialize with user email if no profile exists
        setProfile({
          displayName: user?.email?.split('@')[0] || '',
          avatarUrl: '',
          bio: '',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert(
        'Error',
        'Failed to load profile. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const validateAndSetErrors = (updates: Partial<ProfileData>) => {
    const validationErrors = profileService.validateProfile(updates);
    const errorMap: Record<string, string> = {};
    
    validationErrors.forEach((error: ProfileValidationError) => {
      errorMap[error.field] = error.message;
    });
    
    setErrors(errorMap);
    return validationErrors.length === 0;
  };

  const handleFieldChange = (field: keyof ProfileData, value: string) => {
    const updatedProfile = { ...profile, [field]: value };
    setProfile(updatedProfile);
    setHasChanges(true);
    
    // Clear specific field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    // Validate the specific field
    validateAndSetErrors({ [field]: value });
  };

  const handleAvatarSelected = async (imageUri: string) => {
    try {
      setSaving(true);
      const avatarUrl = await profileService.uploadAvatar(imageUri, user?.id || '');
      handleFieldChange('avatarUrl', avatarUrl);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert(
        'Error',
        'Failed to upload avatar. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarRemoved = () => {
    handleFieldChange('avatarUrl', '');
  };

  const handleSave = async () => {
    if (!validateAndSetErrors(profile)) {
      return;
    }

    try {
      setSaving(true);
      await profileService.updateProfile(profile);
      setHasChanges(false);
      
      Alert.alert(
        'Success',
        'Profile updated successfully!',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to save profile',
        [{ text: 'OK' }]
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Final Confirmation',
      'Type "DELETE" to confirm account deletion',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I understand',
          style: 'destructive',
          onPress: executeDeleteAccount,
        },
      ]
    );
  };

  const executeDeleteAccount = async () => {
    try {
      setSaving(true);
      await profileService.deleteAccount();
      
      Alert.alert(
        'Account Deleted',
        'Your account has been scheduled for deletion.',
        [{ text: 'OK', onPress: () => signOut() }]
      );
    } catch (error) {
      console.error('Error deleting account:', error);
      Alert.alert(
        'Error',
        'Failed to delete account. Please try again or contact support.',
        [{ text: 'OK' }]
      );
    } finally {
      setSaving(false);
    }
  };

  const handleGoBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. What would you like to do?',
        [
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Save', onPress: handleSave },
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
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.title}>Profile Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Picture</Text>
          <View style={styles.avatarSection}>
            <AvatarPicker
              currentImageUri={profile.avatarUrl}
              displayName={profile.displayName}
              email={user?.email}
              onImageSelected={handleAvatarSelected}
              onImageRemoved={handleAvatarRemoved}
              size={100}
              editable={!saving}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <SettingInput
            label="Display Name"
            value={profile.displayName}
            onChangeText={(text) => handleFieldChange('displayName', text)}
            placeholder="Enter your display name"
            error={errors.displayName}
            icon="person"
            maxLength={50}
            autoCapitalize="words"
          />

          <SettingInput
            label="Email"
            value={user?.email || ''}
            onChangeText={() => {}}
            editable={false}
            icon="mail"
            keyboardType="email-address"
          />

          <SettingInput
            label="Bio (Optional)"
            value={profile.bio || ''}
            onChangeText={(text) => handleFieldChange('bio', text)}
            placeholder="Tell us about yourself..."
            error={errors.bio}
            icon="document-text"
            multiline
            numberOfLines={4}
            maxLength={500}
          />
        </View>

        <View style={styles.section}>
          <SettingButton
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
            disabled={!hasChanges || Object.keys(errors).some(key => !!errors[key])}
            variant="primary"
            icon="checkmark"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <SettingButton
            title="Delete Account"
            onPress={handleDeleteAccount}
            variant="destructive"
            icon="trash"
            disabled={saving}
          />
          <Text style={styles.dangerText}>
            This will permanently delete your account and all associated data. This action cannot be undone.
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dangerText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 20,
  },
});