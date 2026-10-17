"""Build small, attributed playback clips from explicitly curated sources.

Requires ffmpeg and ffprobe. Pass --download to fetch missing source files;
the original recordings are cached outside the repository, never published.
"""
import argparse
import hashlib
import html
import json
import pathlib
import subprocess
import tempfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--download', action='store_true')
parser.add_argument('--cache-dir', type=pathlib.Path,
                    default=pathlib.Path(tempfile.gettempdir()) / 'birdclock-audio-originals')
args = parser.parse_args()
source_path = ROOT / 'assets/bird-audio-sources.json'
catalogue = json.loads(source_path.read_text())
output = ROOT / 'assets/calls'
output.mkdir(exist_ok=True)
args.cache_dir.mkdir(parents=True, exist_ok=True)


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)
    ]))


def prepare(item):
    bird_id, source = item
    license_name = source['license']
    if (not license_name.startswith(('CC BY ', 'CC BY-SA ', 'CC0', 'Public domain'))
            or 'NC' in license_name or 'ND' in license_name):
        raise ValueError(f'{bird_id}: this build only accepts freely reusable licenses')
    original = args.cache_dir / (bird_id + '.source')
    if not original.exists():
        if not args.download:
            raise FileNotFoundError(f'{original}: rerun with --download')
        request = urllib.request.Request(source['downloadUrl'], headers={
            'User-Agent': 'BirdClock/1.0 (https://github.com/Ben-Keller/birdclock; licensed audio curation)'
        })
        with urllib.request.urlopen(request, timeout=45) as response:
            content = response.read(40_000_001)
        if len(content) > 40_000_000:
            raise ValueError(f'{bird_id}: source exceeds the download budget')
        original.write_bytes(content)
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    if source.get('sourceSha256') and source['sourceSha256'] != digest:
        raise ValueError(f'{bird_id}: source changed; recheck the recording and license')
    info = probe(original)
    duration = float(info['format']['duration'])
    length = min(source['clipSeconds'], duration - source['offset'])
    if length < .3 or not any(s['codec_type'] == 'audio' for s in info['streams']):
        raise ValueError(f'{bird_id}: source has no usable audio')
    target = output / (bird_id + '.mp3')
    changes = ('Excerpt; volume normalized; brief fades; mono MP3.'
               if length < duration else 'Volume normalized; brief fades; mono MP3.')
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', str(source['offset']), '-i', str(original), '-t', str(length),
        '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '44100',
        '-af', f'loudnorm=I=-20:LRA=11:TP=-2,afade=t=in:d=0.06,afade=t=out:st={max(0,length-.1)}:d=0.1',
        '-c:a', 'libmp3lame', '-b:a', '64k',
        '-metadata', f'title={source["name"]} — {source["kind"]}',
        '-metadata', f'artist={source["recordist"]}',
        '-metadata', f'copyright={source["license"]} {source["licenseUrl"]}',
        '-metadata', f'comment={source["sourceUrl"]} | {changes}', str(target)
    ], check=True)
    result = {key: source[key] for key in (
        'name', 'scientificName', 'title', 'recordist', 'sourceUrl',
        'license', 'licenseUrl', 'kind', 'offset'
    )}
    if source.get('originalSourceUrl'):
        result['originalSourceUrl'] = source['originalSourceUrl']
    result.update(file=f'assets/calls/{bird_id}.mp3',
                  duration=round(float(probe(target)['format']['duration']), 3),
                  originalDuration=round(duration, 3), edits=changes,
                  bytes=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    print(f'{bird_id}: {result["duration"]:.1f}s, {result["bytes"]:,} bytes, {license_name}', flush=True)
    return bird_id, result, digest


with ThreadPoolExecutor(max_workers=2) as pool:
    prepared = list(pool.map(prepare, catalogue['sources'].items()))
recordings = {}
for bird_id, result, digest in prepared:
    recordings[bird_id] = result
    catalogue['sources'][bird_id]['sourceSha256'] = digest
source_path.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + '\n')
manifest = {'version': 1, 'reviewedAt': catalogue['reviewedAt'],
            'recordings': recordings, 'unavailable': catalogue.get('unavailable', {})}
(ROOT / 'assets/bird-audio.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
index = {bird_id: {key: r[key] for key in ('kind', 'duration')} for bird_id, r in recordings.items()}
(ROOT / 'assets/bird-audio-index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')

esc = html.escape
sections = []
for bird_id, r in sorted(recordings.items(), key=lambda pair: pair[1]['name']):
    original = (f'<a href="{esc(r["originalSourceUrl"])}">Original archive record</a> · '
                if r.get('originalSourceUrl') else '')
    sections.append(f'''<section id="{bird_id}"><h2>{esc(r['name'])}</h2>
<p><i>{esc(r['scientificName'])}</i> · {esc(r['kind'])}</p>
<p>Recording: {esc(r['recordist'])}<br>Title: {esc(r['title'])}</p>
<p><a href="{esc(r['sourceUrl'])}">Source and original recording</a> · {original}<a rel="license" href="{esc(r['licenseUrl'])}">{esc(r['license'])}</a></p>
<p>{esc(r['edits'])} Source segment starts at {r['offset']:g} s; playback length {r['duration']:g} s. Adapted clips retain the source license.</p>
<audio controls preload="none" src="{bird_id}.mp3"></audio></section>''')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recording credits · Bird Clock</title><style>body{max-width:750px;margin:40px auto;padding:0 24px;background:#f4f0e6;color:#302e27;font:16px/1.6 system-ui}a{color:#46543c}h1,h2{font-family:Georgia,serif;font-weight:400}section{border-top:1px solid #d8d1c2;padding:24px 0}audio{max-width:100%}section:target{background:#e9ecdf}p{overflow-wrap:anywhere}</style>
<a href="../../">← Bird Clock</a><h1>Bird recording credits</h1>
<p>Real recordings from Wikimedia Commons, Xeno-canto, iNaturalist and the credited archives. Each audio file has its own license; these licenses apply to the recordings and their adaptations. Xeno-canto and its recordists are acknowledged for recordings sourced through its collection.</p>
<p>Short playback excerpts were prepared for Bird Clock. Recording type, source, credit, license and edits are listed below. Natural background sounds may be audible.</p>'''
(output / 'credits.html').write_text(page + '\n'.join(sections) + '</html>\n')
print(f'Prepared {len(recordings)} clips; {sum(r["bytes"] for r in recordings.values()):,} bytes total.')
