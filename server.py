"""Serve the private capture companion and saved ASCII City releases."""

import argparse
import errno
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

from release import CITY_NAME, CITY_VERSION, VERSION
from city_versions import CityAssets, CityCatalog
from import_jobs import ImportJobs

ROOT = Path(__file__).resolve().parent


def find_font():
    """Use the city's normal macOS fallback, shared by drawing and export."""
    candidates = [
        Path('/System/Library/Fonts/Supplemental/Courier New.ttf'),
        Path('/Library/Fonts/Courier New.ttf'),
        Path('/Library/Fonts/DejaVuSansMono.ttf'),
        Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError('Courier New or DejaVu Sans Mono is required '
                            'for character export.')


class CaptureServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, cache_dir=None, instance='', revision=''):
        self.instance = instance
        self.revision = revision
        data_dir = Path(cache_dir).parent / 'cities' if cache_dir else ROOT / 'city-data'
        self.catalog = CityCatalog(data_dir=data_dir)
        self.jobs = ImportJobs(self.catalog)
        self.assets = self.catalog.assets(self.catalog.selected)
        self.font_path = find_font()
        super().__init__(address, CaptureHandler)

    def identity(self):
        return {'service': 'ascii-city-capture', 'version': VERSION,
                'city': CITY_NAME, 'cityVersion': CITY_VERSION,
                'font': self.font_path.stem, 'port': self.server_address[1],
                'instance': self.instance, 'revision': self.revision}

    def write_endpoint(self, path):
        stage = path.with_suffix('.tmp')
        stage.write_text(json.dumps(self.identity()), encoding='utf-8')
        stage.replace(path)


class CaptureHandler(BaseHTTPRequestHandler):
    """Loopback-only static routes; no arbitrary proxy or filesystem access."""

    def do_GET(self):
        host = self.headers.get('Host', '').split(':')[0]
        if host not in ('127.0.0.1', 'localhost'):
            self.send_error(403)
            return
        path = unquote(urlsplit(self.path).path)
        try:
            if path == '/api/identity':
                self.reply(json.dumps(self.server.identity()).encode(),
                           'application/json')
            elif path == '/font.ttf':
                self.reply(self.server.font_path.read_bytes(), 'font/ttf')
            elif path == '/api/cities':
                self.json_reply(self.server.catalog.list())
            elif path.startswith('/api/cities/jobs/'):
                self.json_reply(self.server.jobs.get(path.rsplit('/', 1)[1]))
            elif path.startswith('/city/'):
                self.city_route(path.removeprefix('/city/'))
            else:
                name = 'index.html' if path == '/' else path.lstrip('/')
                file = (ROOT / 'web' / name).resolve()
                if (not file.is_relative_to((ROOT / 'web').resolve())
                        or not file.is_file()):
                    self.send_error(404)
                    return
                self.reply(file.read_bytes(), self.mime(name))
        except (OSError, ValueError, KeyError) as error:
            self.reply(json.dumps({'error': str(error)}).encode(),
                       'application/json', 503)

    def city_route(self, relative):
        """Each iframe keeps its own release, even if another tab switches."""
        key, separator, rest = relative.partition('/')
        if key in self.server.catalog.entries:
            assets = self.server.catalog.assets(key)
            name = rest if separator else ''
        else:
            assets = self.server.catalog.assets(self.server.catalog.selected)
            name = relative
        allowed = {asset['file'] for asset in assets.manifest['assets'].values()}
        allowed.add('release-manifest.json')
        if name in ('', 'index.html'):
            self.reply(assets.html(), 'text/html; charset=utf-8')
        elif name == assets.profile['script']:
            self.reply(assets.script(), 'text/javascript')
        elif name in allowed:
            self.reply(assets.get(name), self.mime(name))
        else:
            self.send_error(404)

    def json_reply(self, value, status=200):
        self.reply(json.dumps(value).encode(), 'application/json', status)

    def do_POST(self):
        host = self.headers.get('Host', '')
        if (host not in (f'127.0.0.1:{self.server.server_address[1]}',
                         f'localhost:{self.server.server_address[1]}')
                or self.headers.get('Origin') != 'http://' + host):
            self.json_reply({'error': 'Open City versions from this capture app.'}, 403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if (not 0 < size <= 4096
                    or self.headers.get_content_type() != 'application/json'):
                raise ValueError('Invalid city request.')
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('Invalid city request.')
            path = urlsplit(self.path).path
            if path == '/api/cities/select':
                self.json_reply(self.server.catalog.select(str(body.get('id', ''))))
            elif path == '/api/cities/check':
                self.json_reply(self.server.jobs.start(body.get('url', '')), 202)
            else:
                self.json_reply({'error': 'Unknown city action.'}, 404)
        except (OSError, ValueError, KeyError, TypeError) as error:
            self.json_reply({'error': str(error)}, 400)

    @staticmethod
    def mime(name):
        if name.endswith(('.js', '.mjs')):
            return 'text/javascript'
        return mimetypes.guess_type(name)[0] or 'application/octet-stream'

    def do_HEAD(self):
        """Supply HTTP Date for the city's day/night clock, without a body."""
        self.do_GET()

    def reply(self, data, content_type, status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        if args and str(args[1] if len(args) > 1 else '').startswith(('4', '5')):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--cache-dir', type=Path)
    parser.add_argument('--ready-file', type=Path)
    parser.add_argument('--instance', default='')
    parser.add_argument('--revision', default='')
    arguments = parser.parse_args()
    try:
        server = CaptureServer(('127.0.0.1', arguments.port), arguments.cache_dir,
                               arguments.instance, arguments.revision)
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            sys.exit(75)
        raise
    if arguments.ready_file:
        server.write_endpoint(arguments.ready_file)
    server.serve_forever()
