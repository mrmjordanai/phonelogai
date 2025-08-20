import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface AvatarPickerProps {
  currentImageUri?: string;
  displayName?: string;
  email?: string;
  onImageSelected: (_imageUri: string) => void;
  onImageRemoved?: () => void;
  size?: number;
  editable?: boolean;
}

export function AvatarPicker({
  currentImageUri,
  displayName,
  email,
  onImageSelected,
  onImageRemoved,
  size = 80,
  editable = true,
}: AvatarPickerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const getInitials = () => {
    if (displayName) {
      return displayName
        .split(' ')
        .map(name => name[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera roll permissions to change your avatar.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const pickImage = async (useCamera: boolean = false) => {
    setIsLoading(true);
    
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setIsLoading(false);
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (!result.canceled && result.assets[0]) {
        onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(
        'Error',
        'Failed to pick image. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showImageOptions = () => {
    const options = [
      { text: 'Take Photo', onPress: async () => await pickImage(true) },
      { text: 'Choose from Library', onPress: async () => await pickImage(false) },
    ];

    if (currentImageUri && onImageRemoved) {
      options.push({ text: 'Remove Photo', onPress: async () => onImageRemoved() });
    }

    options.push({ text: 'Cancel', onPress: async () => {} });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: options.map(o => o.text),
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: currentImageUri && onImageRemoved ? 2 : undefined,
        },
        async (buttonIndex) => {
          if (buttonIndex < options.length - 1) {
            await options[buttonIndex].onPress();
          }
        }
      );
    } else {
      Alert.alert(
        'Change Avatar',
        'Choose an option',
        options.map(option => ({
          text: option.text,
          onPress: option.onPress,
          style: option.text === 'Remove Photo' ? 'destructive' : 'default',
        }))
      );
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.avatarContainer,
          { width: size, height: size, borderRadius: size / 2 },
          !editable && styles.disabledContainer,
        ]}
        onPress={editable ? showImageOptions : undefined}
        disabled={!editable || isLoading}
      >
        {currentImageUri ? (
          <Image
            source={{ uri: currentImageUri }}
            style={[
              styles.avatarImage,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          />
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          >
            <Text style={[styles.avatarText, { fontSize: size * 0.3 }]}>
              {getInitials()}
            </Text>
          </View>
        )}

        {editable && (
          <View style={[styles.editOverlay, { borderRadius: size / 2 }]}>
            {isLoading ? (
              <Ionicons name="reload" size={size * 0.25} color="white" />
            ) : (
              <Ionicons name="camera" size={size * 0.25} color="white" />
            )}
          </View>
        )}
      </TouchableOpacity>

      {editable && (
        <TouchableOpacity
          style={styles.changeButton}
          onPress={showImageOptions}
          disabled={isLoading}
        >
          <Text style={styles.changeButtonText}>
            {currentImageUri ? 'Change Photo' : 'Add Photo'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  disabledContainer: {
    opacity: 0.6,
  },
  avatarImage: {
    backgroundColor: '#F3F4F6',
  },
  avatarPlaceholder: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
    color: 'white',
  },
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
  },
  changeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
  },
  changeButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});