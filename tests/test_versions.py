"""Release discovery and immutable snapshots, with no network or sockets."""

import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from city_versions import AdapterInspector, CityCatalog, normalise_source

ROOT = Path(__file__).resolve().parents[1]
OLD_ROOT = ROOT / 'releases/prototype-4'
NEW_URL = 'https://prototype-next.grownowgames.workers.dev/'


def fixture(root=ROOT):
    cache = root / 'cache'
    manifest = json.loads((cache / 'release-manifest.json').read_bytes())
    source = (cache / manifest['assets']['javascript']['file']).read_text()
    return manifest, source


def renamed_fixture():
    manifest, source = fixture()
    names = dict.fromkeys(re.findall(r'_0x[0-9a-f]+', source))
    mapping = {name: f'_0x{index + 0xabcdef00:x}'
               for index, name in enumerate(names)}
    source = re.sub(r'_0x[0-9a-f]+', lambda m: mapping[m[0]], source)
    manifest['release']['version'] = '0.4.6-test'
    manifest['release']['name'] = 'ASCII City future test'
    manifest['assets']['javascript']['sha256'] = hashlib.sha256(
        source.encode()).hexdigest()
    return manifest, source, mapping


class FixtureFetcher:
    def __init__(self, manifest=None, source=None):
        default, original = fixture()
        self.manifest = manifest or default
        self.source = original if source is None else source
        self.calls = []

    def get(self, base, name, limit):
        self.calls.append((base, name))
        if name == 'release-manifest.json':
            return json.dumps(self.manifest).encode()
        if name == self.manifest['assets']['javascript']['file']:
            return self.source.encode()
        return (ROOT / 'cache' / name).read_bytes()


