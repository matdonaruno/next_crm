# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語設定

**重要**: このプロジェクトでは**日本語**でコミュニケーションを行ってください。
- すべての会話は日本語で行う
- コメントやドキュメントも日本語で記述する
- エラーメッセージや説明も日本語で提供する

## Essential Commands

### Development
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript compiler check
```

### Specialized Commands
```bash
npm run setup-pwa                    # Generate PWA assets
npm run generate-pwa-icons          # Generate PWA icons from SVG
npm run create-minutesaudio-bucket  # Setup Supabase storage bucket
npm run check-missing-records       # Database health check
```

## Project Architecture

### Core Application Structure
This is a **Next.js 15 App Router** application serving as a **clinical laboratory management system** (LaboLogbook) with PWA capabilities.

**Main Features:**
- **Temperature Management** - IoT sensor monitoring and incident logging
- **Equipment Maintenance** - Equipment tracking and maintenance schedules  
- **Quality Control** (`precision-management`) - Quality control processes and records
- **Reagent Management** - Clinical reagent inventory and usage tracking
- **Meeting Minutes** - Audio recording, AI transcription, and summarization
- **User Management** - Multi-tenant access control

### Authentication Architecture
**Multi-layered Supabase-based authentication:**
- `src/contexts/AuthContext.tsx` - Complex auth state with user profiles and caching
- `src/lib/supabase/client.ts` & `server.ts` - Dual client pattern (browser/server)
- `src/app/_providers/AuthGateWrapper.client.tsx` - Auth guard wrapper
- **Role-based access control**: superuser, facility_admin, regular_user
- **Multi-tenancy**: Facility-scoped data isolation

### Database & API Integration
**Supabase Backend-as-a-Service:**
- **PostgreSQL** with Row Level Security (RLS)
- **Real-time subscriptions** for live updates
- **Custom API routes** in `/src/app/api/` for complex operations
- **Dual client pattern**: Server components use `createServerClient()`, client components use `supabaseBrowser`

### Key Technical Patterns

**Component Architecture:**
- **Client/Server split**: Heavy use of `'use client'` directives for interactive components
- **Feature-based organization**: Components organized by domain (temperature, precision-management, etc.)
- **shadcn/ui** base components in `src/components/ui/`

**State Management:**
- **AuthContext** for global auth state with caching
- **Custom hooks** for feature-specific state (`useUserProfile`, `useFacilityName`)
- **React Hook Form + Zod** for form validation

**Data Access:**
- **Cache managers** in `src/lib/` for performance (`userCache.ts`, `facilityCache.ts`)
- **Type-safe database access** using generated types
- **Facility-scoped queries** for multi-tenancy

### AI Integration
**OpenAI-powered features:**
- Audio transcription using Whisper API
- Meeting summarization
- Configuration in `src/lib/openai.ts`

### IoT Integration
**Temperature sensor monitoring:**
- ESP8266 Arduino code in `src/esp8266/`
- Real-time sensor data via `/api/sensor/`
- Temperature incident logging and approval workflows

### Important File Locations

**Core Configuration:**
- `src/lib/supabase/` - Database client configuration
- `src/contexts/AuthContext.tsx` - Authentication state management
- `src/@types/` - Custom TypeScript definitions
- `public/manifest.json` - PWA configuration

**Database:**
- `src/db/` - SQL schemas and migrations
- `sql/` - Database setup scripts
- Generated types should be in `src/types/database.types.ts`

**Key Components:**
- `src/app/layout.tsx` - Root layout with PWA metadata
- `src/components/ui/` - Base UI component library
- `src/hooks/` - Reusable React hooks

### Development Notes

**Type Safety:**
- Always run `npm run typecheck` before committing
- Use generated database types from Supabase
- Zod schemas for runtime validation

**Multi-tenancy:**
- All data access should be facility-scoped
- Check user roles for admin operations
- Use `facility_id` in all relevant queries

**PWA Requirements:**
- Test offline functionality
- Verify service worker updates
- Check mobile responsiveness on iPad/iOS

**Audio Processing:**
- Audio files stored in Supabase Storage
- Use MediaRecorder API for client-side recording
- Handle large file uploads appropriately

**Performance:**
- Leverage caching managers in `src/lib/`
- Use dynamic imports for large components
- Monitor real-time subscription performance