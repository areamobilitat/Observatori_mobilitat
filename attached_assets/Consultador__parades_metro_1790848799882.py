import requests
from datetime import datetime


# ============================================================
# CONFIGURACIÓ
# ============================================================

APP_ID = "c0ff976e"
APP_KEY = "2eb77e71d3156dc0461ec6c1093dd8d4"

ENDPOINT = "https://api.tmb.cat/v1/itransit/metro/estacions"


# ============================================================
# LLISTA DE PARADES
# ============================================================

metro_barcelona = {
    "L1": [
        (111, "Hospital de Bellvitge"),
        (112, "Bellvitge"),
        (113, "Av. Carrilet"),
        (114, "Rambla Just Oliveras"),
        (115, "Can Serra"),
        (116, "Florida"),
        (117, "Torrassa"),
        (118, "Santa Eulàlia"),
        (119, "Mercat Nou"),
        (120, "Plaça de Sants"),
        (121, "Hostafrancs"),
        (122, "Espanya"),
        (123, "Rocafort"),
        (124, "Urgell"),
        (125, "Universitat"),
        (126, "Catalunya"),
        (127, "Urquinaona"),
        (128, "Arc de Triomf"),
        (129, "Marina"),
        (130, "Glòries"),
        (131, "Clot"),
        (132, "Navas"),
        (133, "La Sagrera"),
        (134, "Fabra i Puig"),
        (135, "Sant Andreu"),
        (136, "Torras i Bages"),
        (137, "Trinitat Vella"),
        (138, "Baró de Viver"),
        (139, "Santa Coloma"),
        (140, "Fondo"),
    ],

    "L2": [
        (210, "Paral·lel"),
        (211, "Sant Antoni"),
        (212, "Universitat"),
        (213, "Passeig de Gràcia"),
        (214, "Tetuan"),
        (215, "Monumental"),
        (216, "Sagrada Família"),
        (217, "Encants"),
        (218, "Clot"),
        (219, "Bac de Roda"),
        (220, "Sant Martí"),
        (221, "La Pau"),
        (222, "Verneda"),
        (223, "Artigues | Sant Adrià"),
        (224, "Sant Roc"),
        (225, "Gorg"),
        (226, "Pep Ventura"),
        (227, "Badalona Pompeu Fabra"),
    ],

    "L3": [
        (314, "Zona Universitària"),
        (315, "Palau Reial"),
        (316, "Maria Cristina"),
        (317, "Les Corts"),
        (318, "Plaça del Centre"),
        (319, "Sants Estació"),
        (320, "Tarragona"),
        (321, "Espanya"),
        (322, "Poble Sec"),
        (323, "Paral·lel"),
        (324, "Drassanes"),
        (325, "Liceu"),
        (326, "Catalunya"),
        (327, "Passeig de Gràcia"),
        (328, "Diagonal"),
        (329, "Fontana"),
        (330, "Lesseps"),
        (331, "Vallcarca"),
        (332, "Penitents"),
        (333, "Vall d'Hebron"),
        (334, "Montbau"),
        (335, "Mundet"),
        (336, "Valldaura"),
        (337, "Canyelles"),
        (338, "Roquetes"),
        (339, "Trinitat Nova"),
    ],

    "L4": [
        (413, "La Pau"),
        (414, "Besòs"),
        (415, "Besòs Mar"),
        (416, "El Maresme | Fòrum"),
        (417, "Selva de Mar"),
        (418, "Poblenou"),
        (419, "Llacuna"),
        (420, "Bogatell"),
        (421, "Ciutadella | Vila Olímpica"),
        (422, "Barceloneta"),
        (423, "Jaume I"),
        (424, "Urquinaona"),
        (425, "Girona"),
        (426, "Verdaguer"),
        (427, "Joanic"),
        (428, "Alfons X"),
        (429, "Guinardó | Hospital de Sant Pau"),
        (430, "Maragall"),
        (431, "Llucmajor"),
        (432, "Via Júlia"),
        (433, "Trinitat Nova"),
    ],

    "L5": [
        (509, "Cornellà Centre"),
        (510, "Gavarra"),
        (511, "Sant Ildefons"),
        (512, "Can Boixeres"),
        (513, "Can Vidalet"),
        (514, "Pubilla Cases"),
        (515, "Ernest Lluch"),
        (516, "Collblanc"),
        (517, "Badal"),
        (518, "Plaça de Sants"),
        (519, "Sants Estació"),
        (520, "Entença"),
        (521, "Hospital Clínic"),
        (522, "Diagonal"),
        (523, "Verdaguer"),
        (524, "Sagrada Família"),
        (525, "Sant Pau | Dos de Maig"),
        (526, "Camp de l'Arpa"),
        (527, "La Sagrera"),
        (528, "Congrés"),
        (529, "Maragall"),
        (530, "Virrei Amat"),
        (531, "Vilapicina"),
        (532, "Horta"),
        (533, "El Carmel"),
        (534, "El Coll | La Teixonera"),
        (535, "Vall d'Hebron"),
    ],

    "L9N": [
        (930, "La Sagrera"),
        (932, "Onze de Setembre"),
        (933, "Bon Pastor"),
        (934, "Can Peixauet"),
        (935, "Santa Rosa"),
        (936, "Fondo"),
        (937, "Església Major"),
        (938, "Singuerlín"),
        (939, "Can Zam"),
    ],

    "L9S": [
        (901, "Aeroport T1"),
        (903, "Aeroport T2"),
        (904, "Mas Blau"),
        (905, "Parc Nou"),
        (906, "Cèntric"),
        (907, "El Prat Estació"),
        (908, "Les Moreres"),
        (909, "Mercabarna"),
        (910, "Parc Logístic"),
        (911, "Fira"),
        (912, "Europa | Fira"),
        (913, "Can Tries | Gornal"),
        (914, "Torrassa"),
        (915, "Collblanc"),
        (916, "Zona Universitària"),
    ],

    "L10N": [
        (930, "La Sagrera"),
        (932, "Onze de Setembre"),
        (933, "Bon Pastor"),
        (934, "Llefià"),
        (935, "La Salut"),
        (936, "Gorg"),
    ],

    "L10S": [
        (951, "ZAL | Riu Vell"),
        (952, "Ecoparc"),
        (953, "Port Comercial | La Factoria"),
        (954, "Zona Franca"),
        (955, "Foc"),
        (956, "Foneria"),
        (957, "Ciutat de la Justícia"),
        (958, "Provençana"),
        (959, "Can Tries | Gornal"),
        (960, "Torrassa"),
        (961, "Collblanc"),
    ],

    "L11": [
        (1136, "Trinitat Nova"),
        (1137, "Casa de l'Aigua"),
        (1138, "Torre Baró | Vallbona"),
        (1139, "Ciutat Meridiana"),
        (1140, "Can Cuiàs"),
    ],
}


