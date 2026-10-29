from typing import Optional, List
import asyncio
import hashlib
import json
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Field, create_engine, Session, select
from sqlalchemy import inspect as sqlalchemy_inspect, text
import os
import sys
import threading
import time
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import requests
from zoneinfo import ZoneInfo

from analizar_dataset_1 import extraer_incidencias
from amb_metro import build_amb_metro_payload

# Cal tenir en compte que SQL guarda les dades a una base de dades externa per tal d'evitar que aquestes es perdin en cas d'error/traspás en el servidor, usant NEON
#

ATTACHED_ASSETS_DIR = Path(__file__).resolve().parents[2] / "attached_assets"
if str(ATTACHED_ASSETS_DIR) not in sys.path:
    sys.path.insert(0, str(ATTACHED_ASSETS_DIR))
from unified_accidents_incidencies_1787916936008 import (  # noqa: E402
    COMARQUES_URL,
    DIES_RETARD_METEO,
    INCIDENTS_URL,
    PRECIPITACIO_URL,
    construir_resultats,
    descarregar_comarques,
    descarregar_precipitacio,
    comptar_incidencies_temps_real,
    obtenir_comarca,
)

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://", "postgresql+psycopg2://", 1
    )
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://", "postgresql+psycopg2://", 1
    )
PROBABILITY_CACHE_TTL_SECONDS = int(os.getenv("PROBABILITY_CACHE_TTL_SECONDS", "600"))
_probability_cache: dict = {"expires_at": 0.0, "payload": None}
_probability_cache_lock = threading.Lock()
AFORAMENTS_CHART_PATH = Path(__file__).with_name("aforaments_chart.json")
AFORAMENTS_CACHE_TTL_SECONDS = int(os.getenv("AFORAMENTS_CACHE_TTL_SECONDS", "900"))
_aforaments_cache: dict = {"expires_at": 0.0, "payload": None}
_aforaments_cache_lock = threading.Lock()
REGISTRY_REFRESH_INTERVAL_SECONDS = 30 * 60
REGISTRY_REPORT_TIMEZONE = ZoneInfo("Europe/Madrid")
NO_MONTH_INCIDENTS_MESSAGE = "No hi ha incidencies pel que portem de mes"
ROAD_RATIO_MAX_ROWS_PER_ROAD = 2
_registry_last_refresh = 0.0
_registry_refresh_lock = threading.Lock()
_registry_refresh_task = None

# ─── Bases de dades SQL ─────────────────────────────────────────────────────────

class IncidentRegistry(SQLModel, table=True):
    """Historical SCT incident registry; coordinates are intentionally omitted."""

    __tablename__ = "incidentregistry"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    source_key: str = Field(index=True)
    identificador: Optional[str] = None
    tipus: Optional[str] = None
    subtipus: Optional[str] = None
    carretera: Optional[str] = None
    pk_inici: Optional[str] = None
    pk_fi: Optional[str] = None
    causa: Optional[str] = None
    data: Optional[str] = None
    nivell: Optional[str] = None
    sentit: Optional[str] = None
    descripcio: Optional[str] = None
    descripcio_tipus: Optional[str] = None
    font: Optional[str] = None
    cap_a: Optional[str] = None
    comarca: Optional[str] = None
    status: str = "Active"
    data_final: Optional[datetime] = None
    first_seen_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="RACC PAE Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)


def get_session():
    with Session(engine) as session:
        yield session


def _ensure_registry_schema() -> None:
    """Add registry columns that are introduced after the initial deployment."""
    inspector = sqlalchemy_inspect(engine)
    if "incidentregistry" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("incidentregistry")}
    with engine.begin() as connection:
        if "data_final" not in columns and engine.dialect.name == "postgresql":
            connection.execute(
                text(
                    "ALTER TABLE incidentregistry "
                    "ADD COLUMN IF NOT EXISTS data_final TIMESTAMP NULL"
                )
            )
        elif "data_final" not in columns:
            connection.execute(
                text("ALTER TABLE incidentregistry ADD COLUMN data_final DATETIME")
            )
        # Rows that became inactive before data_final was introduced do not have
        # an exact transition timestamp. Their last SCT observation is the
        # closest persisted timestamp and prevents historical rows from
        # remaining blank forever.
        connection.execute(
            text(
                "UPDATE incidentregistry "
                "SET data_final = last_seen_at "
                "WHERE status = 'Innactiu' AND data_final IS NULL"
            )
        )


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    global _registry_refresh_task
    # Replit applies development schema changes to the production database
    # during publishing. Keep DDL and data backfills out of production startup.
    if os.getenv("APP_ENV") != "production":
        SQLModel.metadata.create_all(engine)
        _ensure_registry_schema()
    _registry_refresh_task = asyncio.create_task(_registry_refresh_loop())


