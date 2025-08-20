/**
 * Cloud Storage Types
 * Type definitions for cloud storage integration
 */

export type CloudProviderType = 'google_drive' | 'google-drive' | 'dropbox' | 'aws_s3' | 'local' | 'icloud' | 'onedrive';

export interface CloudProvider {
  type: CloudProviderType;
  name: string;
  id: string;
  icon: string;
  supportedFormats: readonly string[];
  maxFileSize: number;
  authenticate(): Promise<AuthResult>;
  upload(_file: FileData, _path: string, _options?: UploadOptions): Promise<UploadResult>;
  list(_path: string): Promise<FileList>;
  download(_path: string): Promise<FileData>;
  delete(_path: string): Promise<boolean>;
  getQuota(): Promise<QuotaInfo>;
  isAuthenticated: boolean | (() => Promise<boolean>);
}

export interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  expiresAt?: string;
  error?: string;
  user?: CloudUser;
}

export interface CloudUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface FileData {
  name: string;
  content: string | ArrayBuffer;
  mimeType: string;
  size: number;
  uri?: string;
}

export interface UploadOptions {
  folder?: string;
  overwrite?: boolean;
  public?: boolean;
  metadata?: Record<string, unknown>;
  onProgress?: (_progress: UploadProgress) => void;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // bytes per second
  eta?: number; // seconds remaining
}

export interface UploadResult {
  id: string;
  name: string;
  url: string;
  size: number;
  path: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface FileList {
  files: CloudFile[];
  folders: CloudFolder[];
  hasMore: boolean;
  nextPageToken?: string;
}

export interface CloudFile {
  id: string;
  name: string;
  size: number;
  url: string;
  path: string;
  mimeType: string;
  created_at: string;
  modified_at: string;
  downloadUrl?: string;
}

export interface CloudFolder {
  id: string;
  name: string;
  path: string;
  created_at: string;
  modified_at: string;
}

export interface QuotaInfo {
  used: number;
  total: number;
  available: number;
  percentage: number;
}

export interface CloudStorageConfig {
  provider: CloudProviderType;
  enabled: boolean;
  autoSync?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  maxFileSize?: number;
  allowedFormats?: string[];
  defaultFolder?: string;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  failed: number;
  skipped: number;
  errors: SyncError[];
}

export interface SyncError {
  filename: string;
  error: string;
  retryable: boolean;
}

export interface CloudExportOptions {
  provider: CloudProviderType;
  folder?: string;
  public?: boolean;
  notify?: boolean;
  backup?: boolean;
}

// Cloud provider credentials
export interface GoogleDriveCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface DropboxCredentials {
  appKey: string;
  appSecret: string;
  redirectUri: string;
}

export interface OneDriveCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Cloud storage events
export interface CloudStorageEvent {
  type: 'upload_start' | 'upload_progress' | 'upload_complete' | 'upload_error' | 'auth_required';
  provider: CloudProviderType;
  data?: unknown;
  timestamp: string;
}

export type CloudStorageEventCallback = (_event: CloudStorageEvent) => void;