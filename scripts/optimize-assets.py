"""Generate display copies; original illustration and font files stay untouched.

Run with Python 3, Pillow, fonttools, and brotli installed.
"""
import json
from pathlib import Path

from fontTools import subset
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PREVIEWS = ROOT / 'assets/previews'


def preview(source, target, width, quality=80, method=4):
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert('RGBA')
        image.thumbnail((width, width), Image.Resampling.LANCZOS)
        image.save(target, 'WEBP', quality=quality, method=method)


birds_path = ROOT / 'assets/birds.json'
birds = json.loads(birds_path.read_text())
for bird in birds:
    bird['clockPreview'] = f"assets/previews/clock/{bird['id']}.webp"
    preview(ROOT / bird['asset'], ROOT / bird['clockPreview'], 128, 65, 6)
    bird['preview'] = f"assets/previews/birds/{bird['id']}.webp"
    preview(ROOT / bird['asset'], ROOT / bird['preview'], 256)
    bird['previewLarge'] = f"assets/previews/birds-large/{bird['id']}.webp"
    preview(ROOT / bird['asset'], ROOT / bird['previewLarge'], 384)
birds_path.write_text(json.dumps(birds, ensure_ascii=False, indent=2) + '\n')
for wood in ('maple', 'mahogany', 'cherry'):
    preview(ROOT / f'assets/woods/{wood}.webp', PREVIEWS / f'woods/{wood}.webp', 384, 78)
preview(ROOT / 'assets/birds/american-goldfinch.webp', ROOT / 'assets/brand-bird.webp', 96)

# Latin/extended Latin covers the catalogue's names (including Kōkako),
# while retaining punctuation, arrows, currency, and mathematical symbols.
unicodes = set(range(0x100)) | set(range(0x2000, 0x2070)) | set(range(0x20A0, 0x20D0)) | set(range(0x2190, 0x2300))
for source in sorted((ROOT / 'assets/fonts').glob('*.ttf')):
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.notdef_glyph = True
    for suffix, chars in [('', unicodes), ('-ext', set(range(0x100, 0x250)))]:
        font = subset.load_font(str(source), options)
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=chars)
        subsetter.subset(font)
        subset.save_font(font, str(source.with_name(source.stem + suffix + '.woff2')), options)
print(f'Generated previews for {len(birds)} birds, three woods, the logo, and Latin/extended-Latin WOFF2 fonts.')