# ============================================================
# PETICIÓ A L'API
# ============================================================

params = {
    "app_id": APP_ID.strip(),
    "app_key": APP_KEY.strip(),
}

try:
    resposta = requests.get(
        ENDPOINT,
        params=params,
        timeout=15,
    )

    print("Codi HTTP:", resposta.status_code)

    resposta.raise_for_status()

    dades = resposta.json()

except requests.exceptions.Timeout:
    print("Error: la petició ha superat el temps d'espera.")
    raise SystemExit

except requests.exceptions.RequestException as error:
    print("Error de connexió o de l'API:", error)
    raise SystemExit

except ValueError:
    print("Error: la resposta no és un JSON vàlid.")
    print(resposta.text)
    raise SystemExit


# ============================================================
# TIMESTAMP DE REFERÈNCIA
# ============================================================

referencia_ms = int(dades.get("timestamp", 0))


# ============================================================
# CREAR UN DICCIONARI AMB LES DADES DE TMB
# ============================================================

estacions_api = {}

for linia in dades.get("linies", []):

    nom_linia_api = linia.get(
        "nom_linia",
        "Línia desconeguda"
    )

    for estacio in linia.get("estacions", []):

        codi = estacio.get("codi_estacio")

        if codi is None:
            continue

        try:
            codi = int(codi)
        except (ValueError, TypeError):
            continue

        estacions_api[codi] = {
            "linia": nom_linia_api,
            "nom": estacio.get(
                "nom_estacio",
                f"Estació {codi}"
            ),
            "estacio": estacio,
        }


# ============================================================
# CONSULTAR TOTES LES PARADES DE LA LLISTA
# ============================================================

print()
print("=" * 100)
print("PROPERS TRENS DE TOTES LES ESTACIONS")
print("=" * 100)


total_trens = 0
estacions_trobades = 0
estacions_no_trobades = 0


for nom_linia, estacions in metro_barcelona.items():

    print()
    print("#" * 100)
    print(f"# {nom_linia}")
    print("#" * 100)

    for codi_estacio, nom_estacio_llista in estacions:

        estacio_info = estacions_api.get(codi_estacio)

        print()
        print("-" * 100)
        print(
            f"{codi_estacio} - {nom_estacio_llista}"
        )
        print("-" * 100)

        # ----------------------------------------------------
        # L'estació no apareix a la resposta de l'API
        # ----------------------------------------------------

        if estacio_info is None:

            print("⚠ No s'ha trobat aquesta estació a l'API.")

            estacions_no_trobades += 1

            continue

        estacions_trobades += 1

        estacio = estacio_info["estacio"]

        trens_estacio = 0

        # ----------------------------------------------------
        # Buscar els trajectes de l'estació
        # ----------------------------------------------------

        for trajecte in estacio.get(
            "linies_trajectes",
            []
        ):

            desti = trajecte.get(
                "desti_trajecte",
                "Destinació desconeguda"
            )

            propers_trens = trajecte.get(
                "propers_trens",
                []
            )

            if not propers_trens:
                continue

            print(f"\n  → Destinació: {desti}")

            for tren in propers_trens:

                temps_arribada = tren.get(
                    "temps_arribada"
                )

                if temps_arribada is None:
                    continue

                try:
                    temps_arribada_ms = int(
                        temps_arribada
                    )
                except (ValueError, TypeError):
                    continue

                # --------------------------------------------
                # Temps restant
                # --------------------------------------------

                segons_restants = max(
                    0,
                    (
                        temps_arribada_ms
                        - referencia_ms
                    ) // 1000
                )

                minuts, segons = divmod(
                    segons_restants,
                    60
                )

                # --------------------------------------------
                # Hora prevista
                # --------------------------------------------

                hora_arribada = datetime.fromtimestamp(
                    temps_arribada_ms / 1000
                ).strftime("%H:%M:%S")

                print(
                    f"     Tren: "
                    f"{minuts} min "
                    f"{segons:02d} s"
                    f"  |  "
                    f"{hora_arribada}"
                )

                trens_estacio += 1
                total_trens += 1

        # ----------------------------------------------------
        # No hi ha trens
        # ----------------------------------------------------

        if trens_estacio == 0:
            print(
                "  No hi ha propers trens "
                "disponibles."
            )


# ============================================================
# RESUM FINAL
# ============================================================

print()
print("=" * 100)
print("RESUM")
print("=" * 100)

print(
    f"Estacions trobades a l'API: "
    f"{estacions_trobades}"
)

print(
    f"Estacions no trobades: "
    f"{estacions_no_trobades}"
)

print(
    f"Total de trens mostrats: "
    f"{total_trens}"
)
