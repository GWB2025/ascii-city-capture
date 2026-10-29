"""Release, routing and font checks without a browser or any machine movement."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import CityAssets, find_font
from city_versions import CityCatalog
from import_jobs import ImportJobs
from server import CaptureHandler, CaptureServer


class ReleaseTests(unittest.TestCase):
    def test_prototype_45_preserves_its_bootstrap_loader(self):
        assets = CityAssets()
        assets.validate()
        self.assertEqual(assets.manifest['release']['version'], '0.4.5-dn.14')
        html = assets.html().decode()
        self.assertIn("await import('./assets/boot-db3fcdad0a0ca602.js')", html)
        self.assertNotIn("await import('./assets/main-", html)
        self.assertIn('boot-meter', html)

    def test_head_response_supports_city_clock_without_sending_a_body(self):
        handler = CaptureHandler.__new__(CaptureHandler)
        handler.command = 'HEAD'
        handler.wfile = io.BytesIO()
        headers = {}
        handler.send_response = lambda status: None
        handler.send_header = headers.__setitem__
        handler.end_headers = lambda: None
        handler.reply(b'city html', 'text/html')
        self.assertEqual(headers['Content-Length'], '9')
        self.assertEqual(handler.wfile.getvalue(), b'')
        self.assertTrue(callable(getattr(handler, 'do_HEAD', None)))

    def test_pinned_release_and_instrumentation(self):
        assets = CityAssets()
        assets.validate()
        self.assertIn(assets.profile['adapter'].encode(), assets.script())
        self.assertEqual(assets.script().count(assets.profile['adapter'].encode()), 1)
        self.assertIn(b'/bridge.js', assets.html())

    def test_path_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            CityAssets().get('../server.py')

    def test_local_font_is_present(self):
        self.assertTrue(find_font().is_file())


class MemoryConnection:
    """Exercise real HTTP handling without opening any socket."""

    def __init__(self, request):
        self.request = io.BytesIO(request)
        self.response = bytearray()

    def makefile(self, mode, buffering=None):
        return self.request

    def sendall(self, data):
        self.response.extend(data)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.server = CaptureServer.__new__(CaptureServer)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.server.catalog = CityCatalog(data_dir=Path(self.temporary.name))
        self.server.jobs = ImportJobs(self.server.catalog)
        self.server.assets = CityAssets()
        self.server.assets.validate()
        self.server.font_path = find_font()
        self.server.instance = 'test-instance'
        self.server.revision = 'test-runtime'
        self.server.server_address = ('127.0.0.1', 43123)

    def request(self, method, path, body=None, origin="http://127.0.0.1:43123"):
        payload = json.dumps(body).encode() if body is not None else b''
        extra = (f'Origin: {origin}\r\nContent-Type: application/json\r\n'
                 f'Content-Length: {len(payload)}\r\n') if payload else ''
        request = (f'{method} {path} HTTP/1.1\r\n'
                   'Host: 127.0.0.1:43123\r\nConnection: close\r\n' + extra + '\r\n')
        wire = MemoryConnection(request.encode() + payload)
        CaptureHandler(wire, ('127.0.0.1', 12345), self.server)
        return bytes(wire.response).split(b'\r\n\r\n', 1)

    def test_city_loader_and_clock_head_use_the_same_route(self):
        get_headers, body = self.request('GET', '/city/')
        head_headers, head_body = self.request('HEAD', '/city/?city-clock=test')
        self.assertIn(b'200 OK', get_headers)
        self.assertIn(b'boot-db3fcdad0a0ca602.js', body)
        self.assertIn(b'200 OK', head_headers)
        self.assertIn(b'\r\nDate: ', head_headers)
        self.assertEqual(head_body, b'')
        self.assertIn(f'Content-Length: {len(body)}'.encode(), head_headers)

    def test_bootstrap_is_served_and_endpoint_matches_http_identity(self):
        headers, body = self.request('GET', '/city/assets/boot-db3fcdad0a0ca602.js')
        self.assertIn(b'200 OK', headers)
        self.assertIn(b'import(new URL("main-876c7780ec66cb15.js"', body)
        _, identity = self.request('GET', '/api/identity')
        with tempfile.TemporaryDirectory() as temporary:
            endpoint = Path(temporary) / 'service.json'
            self.server.write_endpoint(endpoint)
            self.assertEqual(json.loads(endpoint.read_text()), json.loads(identity))
            self.assertEqual(json.loads(identity)['port'], 43123)

    def test_selecting_release_does_not_mix_assets_between_existing_tabs(self):
        headers, body = self.request('POST', '/api/cities/select', {'id': 'prototype-4'})
        self.assertIn(b'200 OK', headers)
        self.assertEqual(json.loads(body)['id'], 'prototype-4')
        _, old = self.request('GET', '/city/prototype-4/')
        _, newer = self.request('GET', '/city/prototype-4-5/')
        self.assertIn(b'main-b0425db495e6c873.js', old)
        self.assertIn(b'boot-db3fcdad0a0ca602.js', newer)
        headers, _ = self.request('GET', '/city/prototype-4/assets/main-876c7780ec66cb15.js')
        self.assertIn(b'404 Not Found', headers)
        _, catalog = self.request('GET', '/api/cities')
        self.assertEqual(json.loads(catalog)['selected'], 'prototype-4')

    def test_external_page_cannot_change_city_or_trigger_download(self):
        for path, data in [('/api/cities/select', {'id': 'prototype-4'}),
                           ('/api/cities/check', {'url': 'https://prototype4-5-a5be.grownowgames.workers.dev/'})]:
            headers, _ = self.request('POST', path, data, origin='https://example.com')
            self.assertIn(b'403 Forbidden', headers)
        self.assertEqual(self.server.catalog.selected, 'prototype-4-5')
        self.assertEqual(self.server.jobs.jobs, {})

    def test_unknown_release_or_invalid_url_keeps_current_city(self):
        for path, data in [('/api/cities/select', {'id': '../../etc'}),
                           ('/api/cities/check', {'url': 'http://127.0.0.1/'})]:
            headers, _ = self.request('POST', path, data)
            self.assertIn(b'400 Bad Request', headers)
        self.assertEqual(self.server.catalog.selected, 'prototype-4-5')


if __name__ == '__main__':
    unittest.main()
