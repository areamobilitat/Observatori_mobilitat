"""
Uneix:
  1) la precipitació acumulada de les estacions meteorològiques,
  2) les línies de tendència d'accidents per comarca, i
  3) les incidències viàries actuals.

Resultat: una fila per comarca amb:
  - precipitació mitjana acumulada del mes,
  - accidents previstos,
  - incidències actives en temps real.

El script només utilitza la biblioteca estàndard de Python, de manera que es
pot executar directament en un Replit sense instal·lar geopandas.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from json import loads
from math import exp
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree


# ============================================================
# CONFIGURACIÓ
# ============================================================

INCIDENTS_URL = "https://www.gencat.cat/transit/opendata/incidenciesGML.xml"

COMARQUES_URL = (
    "https://geoserveis.icgc.cat/vector01/rest/services/"
    "divisions_administratives_wfs/MapServer/8/query"
    "?where=1%3D1&outFields=*&f=geojson"
)

PRECIPITACIO_URL = (
    "https://analisi.transparenciacatalunya.cat/resource/"
    "7bvh-jvq2.json"
)

# La font meteorològica pot publicar les dades amb retard.
DIES_RETARD_METEO = 2
TIMEOUT = 30


# ============================================================
# RELACIÓ ENTRE ESTACIONS I COMARQUES
# ============================================================

ESTACIONS_COMARCA: Dict[str, str] = {
    "Núria": "Ripollès",
    "Castellnou de Seana": "Pla d'Urgell",
    "Tàrrega": "Urgell",
    "Cervera": "Segarra",
    "Mas de Barberans": "Montsià",
    "Orís": "Osona",
    "la Seu d'Urgell - Bellestar": "Alt Urgell",
    "els Hostalets de Pierola": "Anoia",
    "Molló - Fabert": "Ripollès",
    "Sant Pau de Segúries": "Ripollès",
    "Organyà": "Alt Urgell",
    "Sant Salvador de Guardiola": "Bages",
    "Sant Romà d'Abella": "Pallars Jussà",
    "Vilanova de Meià": "Noguera",
    "la Quar": "Berguedà",
    "el Pont de Suert": "Alta Ribagorça",
    "l'Espluga de Francolí": "Conca de Barberà",
    "Muntanyola": "Osona",
    "Margalef": "Priorat",
    "Vacarisses": "Vallès Occidental",
    "Vallirana": "Baix Llobregat",
    "Roses": "Alt Empordà",
    "Barcelona - Observatori Fabra": "Barcelonès",
    "Portbou - coll dels Belitres": "Alt Empordà",
    "Vinebre": "Ribera d'Ebre",
    "Horta de Sant Joan": "Terra Alta",
    "el Vendrell": "Baix Penedès",
    "el Perelló": "Baix Ebre",
    "la Bisbal d'Empordà": "Baix Empordà",
    "Font-rubí": "Alt Penedès",
    "Banyoles": "Pla de l'Estany",
    "Torredembarra": "Tarragonès",
    "Illa de Buda": "Montsià",
    "Anglès": "Selva",
    "Castell d'Aro": "Baix Empordà",
    "Das - Aeròdrom": "Cerdanya",
    "Vila-rodona": "Alt Camp",
    "Òdena": "Anoia",
    "Pantà de Darnius - Boadella": "Alt Empordà",
    "Pantà de Sau": "Osona",
    "Fogars de la Selva": "Selva",
    "la Roca del Vallès - ETAP Cardedeu": "Vallès Oriental",
    "Sant Joan de les Abadesses": "Ripollès",
    "Cardona": "Bages",
    "Pantà de Siurana": "Priorat",
    "Castellar de n'Hug - el Clot del Moro": "Berguedà",
    "Guixers - Valls": "Solsonès",
    "Navès": "Solsonès",
    "Sant Pere Pescador": "Alt Empordà",
    "Sant Martí Sarroca": "Alt Penedès",
    "Castellnou de Bages": "Bages",
    "Vinyols i els Arcs - Cambrils": "Baix Camp",
    "Aldover": "Baix Ebre",
    "l'Aldea": "Baix Ebre",
    "l'Ametlla de Mar": "Baix Ebre",
    "la Tallada d'Empordà": "Baix Empordà",
    "Torroella de Montgrí": "Baix Empordà",
    "PN del Garraf - el Rascler": "Garraf",
    "el Montmell": "Baix Penedès",
    "Gisclareny": "Berguedà",
    "Santa Coloma de Queralt": "Conca de Barberà",
    "Sant Pere de Ribes - PN del Garraf": "Garraf",
    "la Granadella": "Garrigues",
    "Cassà de la Selva": "Gironès",
    "Fornells de la Selva": "Gironès",
    "Cabrils": "Maresme",
    "Dosrius - PN Montnegre Corredor": "Maresme",
    "les Cases d'Alcanar": "Montsià",
    "Amposta": "Montsià",
    "els Alfacs": "Montsià",
    "Ulldecona - els Valentins": "Montsià",
    "Os de Balaguer - el Monestir d'Avellanes": "Noguera",
    "Vallfogona de Balaguer": "Noguera",
    "Montesquiu": "Osona",
    "Perafita": "Lluçanès",
    "el Poal": "Pla d'Urgell",
    "Ascó": "Ribera d'Ebre",
    "Benissanet": "Ribera d'Ebre",
    "Pantà de Riba-roja": "Ribera d'Ebre",
    "el Canós": "Segarra",
    "Gimenells": "Segrià",
    "Raimat": "Segrià",
    "Vilanova de Segrià": "Segrià",
    "Lladurs": "Solsonès",
    "Pinós": "Solsonès",
    "Constantí": "Tarragonès",
    "Lac Redon (2.245 m)": "Val d'Aran",
    "Rellinars": "Vallès Occidental",
    "Sant Llorenç Savall": "Vallès Occidental",
    "Tagamanent - PN del Montseny": "Vallès Oriental",
    "Nulles": "Alt Camp",
    "Espolla": "Alt Empordà",
    "Castelló d'Empúries": "Alt Empordà",
    "Vilafranca del Penedès - la Granada": "Alt Penedès",
    "Oliana": "Alt Urgell",
    "Blancafort": "Conca de Barberà",
    "la Vall d'en Bas": "Garrotxa",
    "Oliola": "Noguera",
    "Albesa": "Noguera",
    "Golmés": "Pla d'Urgell",
    "Algerri": "Noguera",
    "Maials": "Segrià",
    "el Masroig": "Priorat",
    "Alfarràs": "Segrià",
    "Sant Martí de Riucorb": "Urgell",
    "Santuari de Queralt": "Berguedà",
    "Montserrat - Sant Dimes": "Bages",
    "la Bisbal del Penedès": "Baix Penedès",
    "Canaletes": "Terra Alta",
    "Montsec d'Ares (1.571 m)": "Pallars Jussà",
    "Torroja del Priorat": "Priorat",
    "Viladrau": "Osona",
    "Malgrat de Mar": "Maresme",
    "Badalona - Museu": "Barcelonès",
    "Guardiola de Berguedà": "Berguedà",
    "Artés": "Bages",
    "Camarasa": "Noguera",
    "Cunit": "Baix Penedès",
    "Falset": "Priorat",
    "Alguaire": "Segrià",
    "Barcelona - el Raval": "Barcelonès",
    "PN dels Ports": "Baix Ebre",
    "Baldomar": "Noguera",
    "Torres de Segre": "Segrià",
    "Barcelona - Zona Universitària": "Barcelonès",
    "Caldes de Montbui": "Vallès Oriental",
    "la Panadella": "Anoia",
    "la Llacuna": "Anoia",
    "Castellbisbal": "Vallès Occidental",
    "Ulldemolins": "Priorat",
    "Tarragona - Complex Educatiu": "Tarragonès",
    "Sabadell - Parc Agrari": "Vallès Occidental",
    "Parets del Vallès": "Vallès Oriental",
    "Sort": "Pallars Sobirà",
    "Mollerussa": "Pla d'Urgell",
    "Girona": "Gironès",
    "Puig Sesolles (1.666 m)": "Vallès Oriental",
    "el Prat de Llobregat": "Baix Llobregat",
    "els Alamús": "Segrià",
    "Seròs": "Segrià",
    "Vic": "Osona",
    "Gandesa": "Terra Alta",
    "Tremp": "Pallars Jussà",
    "Prades": "Baix Camp",
    "Santa Coloma de Farners": "Selva",
    "Solsona": "Solsonès",
    "Canyelles": "Garraf",
    "Sant Cugat del Vallès - CAR": "Vallès Occidental",
    "Anglesola - Tornabous": "Urgell",
    "Alcarràs": "Segrià",
    "Alinyà": "Alt Urgell",
    "Navata": "Alt Empordà",
    "Tivissa": "Ribera d'Ebre",
    "Puigcerdà": "Cerdanya",
    "Olot": "Garrotxa",
    "la Pobla de Segur": "Pallars Jussà",
    "les Borges Blanques": "Garrigues",
    "Massoteres": "Segarra",
    "Miami Platja": "Baix Camp",
    "Tírvia": "Pallars Sobirà",
    "Pujalt": "Anoia",
    "Lleida - la Femosa": "Segrià",
    "Terrassa": "Vallès Occidental",
    "Riudecanyes": "Baix Camp",
    "Granollers": "Vallès Oriental",
    "Vielha - Elipòrt": "Val d'Aran",
    "Sant Sadurní d'Anoia": "Alt Penedès",
    "Palafrugell": "Baix Empordà",
    "Port de Barcelona - ZAL Prat": "Baix Llobregat",
    "Vilanova i la Geltrú": "Garraf",
    "Cabanes": "Alt Empordà",
    "Bonabé (1.691 m)": "Pallars Sobirà",
    "Cantonigròs": "Osona",
    "Mataró": "Maresme",
    "Batea": "Terra Alta",
    "Viladecans - les Filipines": "Baix Llobregat",
    "Bonaigua (2.262 m)": "Pallars Sobirà",
    "Boí (2.537 m)": "Alta Ribagorça",
    "Malniu (2.229 m)": "Cerdanya",
    "Certascan (2.398 m)": "Pallars Sobirà",
    "Sasseuva (2.226 m)": "Val d'Aran",
    "Espot (2.519 m)": "Pallars Sobirà",
    "Cadí Nord (2.145 m) - Prat d'Aguiló": "Cerdanya",
    "Salòria (2.451 m)": "Alt Urgell",
    "Ulldeter (2.413 m)": "Ripollès",
    "el Port del Comte (2.288 m)": "Solsonès",
}


# ============================================================
# LÍNIES DE TENDÈNCIA: accidents = a * pluja + b
# ============================================================

TENDENCIES_COMARCA: Dict[str, Tuple[float, float]] = {
    "Alt Camp": (-0.00912, 1.569),
    "Alt Empordà": (0.04819, 2.606),
    "Alt Penedès": (-0.02641, 3.522),
    "Alt Urgell": (0.02259, 0.532),
    "Alta Ribagorça": (0.00166, -0.026),
    "Anoia": (0.02486, 3.136),
    "Val d'Aran": (0.00300, 0.287),
    "Bages": (-0.01394, 5.108),
    "Baix Camp": (0.00379, 4.466),
    "Baix Ebre": (-0.00025, 1.925),
    "Baix Empordà": (0.05091, 0.553),
    "Baix Llobregat": (0.00562, 11.525),
    "Baix Penedès": (0.01785, 1.933),
    "Barcelonès": (-0.02541, 28.236),
    "Berguedà": (0.00336, 1.092),
    "Cerdanya": (0.00170, 0.788),
    "Conca de Barberà": (0.02760, 0.290),
    "Garraf": (0.02041, 3.422),
    "Garrigues": (-0.02348, 1.505),
    "Garrotxa": (-0.00946, 1.491),
    "Gironès": (0.02409, 2.530),
    "Maresme": (0.00267, 9.576),
    "Moianès": (-0.00193, 0.829),
    "Montsià": (0.01955, 0.960),
    "Noguera": (-0.01031, 1.799),
    "Osona": (-0.00510, 2.910),
    "Pallars Jussà": (0.01407, -0.003),
    "Pallars Sobirà": (-0.00673, 1.419),
    "Pla d'Urgell": (0.00054, 0.489),
    "Pla de l'Estany": (0.00251, 1.156),
    "Priorat": (0.00797, 0.366),
    "Ribera d'Ebre": (0.00537, 0.396),
    "Ripollès": (0.00163, 0.654),
    "Segarra": (-0.01482, 1.208),
    "Segrià": (0.03386, 4.745),
    "Selva": (-0.01438, 3.764),
    "Solsonès": (-0.00494, 0.720),
    "Tarragonès": (-0.02761, 8.076),
    "Terra Alta": (0.01091, 0.120),
    "Urgell": (-0.00388, 1.175),
    "Vallès Occidental": (-0.01317, 15.657),
    "Vallès Oriental": (-0.06797, 9.615),
}


# L'ICGC pot retornar "Vall d'Aran"; la resta del programa usa "Val d'Aran".
ALIASES_COMARCA = {
    "Vall d'Aran": "Val d'Aran",
}


def normalitzar_comarca(nom: Optional[str]) -> Optional[str]:
    """Unifica petites diferències de nom entre les dues APIs."""
    if not nom:
        return None
    nom = " ".join(str(nom).split())
    return ALIASES_COMARCA.get(nom, nom)


# ============================================================
# PRECIPITACIÓ
# ============================================================

def obtenir_json(url: str, params: Optional[Dict[str, str]] = None) -> Any:
    """Fa una petició GET i descodifica la resposta JSON."""
    if params:
        url = f"{url}?{urlencode(params)}"

    peticio = Request(
        url,
        headers={"User-Agent": "replit-accidents-incidencies/1.0"},
    )
    with urlopen(peticio, timeout=TIMEOUT) as resposta:
        return loads(resposta.read().decode("utf-8"))


def obtenir_bytes(url: str) -> bytes:
    """Fa una petició GET i retorna la resposta en bytes."""
    peticio = Request(
        url,
        headers={"User-Agent": "replit-accidents-incidencies/1.0"},
    )
    with urlopen(peticio, timeout=TIMEOUT) as resposta:
        return resposta.read()


def descarregar_precipitacio() -> Tuple[Dict[str, float], str, str]:
    """
    Retorna:
        precipitació mitjana per comarca,
        data consultada,
        primer dia del mes consultat.

    La mitjana és necessària perquè una comarca pot tenir diverses estacions.
    """
    data_dt = datetime.now() - timedelta(days=DIES_RETARD_METEO)
    data = data_dt.strftime("%Y-%m-%d")
    primer_dia_mes = data_dt.replace(day=1).strftime("%Y-%m-%d")

    dades_mes = obtenir_json(
        PRECIPITACIO_URL,
        params={
            "$select": "codi_estacio, nom_estacio, sum(valor) as acumulat",
            "$where": (
                "codi_variable = '1304' "
                f"AND data_lectura between '{primer_dia_mes}' and '{data}'"
            ),
            "$group": "codi_estacio, nom_estacio",
            "$limit": "5000",
        },
    )

    valors_per_comarca: Dict[str, List[float]] = defaultdict(list)

    for registre in dades_mes:
        try:
            nom_estacio = registre["nom_estacio"]
            comarca = normalitzar_comarca(ESTACIONS_COMARCA.get(nom_estacio))
            acumulat = float(registre["acumulat"])
        except (KeyError, TypeError, ValueError):
            continue

        if comarca:
            valors_per_comarca[comarca].append(acumulat)

    # Una mitjana per comarca evita que una comarca amb més estacions
    # pesi més que una comarca amb una sola estació.
    precipitacio_per_comarca = {
        comarca: sum(valors) / len(valors)
        for comarca, valors in valors_per_comarca.items()
        if valors
    }

    return precipitacio_per_comarca, data, primer_dia_mes


# ============================================================
# INCIDÈNCIES EN TEMPS REAL
# ============================================================

def descarregar_comarques() -> List[Dict[str, Any]]:
    """Descarrega els polígons de les comarques de Catalunya."""
    geojson = obtenir_json(COMARQUES_URL)
    caracteristiques = geojson.get("features", [])

    if not caracteristiques:
        raise ValueError("L'ICGC no ha retornat cap comarca.")

    comarques = []
    for feature in caracteristiques:
        propietats = feature.get("properties") or {}
        nom = propietats.get("NOMCOMAR")

        # Tolerància davant d'un canvi de majúscules al nom del camp.
        if nom is None:
            for clau, valor in propietats.items():
                if str(clau).upper() == "NOMCOMAR":
                    nom = valor
                    break

        if nom is not None and feature.get("geometry"):
            comarques.append(
                {
                    "nom": normalitzar_comarca(str(nom)),
                    "geometry": feature["geometry"],
                }
            )

    if not comarques:
        raise KeyError(
            "La resposta de l'ICGC no conté el camp NOMCOMAR. "
            f"Propietats rebudes: {list(caracteristiques[0].get('properties', {}))}"
        )

    return comarques


def obtenir_coordenades(feature) -> Tuple[Optional[float], Optional[float]]:
    """Extreu latitud i longitud dels formats GML més habituals."""
    for element in feature.iter():
        tipus = str(element.tag).rsplit("}", 1)[-1]
        text = (element.text or "").strip()

        if not text or tipus not in {"coordinates", "pos", "posList"}:
            continue

        try:
            if tipus == "coordinates":
                # Format GML: longitud,latitud
                primer_punt = text.split()[0]
                lon, lat = primer_punt.split(",")[:2]
                return float(lat), float(lon)

            # Formats GML pos / posList: longitud latitud
            parts = text.replace(",", " ").split()
            return float(parts[1]), float(parts[0])
        except (ValueError, IndexError):
            continue

    return None, None


def punt_sobre_segment(
    x: float,
    y: float,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
) -> bool:
    """Comprova si un punt cau sobre el límit d'un segment."""
    tolerancia = 1e-10
    producte_vectorial = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
    if abs(producte_vectorial) > tolerancia:
        return False

    return (
        min(x1, x2) - tolerancia <= x <= max(x1, x2) + tolerancia
        and min(y1, y2) - tolerancia <= y <= max(y1, y2) + tolerancia
    )


