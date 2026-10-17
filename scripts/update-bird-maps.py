"""Refresh local GBIF map snapshots. Standard library only; needs network access.

Review the resulting taxonomy/map diff before publishing. Regional framing is
editorial, not a species range boundary. Profile prose/review dates are untouched.
"""

import concurrent.futures
import datetime
import json
import math
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/maps'


def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=25) as response:
                if response.status == 204:
                    return None  # No records in this tile.
                return response.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def mercator(lon, lat):
    radians = math.radians(max(-85.0511, min(85.0511, lat)))
    return ((lon + 180) / 360,
            (1 - math.log(math.tan(radians) + 1 / math.cos(radians)) / math.pi) / 2)


def region_tiles(bounds):
    west, south, east, north = bounds
    x1, y1 = mercator(west, north)
    x2, y2 = mercator(east, south)
    zoom = max(0, min(3, math.floor(math.log2(1 / max(x2-x1, y2-y1)))))
    if not zoom:
        return []
    n = 2 ** zoom
    return [(zoom, x, y)
            for x in range(max(0, math.floor(x1*n)), min(n, math.ceil(x2*n)))
            for y in range(max(0, math.floor(y1*n)), min(n, math.ceil(y2*n)))]


def species(bird, bounds):
    name = bird['scientificName']
    query = urllib.parse.urlencode({'name': name, 'strict': 'true'})
    match = json.loads(get('https://api.gbif.org/v1/species/match?' + query))
    if (match.get('matchType') != 'EXACT' or match.get('rank') != 'SPECIES'
            or match.get('canonicalName') != name):
        raise ValueError(f'{name}: unexpected taxonomy match {match}')
    key = match.get('acceptedUsageKey', match['usageKey'])
    files, tiles = {}, []
    for zoom, x, y in [(0, 0, 0), *region_tiles(bounds)]:
        url = (f'https://api.gbif.org/v2/map/occurrence/density/{zoom}/{x}/{y}@2x.png'
               f'?taxonKey={key}&style=green.point')
        tile = get(url)
        if tile is None and zoom:
            continue
        if not tile or not tile.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'{name}: no map tile')
        suffix = f'-{zoom}-{x}-{y}' if zoom else ''
        asset = f"assets/maps/{bird['id']}{suffix}.png"
        files[asset] = tile
        if zoom:
            tiles.append({'asset': asset, 'zoom': zoom, 'x': x, 'y': y, 'url': url})
        else:
            world_asset, world_url = asset, url
    print(bird['id'], key, len(files), 'tiles', flush=True)
    record = {
        'taxonKey': key, 'matchedName': match['canonicalName'],
        'family': match['family'], 'order': match['order'],
        'url': world_url, 'source': f'https://www.gbif.org/species/{key}',
        'asset': world_asset, 'regionalTiles': tiles,
    }
    return bird['id'], record, files


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    birds = json.loads((ROOT / 'assets/birds.json').read_text())
    profile_path = ROOT / 'assets/bird-profiles.json'
    data = json.loads(profile_path.read_text())
    # Finish all network requests before replacing any bundled assets.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(species, b, data['profiles'][b['id']]['map']['focusBounds'])
                   for b in birds]
        results = [future.result() for future in futures]
    OUT.mkdir(exist_ok=True)
    records = {}
    for bird_id, record, files in results:
        records[bird_id] = record
        for asset, tile in files.items():
            (ROOT / asset).write_bytes(tile)
        profile = data['profiles'][bird_id]
        profile['taxonomy'] = {key: record[key] for key in ['family', 'order']}
        profile['map'].update({
            'taxonKey': record['taxonKey'], 'asset': record['asset'],
            'url': record['source'], 'regionalTiles': record['regionalTiles'],
        })
        for source in profile['sources']:
            if source['url'].startswith('https://www.gbif.org/species/'):
                source['url'] = record['source']
    today = datetime.date.today().isoformat()
    data['mapDate'] = today
    write_json(OUT / 'manifest.json', {
        'retrieved': today, 'provider': 'GBIF.org',
        'kind': 'Occurrence records, all years; not a range map', 'birds': records,
    })
    write_json(profile_path, data)
