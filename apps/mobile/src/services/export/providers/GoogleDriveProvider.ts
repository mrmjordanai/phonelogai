/**
 * Google Drive Provider
 * Handles Google Drive integration for cloud exports
 */

// import * as AuthSession from 'expo-auth-session'; // TODO: Install expo-auth-session if needed
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CloudProvider,
  AuthResult,
  FileData,
  UploadOptions,
  UploadResult,
  FileList,
  QuotaInfo,
  // UploadProgress - TODO: Implement upload progress tracking
} from '../../../types/export/CloudTypes';

WebBrowser.maybeCompleteAuthSession();

interface GoogleDriveFile {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
}

interface GoogleDriveAPIResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

export class GoogleDriveProvider implements CloudProvider {
  type = 'google-drive' as const;
  name = 'Google Drive';
  id = 'google-drive';
  icon = 'google';
  supportedFormats = ['csv', 'json', 'excel', 'pdf', 'zip'] as const;
  maxFileSize = 5 * 1024 * 1024 * 1024; // 5GB

  private clientId: string;
  private redirectUri: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(clientId: string) {
    this.clientId = clientId;
    // TODO: Implement proper redirect URI when AuthSession is available
    this.redirectUri = 'exp://localhost:19000/--/auth';
  }

  async authenticate(): Promise<AuthResult> {
    try {
      // Check if we have stored tokens
      const storedTokens = await this.loadStoredTokens();
      if (storedTokens.accessToken) {
        // Verify token is still valid
        const isValid = await this.verifyToken(storedTokens.accessToken);
        if (isValid) {
          this.accessToken = storedTokens.accessToken;
          this.refreshToken = storedTokens.refreshToken || null;
          return {
            success: true,
            token: this.accessToken || undefined,
            refreshToken: this.refreshToken || undefined
          };
        }
      }

      // TODO: Implement proper OAuth flow when AuthSession is available
      return {
        success: false,
        error: 'Google Drive authentication not yet implemented - requires expo-auth-session'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication error'
      };
    }
  }

  async upload(file: FileData, path: string, options?: UploadOptions): Promise<UploadResult> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const metadata = {
        name: file.name,
        parents: options?.folder ? [options.folder] : undefined,
        description: options?.metadata?.description || 'Export from PhoneLogAI'
      };

      // Create file metadata
      const metadataResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      if (!metadataResponse.ok) {
        throw new Error(`Failed to create file metadata: ${metadataResponse.statusText}`);
      }

      const fileMetadata = await metadataResponse.json();

      // Upload file content
      const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileMetadata.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': file.mimeType
        },
        body: file.content
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file content: ${uploadResponse.statusText}`);
      }

      // Get final file info
      const fileInfoResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileMetadata.id}?fields=id,name,size,webViewLink,createdTime`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const fileInfo = await fileInfoResponse.json();

      return {
        id: fileInfo.id,
        name: fileInfo.name,
        url: fileInfo.webViewLink,
        size: parseInt(fileInfo.size) || file.size,
        path: path,
        created_at: fileInfo.createdTime
      };

    } catch (error) {
      throw new Error(`Google Drive upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(path: string): Promise<FileList> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      let query = "trashed = false";
      if (path && path !== '/') {
        query += ` and '${path}' in parents`;
      }

      const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,createdTime,modifiedTime)`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const result = await response.json() as GoogleDriveAPIResponse;

      const files = result.files
        .filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
        .map((file) => ({
          id: file.id,
          name: file.name,
          size: parseInt(file.size || '0') || 0,
          url: `https://drive.google.com/file/d/${file.id}/view`,
          path: path,
          mimeType: file.mimeType,
          created_at: file.createdTime || new Date().toISOString(),
          modified_at: file.modifiedTime || new Date().toISOString()
        }));

      const folders = result.files
        .filter((file) => file.mimeType === 'application/vnd.google-apps.folder')
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          path: `${path}/${folder.name}`,
          created_at: folder.createdTime || new Date().toISOString(),
          modified_at: folder.modifiedTime || new Date().toISOString()
        }));

      return {
        files,
        folders,
        hasMore: false
      };

    } catch (error) {
      throw new Error(`Failed to list Google Drive files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async download(path: string): Promise<FileData> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      // Get file metadata
      const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${path}?fields=id,name,size,mimeType`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!metadataResponse.ok) {
        throw new Error(`Failed to get file metadata: ${metadataResponse.statusText}`);
      }

      const metadata = await metadataResponse.json();

      // Download file content
      const contentResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${path}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!contentResponse.ok) {
        throw new Error(`Failed to download file: ${contentResponse.statusText}`);
      }

      const content = await contentResponse.text();

      return {
        name: metadata.name,
        content,
        mimeType: metadata.mimeType,
        size: parseInt(metadata.size) || content.length
      };

    } catch (error) {
      throw new Error(`Google Drive download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(path: string): Promise<boolean> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${path}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return response.ok;

    } catch (error) {
      console.error('Google Drive delete error:', error);
      return false;
    }
  }

  async getQuota(): Promise<QuotaInfo> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get quota: ${response.statusText}`);
      }

      const result = await response.json();
      const quota = result.storageQuota;

      const used = parseInt(quota.usage) || 0;
      const total = parseInt(quota.limit) || 0;
      const available = total - used;

      return {
        used,
        total,
        available,
        percentage: total > 0 ? Math.round((used / total) * 100) : 0
      };

    } catch (error) {
      throw new Error(`Failed to get Google Drive quota: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isAuthenticated: (() => Promise<boolean>) = async (): Promise<boolean> => {
    if (!this.accessToken) {
      return false;
    }

    return await this.verifyToken(this.accessToken);
  };

  private async exchangeCodeForTokens(code: string): Promise<{ access_token?: string; refresh_token?: string; [key: string]: unknown }> {
    const tokenRequest = {
      client_id: this.clientId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri
    };

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: Object.entries(tokenRequest)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return await response.json();
  }

  private async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getUserInfo(): Promise<{ displayName?: string; emailAddress?: string; [key: string]: unknown }> {
    if (!this.accessToken) {
      return {};
    }

    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.ok) {
        const userInfo = await response.json();
        return {
          id: userInfo.id,
          name: userInfo.name,
          email: userInfo.email,
          avatar: userInfo.picture
        };
      }
    } catch (error) {
      console.warn('Failed to get user info:', error);
    }

    return {};
  }

  private async storeTokens(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const tokens = {
        accessToken,
        refreshToken,
        timestamp: Date.now()
      };

      await AsyncStorage.setItem('google_drive_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.warn('Failed to store Google Drive tokens:', error);
    }
  }

  private async loadStoredTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
    try {
      const stored = await AsyncStorage.getItem('google_drive_tokens');
      if (stored) {
        const tokens = JSON.parse(stored);
        // Check if tokens are not too old (24 hours)
        const age = Date.now() - (tokens.timestamp || 0);
        if (age < 24 * 60 * 60 * 1000) {
          return tokens;
        }
      }
    } catch (error) {
      console.warn('Failed to load stored Google Drive tokens:', error);
    }

    return {};
  }
}