def punt_dins_anell(x: float, y: float, anell: List[List[float]]) -> bool:
    """Ray casting amb el límit inclòs (equivalent a covers)."""
    if len(anell) < 3:
        return False

    dins = False
    for index in range(len(anell)):
        x1, y1 = anell[index - 1][:2]
        x2, y2 = anell[index][:2]

        if punt_sobre_segment(x, y, x1, y1, x2, y2):
            return True

        travessa_horitzontal = (y1 > y) != (y2 > y)
        if travessa_horitzontal:
            interseccio_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < interseccio_x:
                dins = not dins

    return dins


def geometria_cobreix(
    geometria: Dict[str, Any],
    lon: float,
    lat: float,
) -> bool:
    """Versió lleugera de covers per a Polygon i MultiPolygon GeoJSON."""
    tipus = geometria.get("type")
    coordenades = geometria.get("coordinates")

    if tipus == "Polygon":
        if not coordenades or not punt_dins_anell(lon, lat, coordenades[0]):
            return False
        # Els anells posteriors són forats del polígon.
        return not any(
            punt_dins_anell(lon, lat, forat)
            for forat in coordenades[1:]
        )

    if tipus == "MultiPolygon":
        return any(
            geometria_cobreix(
                {"type": "Polygon", "coordinates": poligon},
                lon,
                lat,
            )
            for poligon in coordenades or []
        )

    if tipus == "GeometryCollection":
        return any(
            geometria_cobreix(geometria_filla, lon, lat)
            for geometria_filla in geometria.get("geometries", [])
        )

    return False


