/**
 * Dropbox Provider
 * Handles Dropbox integration for cloud exports
 */

// import * as AuthSession from 'expo-auth-session'; // TODO: Install expo-auth-session
const AuthSession = {
  makeRedirectUri: (_options: { useProxy: boolean }) => 'exp://localhost:19000/--/auth',
  AuthRequest: class {
    constructor(_config: any) {}
    async promptAsync(_discovery: any): Promise<{ type: string; params: any }> {
      throw new Error('AuthSession not implemented - install expo-auth-session');
    }
  },
  ResponseType: { Code: 'code' }
};
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
  CloudUser
} from '../../../types/export/CloudTypes';
// import { ExportFormat } from '../../../types/export'; // TODO: Use when needed

WebBrowser.maybeCompleteAuthSession();

interface DropboxAPIEntry {
  '.tag': 'file' | 'folder';
  id: string;
  name: string;
  size?: number;
  path_display: string;
  server_modified?: string;
}

interface DropboxAPIResponse {
  entries: DropboxAPIEntry[];
  cursor?: string;
  has_more: boolean;
}

export class DropboxProvider implements CloudProvider {
  id = 'dropbox' as const;
  type = 'dropbox' as const;
  name = 'Dropbox';
  icon = 'cloud-upload';
  supportedFormats = ['csv', 'json', 'excel', 'pdf', 'zip'] as const;
  maxFileSize = 150 * 1024 * 1024; // 150MB
  
  isAuthenticated: (() => Promise<boolean>) = async (): Promise<boolean> => {
    if (!this.accessToken) {
      return false;
    }
    return await this.verifyToken(this.accessToken);
  };

  private appKey: string;
  private redirectUri: string;
  private accessToken: string | null = null;

  constructor(appKey: string) {
    this.appKey = appKey;
    this.redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  }

  async authenticate(): Promise<AuthResult> {
    try {
      // Check if we have stored token
      const storedToken = await this.loadStoredToken();
      if (storedToken) {
        // Verify token is still valid
        const isValid = await this.verifyToken(storedToken);
        if (isValid) {
          this.accessToken = storedToken;
          return {
            success: true,
            token: this.accessToken
          };
        }
      }

      // Create auth request
      const request = new AuthSession.AuthRequest({
        clientId: this.appKey,
        scopes: ['files.content.write', 'files.content.read'],
        responseType: AuthSession.ResponseType.Code,
        redirectUri: this.redirectUri,
        additionalParameters: {
          token_access_type: 'offline'
        },
        state: 'phonelogai_export'
      });

      const discovery = {
        authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
        tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token'
      };

      // Prompt for authentication
      const result = await request.promptAsync(discovery);

      if (result.type === 'success' && result.params.code) {
        // Exchange code for token
        const tokenResult = await this.exchangeCodeForToken(result.params.code);
        
        if (tokenResult.access_token) {
          this.accessToken = tokenResult.access_token;

          // Store token
          await this.storeToken(this.accessToken);

          // Get user info
          const userInfo = await this.getUserInfo();

          return {
            success: true,
            token: this.accessToken,
            user: userInfo
          };
        }
      }

      return {
        success: false,
        error: 'Authentication failed'
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
      const uploadPath = options?.folder ? `/${options.folder}/${file.name}` : `/${file.name}`;
      
      const uploadParams = {
        path: uploadPath,
        mode: options?.overwrite ? 'overwrite' : 'add',
        autorename: !options?.overwrite
      };

      const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify(uploadParams)
        },
        body: typeof file.content === 'string' ? file.content : file.content
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      return {
        id: result.id,
        name: result.name,
        url: `https://www.dropbox.com/home${result.path_display}`,
        size: result.size,
        path: result.path_display,
        created_at: result.server_modified || new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Dropbox upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(path: string): Promise<FileList> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const listParams = {
        path: path === '/' ? '' : path,
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false
      };

      const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(listParams)
      });

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const result = await response.json() as DropboxAPIResponse;

      const files = result.entries
        .filter((entry) => entry['.tag'] === 'file')
        .map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size || 0,
          url: `https://www.dropbox.com/home${file.path_display}`,
          path: file.path_display,
          mimeType: this.getMimeTypeFromExtension(file.name),
          created_at: file.server_modified || new Date().toISOString(),
          modified_at: file.server_modified || new Date().toISOString()
        }));

      const folders = result.entries
        .filter((entry) => entry['.tag'] === 'folder')
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          path: folder.path_display,
          created_at: folder.server_modified || new Date().toISOString(),
          modified_at: folder.server_modified || new Date().toISOString()
        }));

      return {
        files,
        folders,
        hasMore: result.has_more
      };

    } catch (error) {
      throw new Error(`Failed to list Dropbox files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async download(path: string): Promise<FileData> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const downloadParams = {
        path: path
      };

      const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify(downloadParams)
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const content = await response.text();
      const metadata = JSON.parse(response.headers.get('dropbox-api-result') || '{}');

      return {
        name: metadata.name,
        content,
        mimeType: this.getMimeTypeFromExtension(metadata.name),
        size: metadata.size || content.length
      };

    } catch (error) {
      throw new Error(`Dropbox download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(path: string): Promise<boolean> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const deleteParams = {
        path: path
      };

      const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deleteParams)
      });

      return response.ok;

    } catch (error) {
      console.error('Dropbox delete error:', error);
      return false;
    }
  }

  async getQuota(): Promise<QuotaInfo> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authenticate first.');
    }

    try {
      const response = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get quota: ${response.statusText}`);
      }

      const result = await response.json();
      const used = result.used || 0;
      const total = result.allocation?.allocated || 0;
      const available = total - used;

      return {
        used,
        total,
        available,
        percentage: total > 0 ? Math.round((used / total) * 100) : 0
      };

    } catch (error) {
      throw new Error(`Failed to get Dropbox quota: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  private async exchangeCodeForToken(code: string): Promise<{ access_token?: string; [key: string]: unknown }> {
    const tokenRequest = {
      client_id: this.appKey,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri
    };

    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
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
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getUserInfo(): Promise<CloudUser> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.ok) {
        const userInfo = await response.json();
        return {
          id: userInfo.account_id || 'unknown',
          name: userInfo.name?.display_name || 'Unknown User',
          email: userInfo.email || 'unknown@dropbox.com'
        };
      }
    } catch (error) {
      console.warn('Failed to get user info:', error);
    }

    // Return default user info if API call fails
    return {
      id: 'unknown',
      name: 'Unknown User',
      email: 'unknown@dropbox.com'
    };
  }

  private async storeToken(accessToken: string): Promise<void> {
    try {
      const tokens = {
        accessToken,
        timestamp: Date.now()
      };

      await AsyncStorage.setItem('dropbox_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.warn('Failed to store Dropbox tokens:', error);
    }
  }

  private async loadStoredToken(): Promise<string | null> {
    try {
      const stored = await AsyncStorage.getItem('dropbox_tokens');
      if (stored) {
        const tokens = JSON.parse(stored);
        // Check if token is not too old (30 days)
        const age = Date.now() - (tokens.timestamp || 0);
        if (age < 30 * 24 * 60 * 60 * 1000) {
          return tokens.accessToken;
        }
      }
    } catch (error) {
      console.warn('Failed to load stored Dropbox tokens:', error);
    }

    return null;
  }

  private getMimeTypeFromExtension(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'csv': 'text/csv',
      'json': 'application/json',
      'zip': 'application/zip',
      'txt': 'text/plain'
    };

    return mimeTypes[extension || ''] || 'application/octet-stream';
  }
}