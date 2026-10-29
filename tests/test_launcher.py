"""Regression tests for moving the app and starting from read-only resources."""

import json
import io
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from launch import Launcher, ROOT
from server import CityAssets
from release import VERSION


class LauncherTests(unittest.TestCase):
    def test_runtime_is_self_contained_and_reused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle = root / 'Moved App.app/Contents/Resources/runtime'
            bundle.mkdir(parents=True)
            for name in ('server.py', 'release.py', 'city_versions.py', 'import_jobs.py'):
                shutil.copyfile(ROOT / name, bundle / name)
            for name in ('web', 'cache', 'releases'):
                shutil.copytree(ROOT / name, bundle / name)
            launcher = Launcher(root=bundle, data_dir=root / 'user-data')
            installed = launcher.prepare_runtime()
            self.assertTrue((installed / 'web/index.html').is_file())
            self.assertNotEqual(installed, bundle)
            self.assertEqual(installed, launcher.prepare_runtime())
            self.assertFalse((bundle / 'logs').exists())
            shutil.rmtree(bundle.parent.parent.parent)
            assets = CityAssets(root=installed)
            assets.validate()
            self.assertIn(b'/bridge.js', assets.html())

    def test_invalid_package_is_reported_before_start(self):
        with tempfile.TemporaryDirectory() as temporary:
            launcher = Launcher(root=Path(temporary), data_dir=Path(temporary) / 'user')
            with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                launcher.prepare_runtime()

    def test_check_does_not_open_sockets_or_browser(self):
        with tempfile.TemporaryDirectory() as temporary:
            launcher = Launcher(data_dir=temporary)
            with patch.object(launcher, 'running', side_effect=AssertionError('No sockets')):
                result = launcher.check()
            self.assertEqual(result['status'], 'ready')
            self.assertEqual(result['version'], VERSION)

    def test_downloads_do_not_modify_bundle(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            packaged = root / 'package/cache'
            packaged.mkdir(parents=True)
            (packaged / 'file').write_bytes(b'packaged')
            downloaded = root / 'user/downloads'
            downloaded.mkdir(parents=True)
            (downloaded / 'music.mp3').write_bytes(b'music')
            assets = CityAssets(root=root / 'package', cache_dir=downloaded)
            self.assertEqual(assets.get('file'), b'packaged')
            self.assertEqual(assets.get('music.mp3'), b'music')
            self.assertFalse((packaged / 'music.mp3').exists())
            with self.assertRaises(ValueError):
                assets.get('../outside')


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.launcher = Launcher(data_dir=self.root)
        self.launcher.runtime = self.root / 'runtime/1.1.0-test'
        self.launcher.runtime.mkdir(parents=True)
        self.launcher.opener = Mock()

    def endpoint(self, **changes):
        return {'service': 'ascii-city-capture', 'version': VERSION,
                'revision': '1.1.0-test', 'instance': 'this-service',
                'port': 43123, **changes}

    def save_endpoint(self, record):
        path = self.launcher.endpoint_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record))

    def test_new_release_does_not_contact_the_old_fixed_port(self):
        self.assertFalse(self.launcher.running())
        self.launcher.opener.open.assert_not_called()

    def test_saved_matching_service_is_reused(self):
        self.save_endpoint(self.endpoint())
        self.launcher.opener.open.return_value = io.StringIO(
            json.dumps(self.endpoint()))
        self.assertTrue(self.launcher.running())
        self.assertEqual(self.launcher.url, 'http://127.0.0.1:43123/')

    def test_reused_port_cannot_be_mistaken_for_our_service(self):
        self.save_endpoint(self.endpoint())
        self.launcher.opener.open.return_value = io.StringIO(
            json.dumps(self.endpoint(instance='someone-else')))
        self.assertFalse(self.launcher.running())

    def test_invalid_endpoint_does_not_make_a_network_request(self):
        for port in (True, -1, 0, 65536, '43123'):
            self.save_endpoint(self.endpoint(port=port))
            self.assertFalse(self.launcher.running())
        self.launcher.opener.open.assert_not_called()

    def test_new_service_uses_an_os_allocated_port_and_saves_its_address(self):
        def spawn(arguments, **kwargs):
            self.assertEqual(arguments[arguments.index('--port') + 1], '0')
            ready = Path(arguments[arguments.index('--ready-file') + 1])
            instance = arguments[arguments.index('--instance') + 1]
            record = self.endpoint(instance=instance)
            ready.write_text(json.dumps(record))
            self.launcher.opener.open.return_value = io.StringIO(
                json.dumps(record))
            return Mock(poll=Mock(return_value=None))

        with patch.object(self.launcher, 'prepare_runtime',
                          return_value=self.launcher.runtime), \
                patch('launch.subprocess.Popen', side_effect=spawn) as process:
            self.launcher.start(open_browser=False)
        self.assertEqual(process.call_count, 1)
        self.assertEqual(self.launcher.url, 'http://127.0.0.1:43123/')
        self.assertEqual(json.loads(self.launcher.endpoint_path.read_text())['port'], 43123)

    def test_occupied_saved_port_falls_back_without_stopping_another_process(self):
        self.save_endpoint(self.endpoint())
        self.launcher.opener.open.side_effect = OSError('No current service')
        launched = []

        def spawn(arguments, **kwargs):
            port = int(arguments[arguments.index('--port') + 1])
            launched.append(port)
            if port:
                return Mock(poll=Mock(return_value=75))
            record = self.endpoint(
                instance=arguments[arguments.index('--instance') + 1], port=43124)
            Path(arguments[arguments.index('--ready-file') + 1]).write_text(json.dumps(record))
            self.launcher.opener.open.side_effect = None
            self.launcher.opener.open.return_value = io.StringIO(json.dumps(record))
            return Mock(poll=Mock(return_value=None))

        with patch.object(self.launcher, 'prepare_runtime',
                          return_value=self.launcher.runtime), \
                patch('launch.subprocess.Popen', side_effect=spawn):
            self.launcher.start(open_browser=False)
        self.assertEqual(launched, [43123, 0])
        self.assertEqual(self.launcher.url, 'http://127.0.0.1:43124/')


if __name__ == '__main__':
    unittest.main()
