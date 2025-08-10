# PhoneLog AI - Call/SMS Intelligence Platform

A comprehensive mobile application for analyzing call and SMS data with AI-powered insights, built with React Native/Expo and Supabase backend.

## 🏗️ Architecture

### Technology Stack
- **Frontend**: React Native + Expo (mobile-only)
- **Backend**: Supabase (Postgres + pgvector + Auth + Storage)
- **Database**: PostgreSQL with Row-Level Security (RLS)
- **AI/ML**: OpenRouter LLM integration + Python workers
- **Deployment**: EAS (mobile)

### Project Structure
```
phonelogai/
├── apps/
│   └── mobile/           # React Native/Expo mobile app
├── packages/
│   ├── shared/           # Mobile utilities and RBAC
│   ├── types/            # TypeScript type definitions
│   ├── database/         # Supabase client and migrations
│   └── data-ingestion/   # AI-powered data processing
└── workers/              # Python ML workers
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm/yarn
- Supabase account
- Expo CLI (for mobile development)

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd phonelogai
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Database Setup**
   ```bash
   # Run database migrations
   cd packages/database
   npm run migrate
   ```

4. **Start Mobile Development**
   ```bash
   # Start mobile application
   npm run dev
   # or
   npm run mobile
   ```

## 📱 Features

### Core Functionality
- **Data Ingestion**: AI-powered file parsing for carrier data
- **Mobile Sync**: Android on-device call/SMS log collection (iOS manual import)
- **Events Screen**: Comprehensive call/SMS timeline with filtering and search
- **Privacy Controls**: Per-contact visibility settings and anonymization
- **Offline Support**: Complete offline functionality with intelligent sync

### Security & Compliance
- Row-Level Security (RLS) at database level
- Field-level AES-GCM encryption for sensitive data
- RBAC with 5 role levels (owner, admin, analyst, member, viewer)
- Comprehensive audit logging
- GDPR/CCPA compliance features

### Enterprise Features
- Multi-tenant organization support
- Incident reporting and ticket management
- Webhook integrations with HMAC signing
- CRM integrations (HubSpot, Salesforce, Zoho)
- Stripe billing integration

## 🔧 Development

### Available Scripts
```bash
npm run dev         # Start mobile development server  
npm run build       # Build mobile application
npm run lint        # Run ESLint on mobile app
npm run type-check  # Run TypeScript checks
npm run test        # Run mobile tests
```

### Database Migrations
```bash
cd packages/database
npm run migrate     # Run pending migrations
npm run seed        # Seed with sample data
npm run reset       # Reset database (development only)
```

### Mobile Development
```bash
# Direct Expo commands (recommended)
cd apps/mobile
npx expo start      # Start Expo development server
npx expo start --android    # Run on Android
npx expo start --ios        # Run on iOS
```

## 📊 Database Schema

### Core Tables
- `events` - Call/SMS records with privacy controls
- `contacts` - Phone number metadata and statistics
- `privacy_rules` - Per-contact visibility settings
- `sync_health` - Data source monitoring

### Enterprise Tables
- `org_roles` - Role-based access control
- `audit_log` - Comprehensive activity logging
- `incidents` - Issue tracking and reporting
- `billing_subscriptions` - Stripe integration

## 🔒 Security

### Row-Level Security (RLS)
All tables enforce RLS policies based on:
- User ownership
- Organization membership
- Role-based permissions
- Privacy rule settings

### Privacy Controls
- **Team Visible (default)**: Data visible to organization members
- **Private**: Only visible to data owner and admins
- **Public**: Visible to all users (rarely used)

### Audit Logging
Automatic logging of:
- Data access and exports
- Privacy rule changes
- Role modifications
- System administration actions

## 🚀 Deployment

### Mobile Application (EAS)
```bash
cd apps/mobile
eas build --platform all      # Build for iOS and Android
eas submit --platform all     # Submit to app stores
```

### Database (Supabase)  
Database migrations are applied via scripts in `packages/database/scripts/`

## 📈 Performance Targets

| Component | Target Performance |
|-----------|-------------------|
| **Data Ingestion** | ≤100k rows in <5min, ≤1M rows in <30min |
| **Events Screen** | Load <1.5s, Infinite scroll <500ms |
| **Mobile Sync** | Offline queue, Wi-Fi preferred, <50MB memory |
| **Conflict Resolution** | <5s per 1000 events, 85%+ auto-resolution |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: See `/docs` directory
- **Issues**: GitHub Issues
- **Discord**: [Community Server](https://discord.gg/phonelogai)
- **Email**: support@phonelogai.com