@app.on_event("shutdown")
async def on_shutdown():
    if _registry_refresh_task is not None:
        _registry_refresh_task.cancel()


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/amb-metro")
def amb_metro_dashboard():
    return build_amb_metro_payload()


# ─── Incidents helpers ────────────────────────────────────────────────────────

def _fetch_incidencies() -> List[dict]:
    try:
        xml = requests.get(
            "https://www.gencat.cat/transit/opendata/incidenciesGML.xml", timeout=15
        ).text
        return extraer_incidencias(xml)
    except Exception as e:
        print(f"Error fetching incidencies: {e}")
        return []


def _nivel(i: dict) -> int:
    for key in ("nivell", "nivel"):
        try:
            return int(i.get(key, 0))
        except (TypeError, ValueError):
            pass
    return 0


REGISTRY_FIELDS = (
    "identificador",
    "tipus",
    "subtipus",
    "carretera",
    "pk_inici",
    "pk_fi",
    "causa",
    "data",
    "nivell",
    "sentit",
    "descripcio",
    "descripcio_tipus",
    "font",
    "cap_a",
    "comarca",
)


def _registry_source_key(incident: dict) -> str:
    """Prefer SCT's stable incident id, with a deterministic fallback."""
    source_id = incident.get("identificador")
    if source_id not in (None, ""):
        return f"sct:{source_id}"

    identity = "|".join(
        str(incident.get(field, ""))
        for field in (
            "carretera",
            "pk_inici",
            "pk_fi",
            "data",
            "descripcio",
            "sentit",
            "latitud",
            "longitud",
        )
    )
    return "fingerprint:" + hashlib.sha256(identity.encode("utf-8")).hexdigest()


def _registry_values(incident: dict, comarca: Optional[str]) -> dict:
    values = {
        field: incident.get(field)
        for field in REGISTRY_FIELDS
        if field != "comarca"
    }
    values["comarca"] = comarca
    # Keep source values displayable exactly as published, including values
    # that occasionally change type between SCT feed versions.
    return {
        field: None if value in (None, "") else str(value).strip()
        for field, value in values.items()
    }


def _refresh_registry_once() -> int:
    """Persist the current SCT feed and mark disappeared rows inactive."""
    global _registry_last_refresh

    with _registry_refresh_lock:
        response = requests.get(
            INCIDENTS_URL,
            headers={"User-Agent": "racc-mobility-data-hub/1.0"},
            timeout=30,
        )
        response.raise_for_status()
        incidents = extraer_incidencias(response.text)
        comarca_shapes = descarregar_comarques()
        now = datetime.now(timezone.utc)

        incoming = {}
        for incident in incidents:
            comarca = None
            try:
                latitude = float(incident["latitud"])
                longitude = float(incident["longitud"])
                comarca = obtenir_comarca(latitude, longitude, comarca_shapes)
            except (KeyError, TypeError, ValueError):
                pass
            incoming[_registry_source_key(incident)] = (
                incident,
                comarca,
            )

        with Session(engine) as session:
            stored_rows = session.exec(select(IncidentRegistry)).all()
            by_source_key = {row.source_key: row for row in stored_rows}

            for source_key, (incident, comarca) in incoming.items():
                row = by_source_key.get(source_key)
                values = _registry_values(incident, comarca)
                if row is None:
                    row = IncidentRegistry(
                        source_key=source_key,
                        **values,
                        status="Active",
                        first_seen_at=now,
                        last_seen_at=now,
                    )
                    session.add(row)
                else:
                    for field, value in values.items():
                        setattr(row, field, value)
                    row.status = "Active"
                    row.last_seen_at = now
                    session.add(row)

            incoming_keys = set(incoming)
            for row in stored_rows:
                if row.source_key not in incoming_keys:
                    if row.status == "Active":
                        row.status = "Innactiu"
                        row.data_final = now
                        session.add(row)
                    elif row.status == "Innactiu" and row.data_final is None:
                        # Defensive backfill for databases upgraded without
                        # the startup migration or rows created by an older
                        # registry implementation.
                        row.data_final = row.last_seen_at or now
                        session.add(row)

            session.commit()

        _registry_last_refresh = now.timestamp()
        return len(incoming)