def probabilitat_nou_accident(accidents_previstos: Optional[float]) -> Optional[float]:
    """
    Calcula amb Poisson la probabilitat d'un o més accidents.

    Si lambda és el nombre mitjà d'accidents previstos:

        P(X >= 1) = 1 - P(X = 0) = 1 - e ** (-lambda)

    El resultat es retorna com a proporció entre 0 i 1.
    """
    if accidents_previstos is None:
        return None

    return 1 - exp(-accidents_previstos)


def obtenir_comarca(
    lat: float,
    lon: float,
    comarques: List[Dict[str, Any]],
) -> Optional[str]:
    """Retorna la comarca que cobreix el punt d'una incidència."""
    for comarca in comarques:
        if geometria_cobreix(comarca["geometry"], lon, lat):
            return comarca["nom"]
    return None


def comptar_incidencies_temps_real(
    comarques: List[Dict[str, Any]],
) -> Tuple[Counter, int, int]:
    """
    Descarrega les incidències i les compta per comarca.

    Retorna:
        comptador per comarca,
        nombre d'incidències sense coordenades,
        nombre d'incidències fora dels polígons.
    """
    root = ElementTree.fromstring(obtenir_bytes(INCIDENTS_URL))

    # Com que ElementTree no té local-name(), comparem la part final del tag.
    features = [
        element
        for element in root.iter()
        if str(element.tag).rsplit("}", 1)[-1] == "featureMember"
    ]

    incidencies_per_comarca = Counter()
    sense_coordenades = 0
    fora_de_comarca = 0

    for feature in features:
        lat, lon = obtenir_coordenades(feature)

        if lat is None or lon is None:
            sense_coordenades += 1
            continue

        comarca = obtenir_comarca(lat, lon, comarques)
        if comarca is None:
            fora_de_comarca += 1
        else:
            incidencies_per_comarca[comarca] += 1

    return incidencies_per_comarca, sense_coordenades, fora_de_comarca


