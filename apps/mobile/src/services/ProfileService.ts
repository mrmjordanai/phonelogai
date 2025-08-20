import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@phonelogai/database';
import { User } from '@supabase/supabase-js';

export interface ProfileData {
  displayName: string;
  avatarUrl?: string;
  bio?: string;
}

export interface ProfileValidationError {
  field: string;
  message: string;
}

class ProfileService {
  private static instance: ProfileService;
  private readonly PROFILE_CACHE_KEY = 'profileData';

  static getInstance(): ProfileService {
    if (!ProfileService.instance) {
      ProfileService.instance = new ProfileService();
    }
    return ProfileService.instance;
  }

  /**
   * Validate profile data
   */
  validateProfile(data: Partial<ProfileData>): ProfileValidationError[] {
    const errors: ProfileValidationError[] = [];

    if (data.displayName !== undefined) {
      if (!data.displayName.trim()) {
        errors.push({
          field: 'displayName',
          message: 'Display name is required',
        });
      } else if (data.displayName.length < 2) {
        errors.push({
          field: 'displayName',
          message: 'Display name must be at least 2 characters',
        });
      } else if (data.displayName.length > 50) {
        errors.push({
          field: 'displayName',
          message: 'Display name must be less than 50 characters',
        });
      }
    }

    if (data.bio !== undefined && data.bio.length > 500) {
      errors.push({
        field: 'bio',
        message: 'Bio must be less than 500 characters',
      });
    }

    return errors;
  }

  /**
   * Get current profile data from cache
   */
  async getCachedProfile(): Promise<ProfileData | null> {
    try {
      const cached = await AsyncStorage.getItem(this.PROFILE_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error getting cached profile:', error);
      return null;
    }
  }

  /**
   * Cache profile data locally
   */
  async cacheProfile(profile: ProfileData): Promise<void> {
    try {
      await AsyncStorage.setItem(this.PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.error('Error caching profile:', error);
    }
  }

  /**
   * Get profile data from Supabase
   */
  async getProfile(_userId: string): Promise<ProfileData | null> {
    try {
      // First try to get from user metadata
      const { data: user, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        throw userError;
      }

      const metadata = user.user?.user_metadata || {};
      
      const profile: ProfileData = {
        displayName: metadata.display_name || metadata.full_name || '',
        avatarUrl: metadata.avatar_url,
        bio: metadata.bio,
      };

      // Cache the profile
      await this.cacheProfile(profile);
      
      return profile;
    } catch (error) {
      console.error('Error fetching profile:', error);
      
      // Fallback to cached data
      return await this.getCachedProfile();
    }
  }

  /**
   * Update profile data
   */
  async updateProfile(updates: Partial<ProfileData>): Promise<void> {
    // Validate the updates
    const errors = this.validateProfile(updates);
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }

    try {
      // Update user metadata in Supabase Auth
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: updates.displayName,
          avatar_url: updates.avatarUrl,
          bio: updates.bio,
        },
      });

      if (error) {
        throw error;
      }

      // Get current cached profile and merge updates
      const currentProfile = await this.getCachedProfile();
      const updatedProfile = { ...currentProfile, ...updates } as ProfileData;
      
      // Cache the updated profile
      await this.cacheProfile(updatedProfile);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Upload avatar image
   */
  async uploadAvatar(imageUri: string, _userId: string): Promise<string> {
    try {
      // For now, we'll store the local URI
      // In a production app, you'd upload to Supabase Storage
      // const fileName = `avatar_${userId}_${Date.now()}.jpg`;
      
      // TODO: Implement actual file upload to Supabase Storage
      // For now, return the local URI
      return imageUri;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      throw error;
    }
  }

  /**
   * Delete user account
   */
  async deleteAccount(): Promise<void> {
    try {
      // Clear cached data first
      await AsyncStorage.removeItem(this.PROFILE_CACHE_KEY);
      
      // Note: Supabase doesn't have a direct delete user endpoint in the client
      // This would typically be handled by a server-side function
      // For now, we'll just sign out the user
      await supabase.auth.signOut();
      
      // In a real implementation, you'd call an edge function:
      // await supabase.functions.invoke('delete-user-account');
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }

  /**
   * Clear profile cache
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.PROFILE_CACHE_KEY);
    } catch (error) {
      console.error('Error clearing profile cache:', error);
    }
  }

  /**
   * Get user's initials for avatar fallback
   */
  getInitials(user: User | null, profile?: ProfileData): string {
    if (profile?.displayName) {
      return profile.displayName
        .split(' ')
        .map(name => name[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    
    return 'U';
  }
}

export const profileService = ProfileService.getInstance();