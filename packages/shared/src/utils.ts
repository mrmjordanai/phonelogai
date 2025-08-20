import { UserRole, ROLE_HIERARCHY } from './constants';

// Role permission utilities
export const hasPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return (ROLE_HIERARCHY as Record<UserRole, number>)[userRole] >= (ROLE_HIERARCHY as Record<UserRole, number>)[requiredRole];
};

// Date formatting utilities
export const formatDate = (date: string | Date, locale: string = 'en-US'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale);
};

export const formatDateTime = (date: string | Date, locale: string = 'en-US'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale);
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Phone number utilities
export const formatPhoneNumber = (number: string): string => {
  // Remove all non-digit characters
  const cleaned = number.replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX for US numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return as-is if not a standard US number
  return number;
};

export const anonymizePhoneNumber = (number: string): string => {
  const formatted = formatPhoneNumber(number);
  // Replace middle digits with X's
  return formatted.replace(/\d(?=\d{4})/g, 'X');
};

// File size utilities
export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

// Error handling utilities
export const isApiError = (error: unknown): error is { message: string } => {
  return typeof error === 'object' && error !== null && 'message' in error;
};

export const getErrorMessage = (error: unknown): string => {
  if (isApiError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
};

// Validation utilities
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhoneNumber = (number: string): boolean => {
  const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
  const cleaned = number.replace(/\D/g, '');
  return phoneRegex.test(cleaned) && cleaned.length >= 10;
};

// Debounce utility
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};