# ============================================================
# UNIÓ DELS RESULTATS
# ============================================================

def construir_resultats(
    precipitacio_per_comarca: Dict[str, float],
    incidencies_per_comarca: Counter,
) -> List[Dict]:
    """
    Construeix una única fila per comarca.

    Per a una comarca sense dada meteorològica, es fa servir 0 mm com a
    valor de referència, igual que feia el codi original. La columna
    'precipitacio_disponible' ho deixa explícit.
    """
    totes_les_comarques = sorted(
        set(TENDENCIES_COMARCA)
        | set(precipitacio_per_comarca)
        | set(incidencies_per_comarca)
    )

    resultats = []

    for comarca in totes_les_comarques:
        precipitacio_disponible = comarca in precipitacio_per_comarca
        precipitacio = precipitacio_per_comarca.get(comarca, 0.0)

        if comarca in TENDENCIES_COMARCA:
            a, b = TENDENCIES_COMARCA[comarca]
            accidents_previstos = max(0.0, a * precipitacio + b)
            probabilitat_accident = probabilitat_nou_accident(
                accidents_previstos
            )
        else:
            accidents_previstos = None
            probabilitat_accident = None

        resultats.append(
            {
                "comarca": comarca,
                "precipitacio_mitjana_mes_mm": round(precipitacio, 2),
                "precipitacio_disponible": precipitacio_disponible,
                "accidents_previstos": (
                    round(accidents_previstos, 2)
                    if accidents_previstos is not None
                    else None
                ),
                "probabilitat_nou_accident_pct": (
                    round(probabilitat_accident * 100, 2)
                    if probabilitat_accident is not None
                    else None
                ),
                "incidencies_temps_real": incidencies_per_comarca.get(
                    comarca, 0
                ),
            }
        )

    return resultats


