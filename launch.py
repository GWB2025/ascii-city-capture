"""Prepare a stable per-user runtime and open the local capture companion."""

import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import ProxyHandler, build_opener
import webbrowser

from release import VERSION

ROOT = Path(__file__).resolve().parent


def default_data_dir():
    return Path.home() / 'Library/Application Support/ASCII City Capture'


class Launcher:
    """Keep packaged resources read-only and report all startup failures."""

    def __init__(self, root=ROOT, data_dir=None):
        self.root = Path(root)
        self.data_dir = Path(data_dir) if data_dir else default_data_dir()
        self.opener = build_opener(ProxyHandler({}))
        self.log_path = self.data_dir / 'logs/server.log'
        self.runtime = None
        self.url = None

    def prepare_runtime(self):
        modules = ('server.py', 'release.py', 'city_versions.py', 'import_jobs.py')
        files = [self.root / name for name in modules]
        for folder in ('web', 'cache', 'releases'):
            files.extend(p for p in (self.root / folder).rglob('*') if p.is_file())
        required = ['server.py', 'release.py', 'web/index.html', 'web/app.js',
                    'web/bridge.js', 'web/adapter-template.js', 'web/versions.mjs',
                    'city_versions.py', 'import_jobs.py',
                    'releases/prototype-4/cache/release-manifest.json',
                    'cache/index.html', 'cache/release-manifest.json']
        if any(not (self.root / name).is_file() for name in required):
            raise RuntimeError('The application is incomplete. '
                               'Download the complete app again.')
        digest = hashlib.sha256()
        for file in sorted(files):
            digest.update(str(file.relative_to(self.root)).encode())
            digest.update(file.read_bytes())
        revision = VERSION + '-' + digest.hexdigest()[:16]
        parent = self.data_dir / 'runtime'
        target = parent / revision
        if not (target / 'READY').is_file():
            parent.mkdir(parents=True, exist_ok=True)
            stage = Path(tempfile.mkdtemp(prefix='preparing-', dir=parent))
            try:
                for file in files:
                    destination = stage / file.relative_to(self.root)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(file, destination)
                (stage / 'READY').write_text(revision)
                try:
                    stage.rename(target)
                except FileExistsError:
                    if not (target / 'READY').is_file():
                        raise
            finally:
                if stage.exists():
                    shutil.rmtree(stage)
        return target

    def check(self):
        """Validate an installed payload without sockets, browser or hardware."""
        runtime = self.prepare_runtime()
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'capture_server_check', runtime / 'server.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        catalog = module.CityCatalog(root=runtime, data_dir=self.data_dir / 'cities')
        for key in ('prototype-4', 'prototype-4-5'):
            assets = catalog.assets(key)
            assets.script()
            assets.html()
        return {'version': VERSION, 'runtime': str(runtime),
                'font': str(module.find_font()), 'status': 'ready'}

    @property
    def endpoint_path(self):
        return self.data_dir / 'services' / (self.runtime.name + '.json')

    def valid_endpoint(self, endpoint):
        """Only accept a local port belonging to this exact packaged runtime."""
        return (isinstance(endpoint, dict)
                and endpoint.get('service') == 'ascii-city-capture'
                and endpoint.get('version') == VERSION
                and endpoint.get('revision') == self.runtime.name
                and isinstance(endpoint.get('instance'), str)
                and bool(endpoint['instance'])
                and type(endpoint.get('port')) is int
                and 0 < endpoint['port'] < 65536)

    def read_endpoint(self, path=None):
        try:
            endpoint = json.loads((path or self.endpoint_path).read_text())
            return endpoint if self.valid_endpoint(endpoint) else None
        except (OSError, ValueError):
            return None

    @staticmethod
    def endpoint_url(endpoint):
        return f"http://127.0.0.1:{endpoint['port']}/"

    def matches_service(self, endpoint):
        if not endpoint:
            return False
        try:
            url = self.endpoint_url(endpoint) + 'api/identity'
            with self.opener.open(url, timeout=2) as response:
                identity = json.load(response)
            return (self.valid_endpoint(identity)
                    and identity['instance'] == endpoint['instance']
                    and identity['port'] == endpoint['port'])
        except (OSError, ValueError):
            return False

    def running(self):
        endpoint = self.read_endpoint()
        if self.matches_service(endpoint):
            self.url = self.endpoint_url(endpoint)
            return True
        return False

    def server_error(self):
        details = (self.log_path.read_text(errors='replace')[-4000:]
                   if self.log_path.exists() else '')
        return RuntimeError('The capture service could not start.\n'
                            + details + '\nLog: ' + str(self.log_path))

    def start_service(self):
        """Keep a stable port when possible; let macOS choose one if occupied."""
        previous = self.read_endpoint()
        preferred = previous['port'] if previous else 0
        ports = [preferred, 0] if preferred else [0]
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        for port in ports:
            instance = secrets.token_urlsafe(24)
            ready = self.endpoint_path.with_name(instance + '.ready.json')
            with self.log_path.open('a') as log:
                process = subprocess.Popen(
                    [sys.executable, str(self.runtime / 'server.py'),
                     '--cache-dir', str(self.data_dir / 'downloads'),
                     '--port', str(port), '--ready-file', str(ready),
                     '--instance', instance, '--revision', self.runtime.name],
                    cwd=self.runtime,
                    stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                    start_new_session=True,
                )
            try:
                for _ in range(120):
                    status = process.poll()
                    if status == 75 and port:
                        break
                    if status is not None:
                        raise self.server_error()
                    endpoint = self.read_endpoint(ready)
                    if (endpoint and endpoint['instance'] == instance
                            and self.matches_service(endpoint)):
                        ready.replace(self.endpoint_path)
                        self.url = self.endpoint_url(endpoint)
                        return
                    time.sleep(0.25)
                else:
                    raise RuntimeError(
                        'The capture service did not become ready within '
                        '30 seconds.\nLog: ' + str(self.log_path))
            except Exception:
                if process.poll() is None:
                    process.terminate()
                raise
            finally:
                ready.unlink(missing_ok=True)
        raise self.server_error()

    def start(self, open_browser=True):
        self.runtime = self.prepare_runtime()
        self.endpoint_path.parent.mkdir(parents=True, exist_ok=True)
        with self.endpoint_path.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if not self.running():
                self.start_service()
        if open_browser:
            chrome = Path('/Applications/Google Chrome.app')
            if sys.platform == 'darwin' and chrome.exists():
                subprocess.run(['open', '-a', str(chrome), self.url], check=True,
                               capture_output=True, text=True)
            elif not webbrowser.open(self.url, new=2):
                raise RuntimeError('The city is running. Open ' + self.url
                                   + ' in your browser.')
        print('ASCII City Capture ' + VERSION + ': ' + self.url)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        launcher = Launcher(data_dir=args.data_dir)
        if args.check:
            print(json.dumps(launcher.check()))
        else:
            launcher.start(open_browser=not args.no_browser)
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
