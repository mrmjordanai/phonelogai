import { PrivacyRule, ContactSearchResult, ContactIntelligence } from './localTypes';

export interface ContactsScreenProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any;
}

export interface ContactListItemProps {
  contact: ContactSearchResult;
  onPress: (_contactId: string) => void;
  onCall?: (_number: string) => void;
  onMessage?: (_number: string) => void;
  onEdit?: (_contactId: string) => void;
  showPrivacyIndicator?: boolean;
}

export interface ContactFiltersState {
  searchTerm: string;
  selectedTags: string[];
  sortBy: 'name' | 'last_contact' | 'interaction_frequency' | 'relevance';
  sortDirection: 'asc' | 'desc';
  companyFilter?: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
}

export interface ContactFiltersProps {
  filters: ContactFiltersState;
  onFiltersChange: (_filters: Partial<ContactFiltersState>) => void;
  onClearFilters: () => void;
  availableTags: string[];
}

export interface ContactSearchBarProps {
  searchTerm: string;
  onSearchChange: (_term: string) => void;
  onClear: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export interface ContactDetailModalProps {
  contactId?: string;
  visible: boolean;
  onClose: () => void;
  onEdit?: (_contactId: string) => void;
  onCall?: (_number: string) => void;
  onMessage?: (_number: string) => void;
}

export interface PrivacyControlsProps {
  contactId: string;
  currentPrivacy?: PrivacyRule;
  onPrivacyUpdate: (_privacy: Partial<PrivacyRule>) => void;
  disabled?: boolean;
}

export interface ContactStatsProps {
  intelligence?: ContactIntelligence;
  loading?: boolean;
}

export interface EmptyStateProps {
  type: 'empty' | 'search' | 'error' | 'loading';
  title: string;
  subtitle?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: string;
}

export interface ContactsListProps {
  contacts: ContactSearchResult[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onContactPress: (_contactId: string) => void;
  onContactCall?: (_number: string) => void;
  onContactMessage?: (_number: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ListHeaderComponent?: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ListFooterComponent?: React.ComponentType<any>;
}

export interface ContactsScreenState {
  selectedContactId?: string;
  showDetailModal: boolean;
  showFilters: boolean;
  isSearchFocused: boolean;
  error?: string;
}