def imprimir_resultats(
    resultats: List[Dict],
    data_meteo: str,
    primer_dia_mes: str,
    sense_coordenades: int,
    fora_de_comarca: int,
) -> None:
    """Mostra una taula llegible amb una fila per comarca."""
    print(f"\nDades meteorològiques: {primer_dia_mes} -> {data_meteo}")
    print("Incidències viàries: font Gencat en temps real")
    print("=" * 100)
    print(
        f"{'COMARCA':<24} {'PLUJA (mm)':>12} "
        f"{'ACC. PREVISTOS':>16} {'P(≥1 ACCIDENT)':>17} "
        f"{'INCIDÈNCIES ARA':>18}"
    )
    print("-" * 100)

    for resultat in resultats:
        pluja = f"{resultat['precipitacio_mitjana_mes_mm']:.2f}"
        accidents = (
            f"{resultat['accidents_previstos']:.2f}"
            if resultat["accidents_previstos"] is not None
            else "n/d"
        )
        probabilitat = (
            f"{resultat['probabilitat_nou_accident_pct']:.2f}%"
            if resultat["probabilitat_nou_accident_pct"] is not None
            else "n/d"
        )
        print(
            f"{resultat['comarca']:<24} {pluja:>12} "
            f"{accidents:>16} {probabilitat:>17} "
            f"{resultat['incidencies_temps_real']:>18}"
        )

    print("-" * 100)
    print(f"Comarques processades: {len(resultats)}")
    print(f"Incidències sense coordenades: {sense_coordenades}")
    print(f"Incidències fora d'una comarca: {fora_de_comarca}")


def executar() -> List[Dict]:
    """Executa tot el pipeline i retorna el resultat final."""
    print("Descarregant precipitació...")
    precipitacio, data_meteo, primer_dia_mes = descarregar_precipitacio()

    print("Descarregant límits de les comarques...")
    comarques = descarregar_comarques()

    print("Descarregant incidències viàries en temps real...")
    incidencies, sense_coordenades, fora_de_comarca = (
        comptar_incidencies_temps_real(comarques)
    )

    resultats = construir_resultats(precipitacio, incidencies)
    imprimir_resultats(
        resultats,
        data_meteo,
        primer_dia_mes,
        sense_coordenades,
        fora_de_comarca,
    )
    return resultats


if __name__ == "__main__":
    try:
        executar()
    except (HTTPError, URLError, TimeoutError) as error:
        print(f"\nError de connexió amb una font de dades: {error}")
    except ElementTree.ParseError as error:
        print(f"\nError llegint el XML d'incidències: {error}")
    except Exception as error:
        print(f"\nError inesperat: {error}")