# PRD — Call / SMS Intelligence Platform

**Document Version:** v1.3.3 (final)  
**Date:** August 4, 2025  
**Platforms:** iOS · Android · Web  
**Target Stack:** React Native + Expo (mobile) · Next.js/React (web) · Supabase (Postgres + Storage + pgvector) · Python workers (ETL / AI) · Serverless functions (ingestion / NLQ) · Redis (queues / cache) · S3-compatible object storage

## Table of Contents

1. [Product Summary](#1-product-summary)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Data Model](#3-data-model)
4. [Feature Detail](#4-feature-detail)
5. [Security, Privacy & Compliance](#5-security-privacy--compliance)
6. [Role-Based Access Control](#6-role-based-access-control)
7. [Incident Management & Support](#7-incident-management--support)
8. [Billing & Subscription Management](#8-billing--subscription-management)
9. [Localization & Internationalization](#9-localization--internationalization)
10. [Offline Support & Sync Health](#10-offline-support--sync-health)
11. [Performance, Sizing & SLAs](#11-performance-sizing--slas)
12. [Disaster Recovery & Backup](#12-disaster-recovery--backup)
13. [Product Analytics](#13-product-analytics)
14. [APIs, Keys & Secrets](#14-apis-keys--secrets)
15. [Onboarding & Education](#15-onboarding--education)
16. [MVP Scope (0-90 days)](#16-mvp-scope-0-90-days)
17. [Phase 2 (90-180 days)](#17-phase-2-90-180-days)
18. [Acceptance Criteria](#18-acceptance-criteria)
19. [Open Questions](#19-open-questions)

## 1. Product Summary

| Pillar | Capabilities |
|--------|-------------|
| **Data Ingestion** | • Carrier CDR / PDF / CSV uploads (iOS & Android)<br>• On-device call / SMS logs (Android only)<br>• Calendar / CRM sync (HubSpot MVP)<br>• Webhook event capture |
| **Core Intelligence** | • Carrier-Verified History<br>• Deleted-Activity Recovery (DAR)<br>• Predictive communication trends |
| **Exploration** | • Dashboards (Time Explorer, Heat-Map, Per-Contact, Team Leaderboards)<br>• Event Table with column builder & saved views<br>• "Chat With Your Data" (natural-language queries with row-level citations) |
| **Governance & Trust** | • Row-level security (RLS)<br>• Per-contact privacy — team-visible by default with first-run bulk-anonymize option<br>• Role-based access control (RBAC)<br>• Unified audit log |
| **Enterprise Readiness** | • Incident reporting & ticket surfacing<br>• SLAs & health telemetry<br>• Compliance exports & BYO S3 backups<br>• Self-serve billing via Stripe |

> **iOS ingestion note:** The platform does not scrape on-device call / SMS logs on iOS. Users import carrier-generated files manually.

## 2. Goals & Success Metrics

| Metric | Target (MVP) |
|--------|-------------|
| **Time-to-First-Insight** | < 10 min after first data upload |
| **Self-Serve Adoption** | ≥ 70% of WAU run ≥ 1 NLQ or Saved View |
| **Privacy Engagement** | ≥ 50% of team orgs modify per-contact privacy within 30 days |
| **Operational Reliability** | Ingestion p95 ≤ 5 min (≤ 100k rows) / ≤ 30 min (≤ 1M) |

## 3. Data Model

```sql
events                 -- call/SMS rows (normalized)
contacts               -- phone numbers & metadata
privacy_rules          -- per-contact policies
sync_health            -- source telemetry
outbox                 -- webhook DLQ
webhook_endpoints      -- registered URLs

-- NEW SINCE v1.2
audit_log(id, actor_id, action, resource, metadata, ts)
incidents(id, reporter_id, kind, severity, status, summary, created_at, closed_at)
tickets(id, user_id, channel, status, subject, last_activity_at)
org_roles(user_id, org_id, role)          -- owner • admin • analyst • member • viewer
billing_subscriptions(id, org_id, plan, seats, status, current_period_end)
i18n_strings(key, locale, text, updated_at)
```

## 4. Feature Detail

### 4.1 Dashboards & Explorers
- **Time Explorer** · **Heat-Map** · **Rhythm sparkline**
- **Contact Intelligence** & profile page
- **Team Dashboards** with leaderboard widgets
- **Builder + Saved Views** (share, export, alert)

### 4.2 Chat With Your Data (NLQ)
- Embeddings stored in pgvector; nightly full refresh + event-triggered partial refresh (< 15 min for 95% of rows)
- SQL-planning templates with deterministic guardrails; p95 < 5s for heavy queries

### 4.3 Deleted-Activity Recovery (DAR)
- Device-side diff queue (Android) detects deletions before SQLite vacuum
- Carrier-gap pattern detection; evidence banner + "Explain this gap" NLQ shortcut
- Alert if deletion spike > 3σ baseline

### 4.4 Integrations

| Category | Phase | Details |
|----------|-------|---------|
| **CRM** | MVP | HubSpot incremental sync via OAuth |
|  | P2 | Salesforce, Zoho |
| **Calendar** | MVP | Google Calendar (meeting ↔ call correlation) |
|  | P2 | Outlook |
| **Webhooks** | MVP | Core event posts, HMAC-signed, retries & DLQ |
| **Carrier Import Parser** | MVP | AI layout classifier + fallback sample-mapping wizard |

## 5. Security, Privacy & Compliance

- **Row-Level Security** in Supabase with Postgres policies
- **Optional field-level AES-GCM encryption** for phone numbers
- **GDPR / CCPA DSR endpoints** (export & delete) with audit-trail
- **App-Store Privacy Manifest** & permission rationale screens (task scheduled during MVP)
- **Default contact visibility:** team-visible; users may bulk-anonymize during first-run wizard
- **Audit log** covers access, exports, deletions, policy edits, webhook deliveries

## 6. Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| **Owner** | Billing, org settings, all data |
| **Admin** | Manage users, privacy rules, integrations |
| **Analyst** | Explore & export data within policy |
| **Member** | Full fidelity on own data; team dashboards per policy |
| **Viewer** | Read-only dashboards |

RBAC enforced in REST & NLQ via row filters.

## 7. Incident Management & Support

- **In-app "Report Incident"** from any dashboard; auto-attaches context
- **Sync-health "Report Drift"** button with evidence bundle
- **Zendesk widget;** ticket status surfaced in-app
- **SLAs:** first response < 8 business h (Starter) / < 4h (Pro/Team) · Parser hotfix < 72h

## 8. Billing & Subscription Management

| Plan | Seats | Features |
|------|-------|----------|
| **Starter (Solo)** | 1 | Core dashboards · basic NLQ · 1 backup target |
| **Pro** | ≤ 5 | Webhooks · HubSpot · 3 backups |
| **Team (Business)** | Unlimited | SSO · BYO S3 · compliance exports · priority support |

Stripe handles proration & invoicing; `billing_subscriptions` mirror prevents seat-drift.

## 9. Localization & Internationalization

- **Framework** in web / mobile; **locales:** en-US, en-GB (MVP) · es, de (Phase 2)
- **Number / date / currency** formatting per locale
- **NLQ date-parser** localized
- **RTL-readiness** documented

## 10. Offline Support & Sync Health (Mobile)

- **AsyncStorage queue** with UUIDs; Wi-Fi-preferred, cellular fallback after age/size thresholds
- **Conflict resolution key:** `(line_id, ts, number, direction, duration±1s)`
- **Sync Health dashboard:** last sync, queue depth, drift %, outage banners

## 11. Performance, Sizing & SLAs

| Area | Target |
|------|--------|
| **Ingestion** | ≤ 100k rows p95 < 5 min · 100k–1M p95 < 30 min |
| **Dashboards** | Event Table p95 < 1.5s · Heat-Map p95 < 2s |
| **NLQ** | p50 < 2s · p95 < 5s |
| **Webhooks** | ≥ 99% delivered p95; exponential backoff retries |
| **CRM Sync (HubSpot)** | Activities ingested p95 < 10 min |

## 12. Disaster Recovery & Backup

- **Daily encrypted Postgres snapshots** + PITR (RPO ≤ 15 min)
- **Object-storage versioning;** weekly integrity check (rehash sample)
- **Regional failover runbook;** RTO ≤ 4h; quarterly restore drill with checksum verification

## 13. Product Analytics

- **Amplitude / Mixpanel** (no PII)
- **KPIs:** time-to-first-insight, NLQ adoption, saved-view creation, alert creation, Sync-Health interactions, churn risk predictors
- **Feature flags & A/B tests** (onboarding, NLQ prompts, dashboard layouts)

## 14. APIs, Keys & Secrets

- **External providers:** HubSpot, Google Calendar, Stripe
- **KMS-backed secret storage;** per-org credentials where required
- **Public REST API** (Team plan): scoped tokens, RLS-enforced, rate-limited

## 15. Onboarding & Education

### First-Run Wizard:
1. Upload carrier file → mapping preview → live progress bar
2. First dashboard auto-opens with guided tour
3. Modal explaining team-visible default & "Bulk Anonymize" action

### Additional Features:
- **Interactive Tutorial Mode**
- **Playground Dataset** for demos

> **Task:** Complete App-Store Privacy Manifest prior to TestFlight / Beta launch

## 16. MVP Scope (0-90 days)

- **Dashboards:** KPIs · Time Explorer · Heat-Map · Contact v1
- **DAR v1.5** (Android)
- **Chat v1.2** (core intents, citations)
- **Integrations:** HubSpot, Google Calendar, webhooks
- **Mobile offline queue** & Sync Health
- **Per-contact privacy** (team-visible default + bulk-anonymize)
- **Accessibility foundations** (WCAG 2.1 AA)
- **Zendesk incident reporting**
- **Stripe billing** & usage screen
- **i18n framework** (en-US / en-GB)

## 17. Phase 2 (90-180 days)

- **Integrations:** Salesforce, Zoho, Outlook
- **Chart Builder** & cohort analytics
- **SSO** (SAML / OIDC)
- **Admin policy packs** (retention, DLP-like)
- **WCAG AA certification** audit
- **Developer API GA** · BYO S3 advanced controls · enterprise compliance exports
- **Localization:** es, de

## 18. Acceptance Criteria

| Area | Test |
|------|------|
| **Ingestion** | User uploads AT&T PDF → events appear in dashboard < 10 min |
| **DAR** | Android deletion triggers banner + NLQ "Explain gap" returns citation |
| **Privacy** | First-run modal appears; bulk-anonymize hides selected contacts in team dashboard |
| **NLQ** | Query "Calls to Acme last month" returns correct rows with citation links |
| **Incident Reporting** | From dashboard, submit incident → ticket ID returned → status shows "Open" |
| **Audit Log** | Admin exports CSV → counts match audit_log rows for chosen period |
| **Billing** | Upgrade Starter → Pro; proration applied immediately; receipt emailed |
| **Localization** | Switch to en-GB → UI labels, dates, NLQ "last fortnight" parse correctly |
| **DR Drill** | Quarterly restore completes in < 4h; checksum match logs |

## 19. Open Questions

1. **Forecast confidence UX:** categorical (Low / Med / High) vs numeric CI tooltip
2. **Data-residency selection:** at signup vs post-hoc migration tooling
