/**
 * Template System Types
 * Type definitions for export template management
 */

import { ExportFormat, ExportField, TemplateLayout, BrandingOptions } from './ExportTypes';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  format: ExportFormat;
  category: TemplateCategory;
  isDefault: boolean;
  isCustom: boolean;
  fields: ExportField[];
  layout: TemplateLayout;
  branding?: BrandingOptions;
  preview?: TemplatePreview;
  created_at: string;
  updated_at: string;
}

export type TemplateCategory = 'standard' | 'analytics' | 'reports' | 'custom';

export interface TemplatePreview {
  thumbnail?: string;
  sampleData?: unknown;
  description: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationWarning[];
}

export interface TemplateValidationError {
  field: string;
  message: string;
  code: string;
}

export interface TemplateValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface TemplateApplicationResult {
  success: boolean;
  data?: unknown;
  errors?: string[];
  metadata?: TemplateMetadata;
}

export interface TemplateMetadata {
  appliedAt: string;
  templateId: string;
  templateVersion: string;
  dataVersion: string;
  processingTime: number;
}

// Standard template definitions
export interface StandardTemplates {
  // CSV Templates
  basic_csv: TemplateDefinition;
  detailed_csv: TemplateDefinition;
  analytics_csv: TemplateDefinition;
  
  // JSON Templates
  basic_json: TemplateDefinition;
  structured_json: TemplateDefinition;
  
  // Excel Templates
  spreadsheet_excel: TemplateDefinition;
  dashboard_excel: TemplateDefinition;
  
  // PDF Templates
  executive_pdf: TemplateDefinition;
  detailed_pdf: TemplateDefinition;
  summary_pdf: TemplateDefinition;
}

export interface TemplateFieldMapping {
  sourceField: string;
  targetField: string;
  transform?: FieldTransform;
  condition?: FieldCondition;
}

export interface FieldTransform {
  type: 'format' | 'calculate' | 'concatenate' | 'lookup';
  options: Record<string, unknown>;
}

export interface FieldCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  value: unknown;
}

export interface TemplateCustomization {
  templateId: string;
  customizations: CustomizationOption[];
  presets?: CustomizationPreset[];
}

export interface CustomizationOption {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'color' | 'font';
  label: string;
  description?: string;
  defaultValue: unknown;
  options?: SelectOption[];
  validation?: ValidationRule[];
}

export interface SelectOption {
  value: unknown;
  label: string;
  description?: string;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: unknown;
  message: string;
}

export interface CustomizationPreset {
  id: string;
  name: string;
  description: string;
  values: Record<string, unknown>;
}

// Template engine interface
export interface TemplateEngine {
  apply(_template: TemplateDefinition, _data: unknown): Promise<TemplateApplicationResult>;
  validate(_template: TemplateDefinition): Promise<TemplateValidationResult>;
  preview(_template: TemplateDefinition, _sampleData: unknown): Promise<string>;
  generatePreview(_template: TemplateDefinition): Promise<TemplatePreview>;
}

// Template storage
export interface TemplateStorage {
  save(_template: TemplateDefinition): Promise<void>;
  load(_id: string): Promise<TemplateDefinition | null>;
  list(_category?: TemplateCategory): Promise<TemplateDefinition[]>;
  delete(_id: string): Promise<boolean>;
  duplicate(_id: string, _newName: string): Promise<TemplateDefinition>;
}

// Template events
export interface TemplateEvent {
  type: 'created' | 'updated' | 'deleted' | 'applied' | 'validated';
  templateId: string;
  data?: unknown;
  timestamp: string;
}

export type TemplateEventCallback = (_event: TemplateEvent) => void;