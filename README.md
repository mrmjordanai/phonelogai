# PhoneLog AI - Call/SMS Intelligence Platform

A comprehensive platform for analyzing call and SMS data with AI-powered insights, built with React Native/Expo (mobile), Next.js (web), and Supabase (backend).

## 🏗️ Architecture

### Technology Stack
- **Frontend**: React Native + Expo (mobile), Next.js + React (web)
- **Backend**: Supabase (Postgres + pgvector + Auth + Storage)
- **Database**: PostgreSQL with Row-Level Security (RLS)
- **AI/ML**: Python workers with OpenAI integration
- **Cache/Queue**: Redis
- **Billing**: Stripe
- **Deployment**: Vercel (web), EAS (mobile)

### Project Structure
```
phonelogai/
├── apps/
│   ├── web/              # Next.js web application
│   └── mobile/           # React Native/Expo mobile app
├── packages/
│   ├── shared/           # Shared components and utilities
│   ├── types/            # TypeScript type definitions
│   └── database/         # Database client and migrations
└── docs/                 # Documentation
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

4. **Start Development Servers**
   ```bash
   # Start web application
   npm run web

   # Start mobile application
   npm run mobile
   ```

## 📱 Features

### Core Functionality
- **Data Ingestion**: Upload carrier CDR files, CSV data, manual entry
- **Mobile Sync**: Android on-device call/SMS log collection (iOS manual import)
- **Dashboards**: Time Explorer, Heat Maps, Contact Intelligence
- **NLQ (Natural Language Queries)**: Chat with your data using AI
- **Privacy Controls**: Per-contact visibility settings and anonymization

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
npm run dev         # Start all development servers
npm run build       # Build all applications
npm run lint        # Run ESLint
npm run type-check  # Run TypeScript checks
npm run test        # Run tests
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
npm run mobile      # Start Expo development server
npm run android     # Run on Android device/emulator
npm run ios         # Run on iOS device/simulator
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

### Web Application (Vercel)
```bash
npm run build:web
vercel deploy
```

### Mobile Application (EAS)
```bash
cd apps/mobile
eas build --platform all
eas submit --platform all
```

### Database (Supabase)
Database migrations are automatically applied via Supabase CLI or manual SQL execution.

## 📈 Performance Targets

| Component | Target Performance |
|-----------|-------------------|
| **Data Ingestion** | ≤100k rows in <5min, ≤1M rows in <30min |
| **Dashboard Load** | Event Table <1.5s, Heat-Map <2s |
| **NLQ Response** | p50 <2s, p95 <5s |
| **Mobile Sync** | Offline queue, Wi-Fi preferred |

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