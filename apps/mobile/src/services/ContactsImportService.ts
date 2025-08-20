import * as Contacts from 'expo-contacts';
import { Contact } from '@phonelogai/types';

export interface ContactImportResult {
  success: boolean;
  contactsImported: number;
  errors: string[];
  contactsData: Contact[];
}

export interface ContactImportOptions {
  userId: string;
  lineId?: string;
}

class ContactsImportServiceImpl {
  private static instance: ContactsImportServiceImpl;

  public static getInstance(): ContactsImportServiceImpl {
    if (!ContactsImportServiceImpl.instance) {
      ContactsImportServiceImpl.instance = new ContactsImportServiceImpl();
    }
    return ContactsImportServiceImpl.instance;
  }

  /**
   * Request contacts permission from the user
   */
  public async requestContactsPermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      return false;
    }
  }

  /**
   * Check if we have contacts permission
   */
  public async hasContactsPermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking contacts permission:', error);
      return false;
    }
  }

  /**
   * Import all device contacts
   */
  public async importContacts(options: ContactImportOptions): Promise<ContactImportResult> {
    const result: ContactImportResult = {
      success: false,
      contactsImported: 0,
      errors: [],
      contactsData: []
    };

    try {
      // Check permission first
      const hasPermission = await this.hasContactsPermission();
      if (!hasPermission) {
        const granted = await this.requestContactsPermission();
        if (!granted) {
          result.errors.push('Contacts permission not granted');
          return result;
        }
      }

      // Get all contacts
      const { data: deviceContacts } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
        ],
      });

      // Convert device contacts to our Contact format
      for (const deviceContact of deviceContacts) {
        if (deviceContact.phoneNumbers && deviceContact.phoneNumbers.length > 0) {
          // Create one contact entry per phone number
          for (const phoneNumber of deviceContact.phoneNumbers) {
            if (phoneNumber.number) {
              try {
                const contact: Contact = {
                  id: `import_${deviceContact.id}_${phoneNumber.id || 0}`,
                  user_id: options.userId,
                  line_id: options.lineId,
                  number: this.normalizePhoneNumber(phoneNumber.number),
                  name: deviceContact.name || 'Unknown Contact',
                  company: deviceContact.company,
                  email: deviceContact.emails?.[0]?.email,
                  tags: [],
                  first_seen: new Date().toISOString(),
                  last_seen: new Date().toISOString(),
                  total_calls: 0,
                  total_sms: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  phone_number: this.normalizePhoneNumber(phoneNumber.number) // Compatibility alias
                };

                result.contactsData.push(contact);
                result.contactsImported++;
              } catch (error) {
                console.error('Error processing contact:', error);
                result.errors.push(`Failed to process contact: ${deviceContact.name}`);
              }
            }
          }
        }
      }

      result.success = true;
      console.log(`Successfully imported ${result.contactsImported} contacts`);

    } catch (error) {
      console.error('Error importing contacts:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    return result;
  }

  /**
   * Get basic device contacts info without importing
   */
  public async getContactsInfo(): Promise<{
    hasPermission: boolean;
    totalContacts?: number;
    contactsWithPhones?: number;
  }> {
    try {
      const hasPermission = await this.hasContactsPermission();
      
      if (!hasPermission) {
        return { hasPermission: false };
      }

      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      const contactsWithPhones = contacts.filter(
        contact => contact.phoneNumbers && contact.phoneNumbers.length > 0
      ).length;

      return {
        hasPermission: true,
        totalContacts: contacts.length,
        contactsWithPhones
      };

    } catch (error) {
      console.error('Error getting contacts info:', error);
      return { hasPermission: false };
    }
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(number: string): string {
    // Remove all non-digits except +
    const cleaned = number.replace(/[^\d+]/g, '');
    
    // Handle US numbers
    if (cleaned.match(/^\d{10}$/)) {
      return `+1${cleaned}`;
    }
    
    // Handle numbers that already have country code
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    
    // Handle 11-digit US numbers without +
    if (cleaned.match(/^1\d{10}$/)) {
      return `+${cleaned}`;
    }
    
    // Return as-is for other formats
    return cleaned;
  }
}

export const ContactsImportService = ContactsImportServiceImpl.getInstance();