"""Single-process production entry point for the portable deployment bundle.

The existing FastAPI API is mounted first, then the compiled Vite application
is served from the same origin so relative /api requests work on any platform.
"""

from pathlib import Path
import sys

from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "artifacts" / "api-server"
FRONTEND_DIST = ROOT / "artifacts" / "racc-mobility" / "dist" / "public"

if not FRONTEND_DIST.is_dir():
    raise RuntimeError(
        f"Frontend build not found at {FRONTEND_DIST}. "
        "Run the frontend build before starting the production server."
    )

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from main import app  # noqa: E402


# API routes are registered before this catch-all static mount, so /api/*
# continues to be handled by FastAPI while the browser app is served at /.
app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")