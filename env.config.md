# Environment Configuration

## Web App (.env.local)

Copy the following to `apps/web/.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://ksacsfvvhevxqkhtmraj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzYWNzZnZ2aGV2eHFraHRtcmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTMzNjIsImV4cCI6MjA3MDMyOTM2Mn0.VYhLDQWwwZMhAYl7sYPGViB2LXk-vdPZ2mmKNWCIoHo
SUPABASE_SERVICE_ROLE_KEY=# Get from Supabase dashboard

# Optional Services (can be added later)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENVIRONMENT=development
```

## Mobile App (.env)

Copy the following to `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://ksacsfvvhevxqkhtmraj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzYWNzZnZ2aGV2eHFraHRtcmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTMzNjIsImV4cCI6MjA3MDMyOTM2Mn0.VYhLDQWwwZMhAYl7sYPGViB2LXk-vdPZ2mmKNWCIoHo
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

## Root Workers (.env)

Copy the following to root `.env`:

```env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
```

## Important Notes

1. **Service Role Key**: Get this from your Supabase project dashboard under Settings > API
2. **Database URL**: Get the connection string from Supabase dashboard under Settings > Database
3. **OpenRouter API Key**: Required for NLQ features (optional for initial setup)
4. **Redis**: Required for caching and job queue (optional for initial setup)

## Setup Instructions

1. Create `.env.local` in `apps/web/` directory
2. Create `.env` in `apps/mobile/` directory
3. Create `.env` in root directory for workers
4. Make sure to add these files to `.gitignore` (already configured)
