# Iris AI Frontend

Next.js frontend for Iris AI chat UI and authentication flows.

## Prerequisites

- Node.js 18+
- npm (or pnpm/yarn)

## Environment Setup

1. Copy the example file:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

2. Fill values in `.env.local`.

### Required Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key.
- `NEXT_PUBLIC_APP_URL` - Frontend app origin (for auth redirect links), e.g. `http://localhost:3000`.
- `NEXT_PUBLIC_API_URL` - Backend API base URL, e.g. `http://localhost:8000`.

## Install and Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deployment Notes

- Set the same env vars in your deployment platform (Vercel, etc.).
- Keep `.env.local` out of Git.
- Keep `.env.example` in Git as the template.