async def _registry_refresh_loop():
    """Keep the historical registry synchronized every thirty minutes."""
    await asyncio.sleep(1)
    while True:
        try:
            await asyncio.to_thread(_refresh_registry_once)
        except Exception as error:
            print(f"Registry refresh failed: {error}")
        await asyncio.sleep(REGISTRY_REFRESH_INTERVAL_SECONDS)


def _registry_to_dict(row: IncidentRegistry) -> dict:
    return {
        "id": row.id,
        "status": row.status,
        **{field: getattr(row, field) for field in REGISTRY_FIELDS},
        "data_final": row.data_final.isoformat() if row.data_final else None,
        "first_seen_at": row.first_seen_at.isoformat(),
        "last_seen_at": row.last_seen_at.isoformat(),
    }


def _ensure_registry_fresh(session: Session) -> None:
    """Populate the registry on first use and recover after a restart."""
    has_rows = session.exec(select(IncidentRegistry.id).limit(1)).first() is not None
    now = datetime.now(timezone.utc).timestamp()
    is_stale = (
        _registry_last_refresh == 0
        or now - _registry_last_refresh >= REGISTRY_REFRESH_INTERVAL_SECONDS
    )
    if not has_rows or is_stale:
        _refresh_registry_once()


def _normalize_road(value: object) -> str:
    return " ".join(str(value or "").split()).casefold()


def _parse_registry_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    text_value = str(value).strip()
    parsed: Optional[datetime] = None
    try:
        parsed = datetime.fromisoformat(text_value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text_value)
        except (TypeError, ValueError, OverflowError):
            return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=REGISTRY_REPORT_TIMEZONE)
    return parsed.astimezone(REGISTRY_REPORT_TIMEZONE)


def _road_ratio_rows(session: Session) -> list[dict]:
    """Calculate road-wide month-to-date shares for up to two chart rows per road."""
    try:
        chart = json.loads(AFORAMENTS_CHART_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail=f"No s'han pogut carregar les carreteres de referència: {error}",
        ) from error

    reference_rows: list[dict] = []
    rows_per_road: dict[str, int] = {}
    for point in chart.get("aforaments", []):
        road = str(point.get("carretera") or "").strip()
        normalized_road = _normalize_road(road)
        if not road or rows_per_road.get(normalized_road, 0) >= ROAD_RATIO_MAX_ROWS_PER_ROAD:
            continue
        rows_per_road[normalized_road] = rows_per_road.get(normalized_road, 0) + 1
        reference_rows.append(
            {
                "chart_row": point.get("chart_row"),
                "carretera": road,
                "pk_km": point.get("pk_km"),
                "imd": point.get("imd"),
            }
        )

    now = datetime.now(REGISTRY_REPORT_TIMEZONE)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    counts = {
        _normalize_road(reference_row["carretera"]): {"accidents": 0, "total": 0}
        for reference_row in reference_rows
    }

    for row in session.exec(select(IncidentRegistry)).all():
        road_key = _normalize_road(row.carretera)
        if road_key not in counts:
            continue
        incident_datetime = _parse_registry_datetime(row.data)
        if incident_datetime is None or not (month_start <= incident_datetime <= now):
            continue

        counts[road_key]["total"] += 1
        if _normalize_road(row.causa) == "accident":
            counts[road_key]["accidents"] += 1

    result = []
    for reference_row in reference_rows:
        count = counts[_normalize_road(reference_row["carretera"])]
        total_count = count["total"]
        accident_count = count["accidents"]
        ratio = accident_count / total_count if total_count else None
        result.append(
            {
                **reference_row,
                "accident_count": accident_count,
                "total_count": total_count,
                "accident_ratio": round(ratio, 4) if ratio is not None else None,
                "accident_ratio_pct": round(ratio * 100, 2) if ratio is not None else None,
                "message": None if total_count else NO_MONTH_INCIDENTS_MESSAGE,
            }
        )

    return {
        "rows": result,
        "month_start": month_start.date().isoformat(),
        "as_of": now.isoformat(),
        "timezone": "Europe/Madrid",
    }


