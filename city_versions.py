"""Inspect city builds and retain independent, selectable release snapshots."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import threading
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parent
DEFAULT_CITY = 'prototype-4-5'
VERIFIED = {
    'b0425db495e6c8733785336b92d6794eaffb31fdf987b2364b8c72c63ff1abfb',
    '876c7780ec66cb15e324e023a836fe3b81d1abf0be405860440bd909faee7c39',
}
ID = r'[A-Za-z_$][A-Za-z0-9_$]*'
NEEDS_SUPPORT = ('This city build needs updated capture support. '
                 'Your saved versions remain available.')


def normalise_source(value):
    """Accept public ASCII City homepages, without private or credential URLs."""
    parts = urlsplit(str(value).strip())
    host = (parts.hostname or '').lower()
    if (parts.scheme != 'https' or parts.username or parts.password
            or parts.port not in (None, 443)
            or not (host == 'grownowgames.workers.dev'
                    or host.endswith('.grownowgames.workers.dev'))):
        raise ValueError('Use an HTTPS ASCII City link from '
                         'grownowgames.workers.dev.')
    path = parts.path or '/'
    if path.endswith('/index.html'):
        path = path[:-10]
    if not path.endswith('/'):
        path += '/'
    if '..' in PurePosixPath(path).parts or '%' in path:
        raise ValueError('Use the city homepage URL.')
    return urlunsplit(('https', host, path, '', ''))


def asset_name(name):
    if (not isinstance(name, str) or not name.startswith('assets/')
            or not re.fullmatch(r'[A-Za-z0-9_./-]+', name)
            or '..' in PurePosixPath(name).parts):
        raise ValueError('The release contains an invalid asset path.')
    return name


def check_manifest(manifest):
    if not isinstance(manifest, dict):
        raise ValueError('The website did not provide a city release manifest.')
    release = manifest.get('release', {})
    assets = manifest.get('assets', {})
    if not isinstance(release, dict) or not isinstance(assets, dict):
        raise ValueError('The website did not provide a valid city release manifest.')
    for field in ('name', 'version'):
        if (not isinstance(release.get(field), str)
                or not 1 <= len(release[field]) <= 160):
            raise ValueError('The release has no valid name or version.')
    for key in ('javascript', 'css', 'terrainWorker', 'wasm'):
        if key not in assets:
            raise ValueError('The release is missing a required city asset.')
    for asset in assets.values():
        if (not isinstance(asset, dict) or 'file' not in asset
                or not isinstance(asset.get('sha256'), str)):
            raise ValueError('The release has an invalid asset record.')
        asset_name(asset['file'])
        if not re.fullmatch(r'[0-9a-f]{64}', asset['sha256']):
            raise ValueError('The release has an invalid integrity checksum.')
    return manifest


def release_fingerprint(manifest):
    content = {'release': manifest['release'], 'assets': manifest['assets']}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()


class SameSiteRedirect(HTTPRedirectHandler):
    def __init__(self, source):
        self.host = urlsplit(source).hostname

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        parsed = urlsplit(newurl)
        if (parsed.scheme != 'https' or parsed.hostname != self.host
                or parsed.port not in (None, 443)):
            raise ValueError('The city download redirected to another website.')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


class CityFetcher:
    def get(self, base, name, limit):
        base = normalise_source(base)
        if name not in ('index.html', 'release-manifest.json'):
            asset_name(name)
        url = base if name == 'index.html' else urljoin(base, name)
        request = Request(url, headers={'User-Agent': 'ASCII-City-Capture'})
        with build_opener(SameSiteRedirect(base)).open(
                request, timeout=25) as response:
            data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('This city download exceeds the supported size.')
        return data


class AdapterInspector:
    """Match complete known drawing/navigation conventions, never guess names."""

    @staticmethod
    def one(pattern, source):
        matches = list(re.finditer(pattern, source))
        if len(matches) != 1:
            raise ValueError(NEEDS_SUPPORT)
        return matches[0]

    def inspect(self, source, manifest):
        frame = self.one(
            rf'requestAnimationFrame\(async function ({ID})\(', source)[1]
        canvas, context = self.one(
            rf'({ID})=document\[\x27getElementById\x27\]\(\x27cv\x27\),'
            rf'({ID})=\1\[\x27getContext\x27\]\(\x272d\x27\)', source).groups()
        width, cols, rows = self.one(
            rf'var ({ID})={context}\[\x27measureText\x27\]\(\x27M\x27\)'
            rf'\[\x27width\x27\],({ID})={ID}\[\x27cols\x27\];'
            rf'{canvas}\[\x27width\x27\]=Math\[\x27ceil\x27\]\(\2\*\1\),'
            rf'{canvas}\[\x27height\x27\]=0x9\*({ID})', source).groups()
        atlas = self.one(
            rf'\(({ID})={ID}\[\x27getContext\x27\]\(\x272d\x27\)\)'
            rf'\[\x27font\x27\]={ID}', source)[1]
        phase, phases = self.one(
            rf'var ({ID})=({ID})\[\x27LIVE\x27\],{ID}='
            r'performance\[\x27now\x27\]\(\)', source).groups()
        district = self.one(
            rf'({ID})\(\x27DISTRICT\x27,({ID})'
            r'\[\x27district\x27\]\[\x27name\x27\]', source)
        row, place_var = district.groups()
        nav = source[max(0, district.start() - 5500):district.end() + 2500]
        bearing, camera, world_x, world_z = self.one(
            rf'let {ID}=({ID})\(({ID})\[\x27yaw\x27\]\),'
            rf'{ID}=({ID})\(\2\[\x27x\x27\]\),'
            rf'{ID}=({ID})\(\2\[\x27z\x27\]\)', nav).groups()
        area, place = self.one(
            rf'if\(\x27city\x27===({ID})\)\{{let {place_var}=({ID})\(\),',
            nav).groups()
        start = nav.index(f'let {place_var}=')
        nearest = nav[start:nav.index(f"{row}('DISTRICT'")]
        landmarks = self.one(
            rf'for\(let ({ID}) of ({ID})\)\{{let {ID}=\1'
            r'\[\x27x\x27\]', nearest)[2]
        phones, phone_kind = self.one(
            rf'for\(let ({ID}) of ({ID})\)\{{if\(\1\[\x27kind\x27\]'
            rf'!==({ID})\)continue;', nearest).groups()[1:]
        short = self.one(
            rf'\x27bearingShort\x27:({ID})\({ID}\[\x27compass\x27\]\)',
            nearest)[1]
        terrain, eye = self.one(
            rf'let ({ID})=({ID})\(\),({ID})=({ID})\(\),'
            rf'{ID}=\3-\1;{row}\(\x27ELEVATION\x27', nav).groups()[1::2]
        sky, aircraft = self.one(
            rf'{row}\(\x27ELEVATION\x27,({ID})\?\.\[\x27active\x27\]'
            rf'\|\|({ID})\?\.\[\x27active\x27\]', nav).groups()
        glyph = (rf'{context}\[\x27fillText\x27\]\({ID},'
                 rf'{ID}\*{width},0x9\*\({ID}\+0x1\)-1\.5\)')
        if not re.search(glyph, source):
            raise ValueError(NEEDS_SUPPORT)
        symbols = dict(zip(
            ['ATLAS', 'CONTEXT', 'CELL_WIDTH', 'COLS', 'ROWS', 'PHASE',
             'PHASES', 'BEARING', 'CAMERA', 'WORLD_X', 'WORLD_Z', 'AREA',
             'PLACE', 'LANDMARKS', 'PHONES', 'PHONE_KIND', 'SHORT_BEARING',
             'TERRAIN', 'EYE', 'SKY_TAXI', 'AIRCRAFT'],
            [atlas, context, width, cols, rows, phase, phases, bearing, camera,
             world_x, world_z, area, place, landmarks, phones, phone_kind,
             short, terrain, eye, sky, aircraft]))
        adapter = (ROOT / 'web/adapter-template.js').read_text()
        for token, value in symbols.items():
            adapter = adapter.replace('__' + token + '__', value)
        bootstrap = manifest['assets'].get('bootstrap', {}).get('file')
        gate = " && document.body.dataset.bootState === 'ready'" if bootstrap else ''
        adapter = adapter.replace('__BOOT_GATE__', gate)
        release = {key: manifest['release'][key] for key in ('name', 'version')}
        adapter = adapter.replace('__RELEASE__', json.dumps(release))
        adapter = adapter.replace('__FRAME__', json.dumps(frame))
        digest = hashlib.sha256(source.encode()).hexdigest()
        return {'frame': frame, 'hook': 'requestAnimationFrame(async function ' + frame,
                'adapter': adapter, 'build': digest,
                'script': manifest['assets']['javascript']['file'],
                'bootstrap': bootstrap, 'symbols': symbols,
                'support': 'verified' if digest in VERIFIED else 'detected'}


class CityAssets:
    """An immutable city snapshot; only optional missing assets are fetched."""

    def __init__(self, root=ROOT, cache_dir=None, source=None):
        self.root = Path(root)
        self.cache = self.root / 'cache'
        self.downloads = Path(cache_dir) if cache_dir else self.cache
        self.source = source or 'https://prototype4-5-a5be.grownowgames.workers.dev/'
        self.manifest = None
        self.profile = None

    def get(self, name):
        path = self.cache / name
        if not path.resolve().is_relative_to(self.cache.resolve()):
            raise ValueError('Invalid asset path')
        if path.is_file():
            return path.read_bytes()
        path = self.downloads / name
        if not path.resolve().is_relative_to(self.downloads.resolve()):
            raise ValueError('Invalid download path')
        if not path.is_file():
            data = CityFetcher().get(self.source, name, 32 * 1024 * 1024)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return path.read_bytes()

    def validate(self):
        self.manifest = check_manifest(json.loads(self.get('release-manifest.json')))
        for key, asset in self.manifest['assets'].items():
            if key == 'audio':
                continue
            if hashlib.sha256(self.get(asset['file'])).hexdigest() != asset['sha256']:
                raise ValueError('City download integrity check failed.')
        source = self.get(self.manifest['assets']['javascript']['file']).decode()
        self.profile = AdapterInspector().inspect(source, self.manifest)
        self.html()

    def script(self):
        if self.profile is None:
            self.validate()
        source = self.get(self.profile['script']).decode()
        if hashlib.sha256(source.encode()).hexdigest() != self.profile['build']:
            raise ValueError('City download integrity check failed.')
        return source.replace(self.profile['hook'],
                              self.profile['adapter'] + self.profile['hook'], 1).encode()

    def html(self):
        entry = self.profile['bootstrap'] or self.profile['script']
        source = self.get('index.html').decode()
        loader = '''<script src="/bridge.js"></script>
<script type="module">
try {
 const font = new FontFace('CityCapture', 'url(/font.ttf)');
 await font.load(); document.fonts.add(font);
 await import('./__ENTRY__');
} catch(error) { window.__cityCapture.fail(error.message); }
</script>'''.replace('__ENTRY__', entry)
        pattern = (r'<script type="module" src="\./' + re.escape(entry)
                   + r'"></script>')
        source, count = re.subn(pattern, lambda match: loader, source)
        if count != 1:
            raise ValueError(NEEDS_SUPPORT)
        return source.encode()


class CityCatalog:
    def __init__(self, root=ROOT, data_dir=None, fetcher=None):
        self.root = Path(root)
        self.data = Path(data_dir) if data_dir else self.root / 'city-data'
        self.fetcher = fetcher or CityFetcher()
        self.lock = threading.RLock()
        self.loaded = {}
        self.entries = {
            'prototype-4-5': self._bundled(
                'prototype-4-5', self.root,
                'https://prototype4-5-a5be.grownowgames.workers.dev/'),
            'prototype-4': self._bundled(
                'prototype-4', self.root / 'releases/prototype-4',
                'https://prototype4-1d81.grownowgames.workers.dev/'),
        }
        for folder in sorted((self.data / 'snapshots').glob('build-*')):
            try:
                entry = json.loads((folder / 'entry.json').read_text())
                if (entry['id'] != folder.name
                        or not re.fullmatch(r'build-[0-9a-f]{64}', folder.name)):
                    continue
                entry['root'] = folder
                entry['source'] = normalise_source(entry['source'])
                self.entries[entry['id']] = entry
            except (OSError, ValueError, KeyError, TypeError):
                continue
        try:
            self.selected = json.loads((self.data / 'selection.json').read_text())['id']
        except (OSError, ValueError, KeyError, TypeError):
            self.selected = DEFAULT_CITY
        if (self.selected not in self.entries
                or self.entries[self.selected]['support'] == 'unsupported'):
            self.selected = DEFAULT_CITY

    @staticmethod
    def _bundled(key, root, source):
        manifest = check_manifest(json.loads((root / 'cache/release-manifest.json').read_bytes()))
        return {'id': key, 'root': root, 'source': source,
                'name': manifest['release']['name'],
                'version': manifest['release']['version'],
                'build': manifest['assets']['javascript']['sha256'],
                'fingerprint': release_fingerprint(manifest),
                'support': 'verified', 'bundled': True, 'addedAt': None}

    @staticmethod
    def public(entry):
        return {key: value for key, value in entry.items() if key != 'root'}

    def list(self):
        with self.lock:
            return {'selected': self.selected,
                    'versions': [self.public(entry) for entry in self.entries.values()]}

    def assets(self, key):
        with self.lock:
            if key not in self.entries:
                raise ValueError('That city version is not available.')
            entry = self.entries[key]
            if entry['support'] == 'unsupported':
                raise ValueError(NEEDS_SUPPORT)
            if key not in self.loaded:
                assets = CityAssets(root=entry['root'], source=entry['source'],
                                    cache_dir=self.data / 'optional' / key)
                assets.validate()
                self.loaded[key] = assets
            return self.loaded[key]

    def select(self, key):
        with self.lock:
            self.assets(key)
            self.data.mkdir(parents=True, exist_ok=True)
            stage = self.data / 'selection.tmp'
            stage.write_text(json.dumps({'id': key}))
            stage.replace(self.data / 'selection.json')
            self.selected = key
            return self.public(self.entries[key])

    def import_url(self, url, progress=lambda text: None):
        source = normalise_source(url)
        progress('Reading city release details…')
        raw = self.fetcher.get(source, 'release-manifest.json', 512 * 1024)
        manifest = check_manifest(json.loads(raw))
        build = manifest['assets']['javascript']['sha256']
        fingerprint = release_fingerprint(manifest)
        with self.lock:
            for entry in self.entries.values():
                if entry['fingerprint'] == fingerprint:
                    return self.public(entry)
        progress('Checking capture compatibility…')
        main = self.fetcher.get(source, manifest['assets']['javascript']['file'], 12 * 1024 * 1024)
        if hashlib.sha256(main).hexdigest() != build:
            raise ValueError('City download integrity check failed.')
        try:
            profile = AdapterInspector().inspect(main.decode(), manifest)
            support, reason = profile['support'], ''
        except ValueError:
            support, reason = 'unsupported', NEEDS_SUPPORT
        key = 'build-' + fingerprint
        entry = {'id': key, 'source': source, 'name': manifest['release']['name'],
                 'version': manifest['release']['version'], 'build': build,
                 'fingerprint': fingerprint,
                 'support': support, 'reason': reason, 'bundled': False,
                 'addedAt': datetime.now(timezone.utc).isoformat()}
        parent = self.data / 'snapshots'
        parent.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix='checking-', dir=parent))
        try:
            if support != 'unsupported':
                cache = stage / 'cache'
                cache.mkdir()
                (cache / 'release-manifest.json').write_bytes(raw)
                html = self.fetcher.get(source, 'index.html', 2 * 1024 * 1024)
                (cache / 'index.html').write_bytes(html)
                total = 0
                for asset_key, asset in manifest['assets'].items():
                    if asset_key == 'audio':
                        continue
                    progress('Saving city files: ' + asset_key + '…')
                    content = (main if asset_key == 'javascript'
                               else self.fetcher.get(source, asset['file'],
                                                     32 * 1024 * 1024))
                    total += len(content)
                    if total > 64 * 1024 * 1024:
                        raise ValueError('This city release is too large.')
                    if hashlib.sha256(content).hexdigest() != asset['sha256']:
                        raise ValueError('City download integrity check failed.')
                    destination = cache / asset['file']
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(content)
                check = CityAssets(root=stage, source=source)
                check.validate()
            (stage / 'entry.json').write_text(json.dumps(entry))
            with self.lock:
                target = parent / key
                if not target.exists():
                    stage.rename(target)
                entry['root'] = target
                self.entries[key] = entry
            return self.public(entry)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
