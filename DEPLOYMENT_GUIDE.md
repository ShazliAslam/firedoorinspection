# DoorProof AI — Setup, Security & Deployment Guide

## 1. Architecture Overview
DoorProof AI is a multi-tenant Fire Door Inspection, Deficiency Management, Remediation & Evidence Management SaaS built on:
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Recharts + Framer Motion + jsPDF
- **Backend:** Vercel Serverless Functions (`api/*.js`) enforcing JWT auth, organization isolation, and Role-Based Access Control (RBAC)
- **Database & Storage:** Supabase PostgreSQL (18 normalized tables with strict organization-scoped RLS) and Private Supabase Storage (`doorproof-evidence`) served exclusively via short-lived signed URLs.

## 2. Multi-Tenant Roles & Permissions
| Role | Capabilities |
| :--- | :--- |
| **Owner** | Full organization access, billing/subscriptions, team roles, branding, templates, clients, buildings, doors, inspections, deficiencies, repairs, reports |
| **Admin** | Manage clients, buildings, doors, inspections, deficiencies, repair verifications, reports, and team invitations |
| **Inspector** | Register/edit fire doors, conduct inspections, upload immutable inspection photos, log deficiencies, verify completed repairs, generate reports |
| **Technician** | View assigned deficiencies/repairs, update repair progress & parts needed, upload before/after photos, submit completed repairs for verification (cannot self-verify) |
| **Client** | Strictly isolated Client Portal showing ONLY their assigned client's buildings, inspection history, deficiencies, approved evidence, and explicitly shared PDF reports |

## 3. External Credentials Disclosure
DoorProof AI never simulates paid third-party integrations or fabricates AI compliance decisions:
- **Resend Email Delivery:** Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Vercel to dispatch transactional emails. Without them, all notifications are logged in-app with `email_status = skipped_no_resend_key`.
- **AI Assistance:** Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` to enable document/note summarization with mandatory human approval. Without them, the AI panel clearly displays a disabled state.
- **Stripe Billing:** Set `STRIPE_SECRET_KEY` to activate live subscription checkout. Without it, plan limits are tracked accurately in PostgreSQL and checkout is cleanly disabled without simulating payments.

## 4. Supabase Setup & Vercel Deployment
1. Run `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor.
2. Create a private Storage bucket named `doorproof-evidence`.
3. Configure environment variables from `.env.example` in Vercel Project Settings.
4. Deploy with `vercel --prod`.