# ─── Incident endpoints ───────────────────────────────────────────────────────

@app.get("/api/incidencies/raw")
def api_raw():
    return {"incidencies": _fetch_incidencies()}


@app.get("/api/incidencies/summary")
def api_summary():
    incs = _fetch_incidencies()
    total = len(incs)
    greus = sum(1 for i in incs if _nivel(i) >= 3)
    pct = round(greus / total * 100, 2) if total else 0

    road_counts: dict = {}
    for i in incs:
        r = i.get("carretera")
        if r:
            road_counts[r] = road_counts.get(r, 0) + 1
    via_mes = None
    if road_counts:
        best = max(road_counts.items(), key=lambda x: x[1])
        via_mes = {"carretera": best[0], "incidents": best[1]}

    return {"total_incidents": total, "percent_greus": pct, "via_mes_afectada": via_mes}


@app.get("/api/aforaments")
def api_aforaments():
    """Return the road/PK points and IMD values from the uploaded chart."""
    now = time.time()
    with _aforaments_cache_lock:
        if (
            _aforaments_cache["payload"] is not None
            and now < _aforaments_cache["expires_at"]
        ):
            return _aforaments_cache["payload"]

    try:
        chart = json.loads(AFORAMENTS_CHART_PATH.read_text(encoding="utf-8"))
        aforaments = chart.get("aforaments")
        if not isinstance(aforaments, list):
            raise ValueError("El fitxer de llista no conté una col·lecció d'aforaments")
        payload = {
            "aforaments": aforaments,
            "source": chart.get("source_file", "Llista de carreteres (IMD)"),
            "source_label": chart.get("source_label", "Llista de carreteres (IMD)"),
            "record_count": len(aforaments),
        }
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail=f"No s'han pogut carregar les dades del gràfic d'aforament: {error}",
        ) from error

    with _aforaments_cache_lock:
        _aforaments_cache["payload"] = payload
        _aforaments_cache["expires_at"] = now + AFORAMENTS_CACHE_TTL_SECONDS
    return payload


@app.get("/api/incidencies/by_tipo")
def api_by_tipo():
    incs = _fetch_incidencies()
    tipos: dict = {}
    for i in incs:
        t = str(i.get("descripcio_tipus") or i.get("tipus") or "Desconegut")
        tipos[t] = tipos.get(t, 0) + 1
    return {"by_tipo": tipos}


@app.get("/api/incidencies/by_nivel")
def api_by_nivel():
    incs = _fetch_incidencies()
    niveles: dict = {}
    for i in incs:
        n = str(_nivel(i))
        niveles[n] = niveles.get(n, 0) + 1
    return {"by_nivel": niveles}


@app.get("/api/incidencies/ranking_trams")
def api_ranking():
    incs = _fetch_incidencies()
    trams: dict = {}
    for i in incs:
        road = i.get("carretera")
        if not road:
            continue
        if road not in trams:
            trams[road] = {"carretera": road, "incidents": 0, "max_nivel": 0, "tipo_principal": None}
        trams[road]["incidents"] += 1
        n = _nivel(i)
        if n > trams[road]["max_nivel"]:
            trams[road]["max_nivel"] = n
        tipo = i.get("descripcio_tipus") or i.get("tipus")
        if tipo and not trams[road]["tipo_principal"]:
            trams[road]["tipo_principal"] = str(tipo)
    ranked = sorted(trams.values(), key=lambda x: x["incidents"], reverse=True)
    return {"ranking": ranked[:20]}


@app.delete("/api/registre/inactives")
def api_delete_inactive_registry(session: Session = Depends(get_session)):
    """Permanently delete only inactive incidents from the persistent registry."""
    _ensure_registry_fresh(session)
    inactive_rows = session.exec(
        select(IncidentRegistry).where(IncidentRegistry.status == "Innactiu")
    ).all()
    deleted_count = len(inactive_rows)
    for row in inactive_rows:
        session.delete(row)
    session.commit()
    return {"deleted_count": deleted_count}


