# RACC Mobility — portable source

This GitHub-ready source bundle runs the React/Vite dashboard and FastAPI API as one web service. The FastAPI entry point serves the built dashboard and `/api` routes from the same origin.

## Deploy on another host

Use Python 3.12+, Node.js 20+ with Corepack/pnpm, and a persistent PostgreSQL database (recommended). From the project root:

```sh
python -m pip install -r requirements.txt
corepack enable
pnpm install --frozen-lockfile
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/racc-mobility run build
PORT=${PORT:-8080} uvicorn deployment.app:app --host 0.0.0.0 --port ${PORT:-8080}
```

Configure the host's start command with `uvicorn deployment.app:app --host 0.0.0.0 --port $PORT` or use the included `Procfile`. The frontend build must run before the service starts because the FastAPI entry point serves `artifacts/racc-mobility/dist/public`.

## Environment settings

- `PORT`: supplied by most hosting platforms; defaults to 8080 in the example command.
- `DATABASE_URL`: use a persistent PostgreSQL URL for deployment. If omitted, the API falls back to `./database.db` (SQLite); use that only when the host provides persistent disk storage.
- `TMB_APP_ID` and `TMB_APP_KEY`: optional; needed only for live AMB-Metro arrivals.

Copy `.env.example` to `.env` for local use. Never commit `.env` or real credentials to GitHub; use your hosting platform's secret/environment settings. The sample contains no credentials.

The API creates its registry table on startup unless `APP_ENV=production`. On external hosts, leave `APP_ENV` unset unless you provision the schema through your own migration process. Replit's production service sets this flag because Replit applies schema changes during publishing.

## Public destructive action

The registry's `DELETE /api/registre/inactives` endpoint remains public by choice and permanently deletes inactive incident rows. It does not require login. Do not expose it publicly unless that behavior is intended.

## Project layout

- `artifacts/racc-mobility/`: dashboard source and Vite build configuration
- `artifacts/api-server/`: FastAPI routes, incident registry, and local traffic-count data
- `attached_assets/`: source scripts and data files used by the API
- `deployment/app.py`: single-service entry point for other hosts
