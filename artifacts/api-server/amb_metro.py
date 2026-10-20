"""Safe adapter for the supplied TMB metro-arrivals script."""

import ast
from datetime import datetime, timezone
from functools import lru_cache
import os
from pathlib import Path
import threading
import time
from typing import Any
from zoneinfo import ZoneInfo

import requests
from fastapi import HTTPException


TMB_ENDPOINT = "https://api.tmb.cat/v1/itransit/metro/estacions"
STATION_SOURCE = (
    Path(__file__).resolve().parents[2]
    / "attached_assets"
    / "Consultador__parades_metro_1790848799882.py"
)
REPORTING_TIMEZONE = ZoneInfo("Europe/Madrid")
CACHE_TTL_SECONDS = 45

LINE_COLORS = {
    "L1": "#D71920",
    "L2": "#8A3AB9",
    "L3": "#17833B",
    "L4": "#E5B700",
    "L5": "#1565C0",
    "L9N": "#F47721",
    "L9S": "#F47721",
    "L10N": "#53B9D5",
    "L10S": "#53B9D5",
    "L11": "#8CC63E",
}

_cache_lock = threading.Lock()
_cache_expires_at = 0.0
_cache_payload: dict[str, Any] | None = None


@lru_cache(maxsize=1)
def _station_definitions() -> dict[str, list[tuple[int, str]]]:
    """Read only the station dictionary; never execute the uploaded script."""
    if not STATION_SOURCE.is_file():
        raise RuntimeError("The uploaded AMB-Metro station list is missing.")

    tree = ast.parse(STATION_SOURCE.read_text(encoding="utf-8"), filename=str(STATION_SOURCE))
    for statement in tree.body:
        if not isinstance(statement, ast.Assign):
            continue
        if not any(
            isinstance(target, ast.Name) and target.id == "metro_barcelona"
            for target in statement.targets
        ):
            continue

        raw_stations = ast.literal_eval(statement.value)
        if not isinstance(raw_stations, dict):
            break

        stations: dict[str, list[tuple[int, str]]] = {}
        for line_id, stops in raw_stations.items():
            if not isinstance(line_id, str) or not isinstance(stops, (list, tuple)):
                continue
            line_stops: list[tuple[int, str]] = []
            for stop in stops:
                if (
                    isinstance(stop, (list, tuple))
                    and len(stop) == 2
                    and isinstance(stop[0], int)
                    and isinstance(stop[1], str)
                ):
                    line_stops.append((stop[0], stop[1]))
            stations[line_id] = line_stops
        if stations:
            return stations
        break

    raise RuntimeError("The uploaded AMB-Metro station list could not be parsed.")


def _timestamp_iso(timestamp_ms: int | None) -> str | None:
    if timestamp_ms is None:
        return None
    try:
        return datetime.fromtimestamp(
            timestamp_ms / 1000,
            tz=timezone.utc,
        ).astimezone(REPORTING_TIMEZONE).isoformat(timespec="seconds")
    except (OverflowError, OSError, ValueError):
        return None


