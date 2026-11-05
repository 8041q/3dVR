"""Export the vector logo using Inkscape and Pillow (development tools only)."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
INKSCAPE = shutil.which('inkscape') or str(
    Path(os.environ.get('ProgramFiles', '/usr')) / 'Inkscape/bin/inkscape.com'
)
MASTER = PUBLIC / 'brand/3dvr-portal-v2.svg'
FAVICON = PUBLIC / 'icons/3dvr-portal-v2.svg'
SIZES = (16, 24, 32, 48, 64, 128, 256)


def render(source, destination, size):
    result = subprocess.run([
        INKSCAPE, str(source), '--export-type=png',
        f'--export-filename={destination}', f'--export-width={size}',
        f'--export-height={size}', '--export-background-opacity=0',
    ], check=True, capture_output=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if not destination.is_file():
        raise RuntimeError(f'Inkscape did not export {destination}: {result.stderr.decode(errors="replace")}')


render(MASTER, PUBLIC / 'brand/3dvr-portal-v2.png', 2048)
for size in (192, 512):
    render(MASTER, PUBLIC / f'icons/3dvr-portal-v2-{size}.png', size)

with tempfile.TemporaryDirectory(prefix='.brand-export-', dir=ROOT) as temporary:
    temporary = Path(temporary)
    assert temporary.resolve().is_relative_to(ROOT.resolve())
    frames = []
    for size in SIZES:
        output = temporary / f'{size}.png'
        render(FAVICON, output, size)
        frames.append(Image.open(output).convert('RGBA'))
        if size in (16, 32, 48):
            frames[-1].save(PUBLIC / f'icons/3dvr-portal-v2-{size}.png')
    frames[-1].save(
        PUBLIC / 'icons/3dvr-portal-v2.ico', format='ICO',
        sizes=[(size, size) for size in SIZES], append_images=frames[:-1],
    )

    # These system surfaces require an opaque backing; browser icons do not.
    for size, scale, suffix in (
        (180, 1, '180'), (192, .72, 'maskable-192'), (512, .72, 'maskable-512'),
    ):
        output = temporary / 'system.png'
        render(MASTER, output, round(size * scale))
        mark = Image.open(output).convert('RGBA')
        canvas = Image.new('RGBA', (size, size), 'white')
        offset = (size - mark.width) // 2
        canvas.alpha_composite(mark, (offset, offset))
        canvas.convert('RGB').save(PUBLIC / f'icons/3dvr-portal-v2-{suffix}.png')

print('Exported vector master, transparent icons, multi-size ICO, and system icons.')