@app.get("/api/registre")
def api_registre(
    status: Optional[str] = None,
    search: Optional[str] = None,
    session: Session = Depends(get_session),
):
    _ensure_registry_fresh(session)

    statement = select(IncidentRegistry).order_by(IncidentRegistry.id)
    normalized_status = (status or "").lower()
    if normalized_status == "active":
        statement = statement.where(IncidentRegistry.status == "Active")
    elif normalized_status in {"innactiu", "inactiu"}:
        statement = statement.where(IncidentRegistry.status == "Innactiu")

    rows = session.exec(statement).all()
    if search:
        needle = search.casefold()
        rows = [
            row
            for row in rows
            if needle in " ".join(
                str(getattr(row, field) or "") for field in REGISTRY_FIELDS
            ).casefold()
        ]

    active_count = sum(row.status == "Active" for row in rows)
    inactive_count = sum(row.status == "Innactiu" for row in rows)
    last_refresh = _registry_last_refresh
    if last_refresh == 0 and rows:
        last_refresh = max(row.last_seen_at.timestamp() for row in rows)

    road_ratios = _road_ratio_rows(session)
    return {
        "rows": [_registry_to_dict(row) for row in rows],
        "active_count": active_count,
        "inactive_count": inactive_count,
        "total_count": len(rows),
        "last_refresh": (
            datetime.fromtimestamp(last_refresh, timezone.utc).isoformat()
            if last_refresh
            else None
        ),
        "refresh_interval_minutes": 30,
        "road_ratios": road_ratios["rows"],
        "road_ratio_month_start": road_ratios["month_start"],
        "road_ratio_as_of": road_ratios["as_of"],
        "road_ratio_timezone": road_ratios["timezone"],
    }


def _build_probability_payload() -> dict:
    """Run the uploaded unified pipeline once and shape it for the UI."""
    precipitation, weather_date, month_start = descarregar_precipitacio()
    comarca_shapes = descarregar_comarques()
    incidents_by_comarca, without_coordinates, outside_comarca = (
        comptar_incidencies_temps_real(comarca_shapes)
    )
    rows = construir_resultats(precipitation, incidents_by_comarca)

    available_rows = [row for row in rows if row["probabilitat_nou_accident_pct"] is not None]
    highest_probability = max(
        available_rows,
        key=lambda row: row["probabilitat_nou_accident_pct"],
        default=None,
    )
    highest_incidents = max(
        rows,
        key=lambda row: row["incidencies_temps_real"],
        default=None,
    )
    average_probability = (
        round(
            sum(row["probabilitat_nou_accident_pct"] for row in available_rows)
            / len(available_rows),
            2,
        )
        if available_rows
        else None
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "weather_date": weather_date,
        "month_start": month_start,
        "weather_delay_days": DIES_RETARD_METEO,
        "sources": {
            "precipitation": PRECIPITACIO_URL,
            "comarques": COMARQUES_URL,
            "incidents": INCIDENTS_URL,
        },
        "quality": {
            "without_coordinates": without_coordinates,
            "outside_comarca": outside_comarca,
            "comarques_with_weather": sum(
                1 for row in rows if row["precipitacio_disponible"]
            ),
            "total_comarques": len(rows),
        },
        "summary": {
            "average_probability_pct": average_probability,
            "highest_probability": highest_probability,
            "highest_incidents": highest_incidents,
            "total_live_incidents": sum(
                row["incidencies_temps_real"] for row in rows
            ),
        },
        "results": rows,
    }


@app.get("/api/probabilitat-accidents")
def api_probabilitat_accidents():
    """
    Returns one probability dashboard dataset per comarca.

    The first request runs the uploaded precipitation + boundaries + SCT
    pipeline. Subsequent requests reuse the same live snapshot for ten minutes
    so navigating, refreshing, or opening the iframe remains responsive.
    """
    now = datetime.now(timezone.utc).timestamp()
    with _probability_cache_lock:
        if (
            _probability_cache["payload"] is not None
            and _probability_cache["expires_at"] > now
        ):
            return _probability_cache["payload"]

    try:
        payload = _build_probability_payload()
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"No s'han pogut actualitzar les dades de probabilitat: {error}",
        ) from error

    with _probability_cache_lock:
        _probability_cache["payload"] = payload
        _probability_cache["expires_at"] = now + PROBABILITY_CACHE_TTL_SECONDS
    return payload


@app.get("/api/incidencias")
def obtener_incidencias():
    return {"incidencias": _fetch_incidencies()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
