#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Obtenir la latitud i la longitud d'un punt quilomètric.

Exemples:
    python geocodificar_punto.py C-58 10.5
    python geocodificar_punto.py C-58 10+500
    python geocodificar_punto.py "N-340" "PK 1.250" --json

El programa consulta primer l'ICGC. Si no troba el punt, prova la DGT.
"""

import argparse
import json
import re
import time
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TIMEOUT = 30
RETRIES = 3
RETRY_DELAY_SECONDS = 2
USER_AGENT = "replit-geocodificacio-pk/1.0"

ICGC_ENDPOINT = "https://eines.icgc.cat/geocodificador/autocompletar"
DGT_ENDPOINT = (
    "https://gis.dgt.es/server/rest/services/"
    "Geoprocesos/PKaXYcgt/GPServer/PKaXY_CGT"
)


def parse_pk(value: Any) -> float:
    """Converteix 10.5, 10,5, 10+500 o 'PK 10.5' a quilòmetres."""
    text = str(value).strip().replace(",", ".")
    text = re.sub(
        r"^(PK|P\.K\.|PUNTO KILOM[ÉE]TRICO)\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    match = re.fullmatch(r"(\d+(?:\.\d+)?)\+(\d{1,3})", text)
    if match:
        return float(match.group(1)) + float(match.group(2)) / 1000

    try:
        pk = float(text)
    except ValueError as exc:
        raise ValueError(
            f"Punto kilométrico no válido: {value!r}. "
            "Usa, por ejemplo, 10.5 o 10+500."
        ) from exc

    if pk < 0:
        raise ValueError("El punto kilométrico no puede ser negativo.")

    return pk


def format_pk(pk: float) -> str:
    """Format compatible amb la consulta de l'ICGC i la DGT."""
    return f"{pk:.3f}".rstrip("0").rstrip(".")


def get_json(
    url: str,
    params: Optional[Dict[str, str]] = None,
) -> Any:
    if params:
        url = f"{url}?{urlencode(params)}"

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )

    last_error: Optional[Exception] = None
    for attempt in range(RETRIES):
        try:
            with urlopen(request, timeout=TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504}:
                raise
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc

        if attempt < RETRIES - 1:
            time.sleep(RETRY_DELAY_SECONDS * (attempt + 1))

    raise RuntimeError(f"No se pudo consultar el servicio: {last_error}")


def coordinates_from_icgc(data: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """Retorna (latitud, longitud) a partir d'una resposta GeoJSON de l'ICGC."""
    features = data.get("features", [])
    if not isinstance(features, list) or not features:
        return None

    geometry = features[0].get("geometry", {})
    coordinates = geometry.get("coordinates", [])
    if not isinstance(coordinates, (list, tuple)) or len(coordinates) < 2:
        return None

    try:
        longitude = float(coordinates[0])
        latitude = float(coordinates[1])
    except (TypeError, ValueError):
        return None

    return latitude, longitude


def coordinates_from_dgt(data: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """Extreu (latitud, longitud) del text de localització de la DGT."""
    values = data.get("results", [])
    texts = []

    if isinstance(values, list):
        for result in values:
            if not isinstance(result, dict):
                continue
            value = result.get("value")
            if isinstance(value, str):
                texts.append(value)
            elif isinstance(value, dict):
                for key in ("localizacion", "localización"):
                    if value.get(key):
                        texts.append(str(value[key]))

    for key in ("localizacion", "localización"):
        if data.get(key):
            texts.append(str(data[key]))

    for text in texts:
        xy = re.search(
            r"x\s*=\s*([-+]?\d+(?:[.,]\d+)?)"
            r".*?y\s*=\s*([-+]?\d+(?:[.,]\d+)?)",
            text,
            flags=re.IGNORECASE,
        )
        if xy:
            longitude = float(xy.group(1).replace(",", "."))
            latitude = float(xy.group(2).replace(",", "."))
            return latitude, longitude

        numbers = [
            float(number.replace(",", "."))
            for number in re.findall(r"[-+]?\d+(?:[.,]\d+)?", text)
        ]
        for first, second in zip(numbers, numbers[1:]):
            if -10 <= first <= 10 and 35 <= second <= 45:
                return second, first
            if 35 <= first <= 45 and -10 <= second <= 10:
                return first, second

    return None


def geocode(carretera: str, pk_value: Any) -> Dict[str, Any]:
    """
    Geocodifica una carretera y un PK.

    Retorna un diccionario con carretera, PK, latitud, longitud y fuente.
    """
    carretera = str(carretera).strip()
    if not carretera:
        raise ValueError("La carretera no puede estar vacía.")

    pk = parse_pk(pk_value)
    pk_text = format_pk(pk)

    icgc_data = get_json(
        ICGC_ENDPOINT,
        {
            "text": f"{carretera} {pk_text}",
            "size": "1",
            "layers": "pk",
        },
    )
    coordinates = coordinates_from_icgc(icgc_data)
    if coordinates:
        latitude, longitude = coordinates
        return {
            "carretera": carretera,
            "pk_km": pk,
            "latitud": latitude,
            "longitud": longitude,
            "fuente": "ICGC",
        }

    time.sleep(0.4)
    dgt_data = get_json(
        f"{DGT_ENDPOINT}/execute",
        {
            "Carretera": carretera,
            "Km": pk_text,
            "f": "json",
        },
    )
    coordinates = coordinates_from_dgt(dgt_data)
    if coordinates:
        latitude, longitude = coordinates
        return {
            "carretera": carretera,
            "pk_km": pk,
            "latitud": latitude,
            "longitud": longitude,
            "fuente": "DGT",
        }

    raise LookupError(
        f"No se encontraron coordenadas para {carretera} PK {pk_text}."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Obtén latitud y longitud a partir de carretera y PK."
    )
    parser.add_argument(
        "carretera",
        nargs="?",
        help="Identificador de la carretera, por ejemplo C-58",
    )
    parser.add_argument(
        "pk",
        nargs="?",
        help="Punto kilométrico, por ejemplo 10.5 o 10+500",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Muestra el resultado como JSON.",
    )
    args = parser.parse_args()

    carretera = args.carretera or input("Carretera: ").strip()
    pk = args.pk or input("Punto kilométrico: ").strip()

    try:
        result = geocode(carretera, pk)
    except (LookupError, ValueError, RuntimeError, HTTPError, URLError) as exc:
        parser.error(str(exc))

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Carretera: {result['carretera']}")
        print(f"PK:         {result['pk_km']:.3f} km")
        print(f"Latitud:    {result['latitud']:.8f}")
        print(f"Longitud:   {result['longitud']:.8f}")
        print(f"Fuente:     {result['fuente']}")


if __name__ == "__main__":
    main()