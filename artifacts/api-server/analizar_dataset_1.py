import requests
import json
from lxml import etree
from typing import List, Dict, Any

DATASET_URL = "https://www.gencat.cat/transit/opendata/incidenciesGML.xml"


def descargar_xml(url: str = DATASET_URL) -> str:
    response = requests.get(url, timeout=15)
    response.raise_for_status()
    return response.text


def extraer_incidencias(xml_content: str = None) -> List[Dict]:
    """
    Extrae información estructurada de las incidencias del XML GML de la SCT.
    Si no se pasa xml_content, descarga el XML automáticamente.
    """
    if xml_content is None:
        xml_content = descargar_xml()

    try:
        root = etree.fromstring(xml_content.encode('utf-8'))

        namespaces = {
            'wfs': 'http://www.opengis.net/wfs',
            'gml': 'http://www.opengis.net/gml',
            'cite': 'http://www.opengeospatial.net/cite'
        }

        incidencias = []

        for feature_member in root.findall('.//gml:featureMember', namespaces):
            feature = feature_member.find('.//cite:mct2_v_afectacions_data', namespaces)
            if feature is None:
                continue

            incidencia: Dict[str, Any] = {}

            campos = {
                'identificador': 'int',
                'tipus': 'int',
                'subtipus': 'int',
                'carretera': 'str',
                'pk_inici': 'float',
                'pk_fi': 'float',
                'causa': 'str',
                'data': 'str',
                'nivell': 'int',
                'sentit': 'str',
                'descripcio': 'str',
                'descripcio_tipus': 'str',
                'font': 'str',
                'cap_a': 'str'
            }

            for campo, tipo in campos.items():
                elem = feature.find(f'cite:{campo}', namespaces)
                if elem is not None and elem.text:
                    valor = elem.text.strip()
                    if tipo == 'int':
                        try:
                            incidencia[campo] = int(valor)
                        except ValueError:
                            incidencia[campo] = valor
                    elif tipo == 'float':
                        try:
                            incidencia[campo] = float(valor)
                        except ValueError:
                            incidencia[campo] = valor
                    else:
                        incidencia[campo] = valor

            coords = feature.find('.//gml:coordinates', namespaces)
            if coords is not None and coords.text:
                try:
                    lon, lat = coords.text.strip().split(',')
                    incidencia['longitud'] = float(lon)
                    incidencia['latitud'] = float(lat)
                except (ValueError, AttributeError):
                    pass

            incidencias.append(incidencia)

        return incidencias

    except etree.XMLSyntaxError as e:
        print(f"Error parseando XML: {str(e)}")
        raise


def main():
    print("=" * 80)
    print("ANÁLISIS - Dataset 1: SCT Incidències Viàries")
    print("=" * 80)
    xml_content = descargar_xml()
    incidencias = extraer_incidencias(xml_content)
    print(f"Total incidencias: {len(incidencias)}")
    if incidencias:
        print(json.dumps(incidencias[0], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