class InspectorTests(unittest.TestCase):
    def test_both_shipped_releases_are_recognised(self):
        for root, frame in [(ROOT, '_0x49bd23'), (OLD_ROOT, '_0x37e439')]:
            manifest, source = fixture(root)
            profile = AdapterInspector().inspect(source, manifest)
            self.assertEqual(profile['frame'], frame)
            self.assertEqual(profile['support'], 'verified')
            self.assertIn('navigation', profile['adapter'])
            self.assertIn(manifest['release']['version'], profile['adapter'])

    def test_renamed_future_build_is_detected_without_a_hard_coded_hash(self):
        manifest, source, mapping = renamed_fixture()
        profile = AdapterInspector().inspect(source, manifest)
        self.assertEqual(profile['support'], 'detected')
        self.assertEqual(profile['frame'], mapping['_0x49bd23'])
        self.assertIn(mapping['_0x301107'], profile['adapter'])
        self.assertNotIn('_0x301107', profile['adapter'])

    def test_changed_or_ambiguous_renderer_is_rejected(self):
        manifest, source = fixture()
        for changed in (source.replace("'measureText'", "'unknownMeasure'"),
                        source + 'requestAnimationFrame(async function other('):
            with self.assertRaisesRegex(ValueError, 'capture support'):
                AdapterInspector().inspect(changed, manifest)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.data = Path(self.temp.name)
        self.fetcher = FixtureFetcher()
        self.catalog = CityCatalog(root=ROOT, data_dir=self.data,
                                   fetcher=self.fetcher)

    def test_switch_back_and_selection_survives_relaunch(self):
        self.assertEqual(self.catalog.list()['selected'], 'prototype-4-5')
        self.catalog.select('prototype-4')
        reloaded = CityCatalog(root=ROOT, data_dir=self.data)
        self.assertEqual(reloaded.list()['selected'], 'prototype-4')
        self.catalog.select('prototype-4-5')
        self.assertEqual(self.catalog.list()['selected'], 'prototype-4-5')
        self.assertEqual(self.fetcher.calls, [])

    def test_known_link_reuses_existing_copy_without_switching(self):
        self.catalog.select('prototype-4')
        result = self.catalog.import_url(NEW_URL)
        self.assertEqual(result['id'], 'prototype-4-5')
        self.assertEqual(self.catalog.list()['selected'], 'prototype-4')

    def test_new_compatible_build_is_downloaded_and_kept_as_its_own_snapshot(self):
        manifest, source, _ = renamed_fixture()
        self.catalog.fetcher = FixtureFetcher(manifest, source)
        added = self.catalog.import_url(NEW_URL)
        self.assertEqual(added['support'], 'detected')
        self.assertEqual(added['version'], '0.4.6-test')
        self.assertNotEqual(added['id'], 'prototype-4-5')
        self.catalog.select(added['id'])
        reloaded = CityCatalog(root=ROOT, data_dir=self.data)
        self.assertEqual(reloaded.list()['selected'], added['id'])
        current = reloaded.assets(added['id'])
        self.assertEqual(current.get(current.profile['script']), source.encode())
        previous = reloaded.assets('prototype-4-5')
        self.assertNotEqual(current.profile['build'], previous.profile['build'])
        self.assertIn('0.4.5-dn.14', previous.profile['adapter'])

    def test_release_metadata_change_is_saved_even_with_unchanged_javascript(self):
        manifest, source = fixture()
        manifest['release']['version'] = '0.4.5-css-update'
        self.catalog.fetcher = FixtureFetcher(manifest, source)
        added = self.catalog.import_url(NEW_URL)
        self.assertNotEqual(added['id'], 'prototype-4-5')
        self.assertEqual(added['version'], '0.4.5-css-update')
        self.catalog.select(added['id'])
        self.assertIn('0.4.5-css-update', self.catalog.assets(added['id']).profile['adapter'])

    def test_bad_download_does_not_change_selection_or_register_a_release(self):
        before = self.catalog.list()
        manifest, source, _ = renamed_fixture()
        self.catalog.fetcher = FixtureFetcher(manifest, source + 'corrupt')
        with self.assertRaisesRegex(ValueError, 'integrity'):
            self.catalog.import_url(NEW_URL)
        self.assertEqual(self.catalog.list(), before)

    def test_unsupported_build_can_be_listed_but_cannot_replace_working_city(self):
        manifest, source, _ = renamed_fixture()
        source = source.replace("'measureText'", "'otherMeasure'")
        manifest['assets']['javascript']['sha256'] = hashlib.sha256(
            source.encode()).hexdigest()
        self.catalog.fetcher = FixtureFetcher(manifest, source)
        added = self.catalog.import_url(NEW_URL)
        self.assertEqual(added['support'], 'unsupported')
        self.assertEqual(added['source'], NEW_URL)
        with self.assertRaisesRegex(ValueError, 'capture support'):
            self.catalog.select(added['id'])
        self.assertEqual(self.catalog.list()['selected'], 'prototype-4-5')

    def test_manifest_cannot_request_outside_paths_or_remote_assets(self):
        for invalid in ('../private', 'assets/../../private',
                        'https://other.example/main.js', '/private'):
            manifest, source, _ = renamed_fixture()
            manifest['assets']['javascript']['file'] = invalid
            self.catalog.fetcher = FixtureFetcher(manifest, source)
            with self.assertRaises(ValueError):
                self.catalog.import_url(NEW_URL)

    def test_missing_saved_selection_falls_back_to_bundled_release(self):
        self.catalog.select('prototype-4')
        (self.data / 'selection.json').write_text('{broken')
        self.assertEqual(CityCatalog(root=ROOT, data_dir=self.data).list()[
            'selected'], 'prototype-4-5')


class SourceTests(unittest.TestCase):
    def test_city_homepage_is_normalised(self):
        self.assertEqual(normalise_source(NEW_URL + 'index.html'), NEW_URL)
        self.assertEqual(normalise_source(NEW_URL.rstrip('/')), NEW_URL)

    def test_local_insecure_or_unrelated_urls_are_rejected(self):
        for value in ('file:///private', 'http://127.0.0.1/',
                      'https://example.com/',
                      'https://prototype-next.grownowgames.workers.dev:8080/',
                      'https://user:password@prototype-next.grownowgames.workers.dev/'):
            with self.assertRaises(ValueError):
                normalise_source(value)


if __name__ == '__main__':
    unittest.main()
