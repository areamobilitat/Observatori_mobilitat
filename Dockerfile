# Build the React/Vite dashboard using the project's pinned pnpm lockfile.
FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

# Corepack provides the pnpm version expected by this repository.
RUN corepack enable

COPY . .
RUN pnpm install --no-frozen-lockfile
RUN PORT=8080 BASE_PATH=/ pnpm --filter @workspace/racc-mobility run build

# Run FastAPI and serve the built frontend from the same container.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code, then bring in the compiled frontend from the build stage.
COPY . .
COPY --from=frontend-build /app/artifacts/racc-mobility/dist /app/artifacts/racc-mobility/dist

EXPOSE 8080

# Render supplies PORT at runtime. Do not set APP_ENV=production here:
# the app currently creates missing SQLModel tables when APP_ENV is unset.
CMD ["sh", "-c", "uvicorn deployment.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