def _integer(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _build_payload(feed: dict[str, Any] | None) -> dict[str, Any]:
    definitions = _station_definitions()
    now = datetime.now(REPORTING_TIMEZONE).isoformat(timespec="seconds")
    if feed is None:
        lines = [
            {
                "id": line_id,
                "color": LINE_COLORS.get(line_id, "#64748B"),
                "station_count": len(stops),
                "stations": [
                    {
                        "id": station_id,
                        "name": station_name,
                        "found": False,
                        "details": {},
                        "destinations": [],
                    }
                    for station_id, station_name in stops
                ],
            }
            for line_id, stops in definitions.items()
        ]
        station_count = sum(line["station_count"] for line in lines)
        return {
            "status": "credentials_missing",
            "message": "Configura TMB_APP_ID i TMB_APP_KEY com a secrets per activar les arribades en directe.",
            "api_timestamp": None,
            "fetched_at": now,
            "summary": {
                "line_count": len(lines),
                "station_count": station_count,
                "stations_found": 0,
                "trains_count": 0,
                "arrivals_next_5_minutes": 0,
            },
            "lines": lines,
        }

    reference_ms = _integer(feed.get("timestamp"))
    if reference_ms is None:
        reference_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    stations_by_id: dict[int, dict[str, Any]] = {}
    raw_lines = feed.get("linies")
    if isinstance(raw_lines, list):
        for raw_line in raw_lines:
            if not isinstance(raw_line, dict):
                continue
            raw_stations = raw_line.get("estacions")
            if not isinstance(raw_stations, list):
                continue
            for raw_station in raw_stations:
                if not isinstance(raw_station, dict):
                    continue
                station_id = _integer(raw_station.get("codi_estacio"))
                if station_id is not None:
                    stations_by_id[station_id] = raw_station

    lines = []
    stations_found = 0
    trains_count = 0
    arrivals_next_5_minutes = 0

    for line_id, stops in definitions.items():
        line_stations = []
        for station_id, listed_name in stops:
            raw_station = stations_by_id.get(station_id)
            destinations = []
            details: dict[str, Any] = {}

            if raw_station is not None:
                stations_found += 1
                api_name = raw_station.get("nom_estacio")
                if isinstance(api_name, str) and api_name.strip():
                    listed_name = api_name.strip()
                details = {
                    key: value
                    for key, value in raw_station.items()
                    if key != "linies_trajectes"
                    and key not in ("codi_estacio", "nom_estacio")
                    and value not in (None, "")
                }

                raw_trips = raw_station.get("linies_trajectes")
                if isinstance(raw_trips, list):
                    for raw_trip in raw_trips:
                        if not isinstance(raw_trip, dict):
                            continue
                        destination = raw_trip.get(
                            "desti_trajecte",
                            "Destinació desconeguda",
                        )
                        raw_trains = raw_trip.get("propers_trens")
                        if not isinstance(raw_trains, list):
                            continue

                        trains = []
                        for raw_train in raw_trains:
                            if not isinstance(raw_train, dict):
                                continue
                            arrival_ms = _integer(raw_train.get("temps_arribada"))
                            if arrival_ms is None:
                                continue
                            seconds_remaining = max(
                                0,
                                (arrival_ms - reference_ms) // 1000,
                            )
                            arrival_at = _timestamp_iso(arrival_ms)
                            if arrival_at is None:
                                continue
                            trains.append(
                                {
                                    "arrival_at": arrival_at,
                                    "seconds_remaining": seconds_remaining,
                                    "minutes_remaining": seconds_remaining // 60,
                                }
                            )

                        trains.sort(key=lambda train: train["seconds_remaining"])
                        if trains:
                            trains_count += len(trains)
                            arrivals_next_5_minutes += sum(
                                train["seconds_remaining"] <= 300 for train in trains
                            )
                            destinations.append(
                                {
                                    "name": (
                                        destination
                                        if isinstance(destination, str) and destination.strip()
                                        else "Destinació desconeguda"
                                    ),
                                    "trains": trains,
                                }
                            )

            line_stations.append(
                {
                    "id": station_id,
                    "name": listed_name,
                    "found": raw_station is not None,
                    "details": details,
                    "destinations": destinations,
                }
            )

        lines.append(
            {
                "id": line_id,
                "color": LINE_COLORS.get(line_id, "#64748B"),
                "station_count": len(line_stations),
                "stations": line_stations,
            }
        )

    return {
        "status": "ok",
        "message": None,
        "api_timestamp": _timestamp_iso(reference_ms),
        "fetched_at": now,
        "summary": {
            "line_count": len(lines),
            "station_count": sum(line["station_count"] for line in lines),
            "stations_found": stations_found,
            "trains_count": trains_count,
            "arrivals_next_5_minutes": arrivals_next_5_minutes,
        },
        "lines": lines,
    }


def _fetch_feed() -> dict[str, Any] | None:
    app_id = os.getenv("TMB_APP_ID", "").strip()
    app_key = os.getenv("TMB_APP_KEY", "").strip()
    if not app_id or not app_key:
        return None

    try:
        response = requests.get(
            TMB_ENDPOINT,
            params={"app_id": app_id, "app_key": app_key},
            timeout=15,
        )
        response.raise_for_status()
    except requests.Timeout:
        raise HTTPException(
            status_code=504,
            detail="El servei de TMB no ha respost a temps.",
        ) from None
    except requests.RequestException:
        raise HTTPException(
            status_code=502,
            detail="No s'han pogut consultar les dades en directe de TMB.",
        ) from None

    try:
        feed = response.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="El servei de TMB ha retornat una resposta no vàlida.",
        ) from None
    if not isinstance(feed, dict):
        raise HTTPException(
            status_code=502,
            detail="El servei de TMB ha retornat una resposta no vàlida.",
        )
    return feed


def build_amb_metro_payload() -> dict[str, Any]:
    global _cache_expires_at, _cache_payload

    with _cache_lock:
        if _cache_payload is not None and time.monotonic() < _cache_expires_at:
            return _cache_payload

        feed = _fetch_feed()
        payload = _build_payload(feed)
        if feed is not None:
            _cache_payload = payload
            _cache_expires_at = time.monotonic() + CACHE_TTL_SECONDS
        return payload