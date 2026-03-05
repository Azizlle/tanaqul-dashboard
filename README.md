# Tanaqul Dashboard — Admin Panel

React admin dashboard for the Tanaqul precious metals trading platform.

## Tech Stack

- **Framework:** React 18 + Vite
- **Hosting:** Vercel
- **Backend:** FastAPI on Railway

## Setup

```bash
git clone <repo-url>
cd tanaqul-dashboard
npm install
npm run dev
```

Opens at http://localhost:3000

## Environment Variables

Create a `.env` file:

```
VITE_API_BASE=http://localhost:8000/api/v1
```

For production, set `VITE_API_BASE` in Vercel environment variables.

## Deploy to Vercel

1. Import repo at vercel.com
2. Framework: **Vite**
3. Add environment variable: `VITE_API_BASE`
4. Deploy

## License

Private — All rights reserved.
