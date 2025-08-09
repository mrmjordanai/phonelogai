// Anonymization Types for Call/SMS Intelligence Platform
// Shared types for anonymization system

export type AnonymizationTechnique = 
  | 'masking' 
  | 'tokenization' 
  | 'generalization' 
  | 'suppression'
  | 'perturbation'
  | 'k_anonymity'
  | 'differential_privacy'

export type PIIType = 
  | 'person_name'
  | 'phone_number'
  | 'email_address'
  | 'ssn'
  | 'credit_card'
  | 'address'
  | 'date_of_birth'
  | 'driver_license'
  | 'passport'
  | 'bank_account'
  | 'ip_address'
  | 'custom'

export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'
export type PolicyScope = 'global' | 'organization' | 'team' | 'user'
export type ComplianceFramework = 'gdpr' | 'ccpa' | 'hipaa' | 'sox' | 'pci_dss' | 'custom'

export interface AnonymizationStrategy {
  technique: AnonymizationTechnique
  field: string
  config: Record<string, any>
  reversible: boolean
  strength: 'low' | 'medium' | 'high'
}

export interface AnonymizationJob {
  id: string
  userId: string
  strategies: AnonymizationStrategy[]
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  totalRecords: number
  processedRecords: number
  errorCount: number
  startedAt?: Date
  completedAt?: Date
  errors: string[]
  metadata: Record<string, any>
}

export interface AnonymizationResult {
  jobId: string
  originalValue: any
  anonymizedValue: any
  technique: AnonymizationTechnique
  reversible: boolean
  token?: string
  qualityScore: number
  metadata: Record<string, any>
}