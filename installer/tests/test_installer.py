"""Installation policy and bundle identity without modifying Applications."""
from pathlib import Path
import plistlib
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_installer import InstallerSpec


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.app = Path(self.temporary.name) / 'ASCII-City-Capture.app'
        (self.app / 'Contents').mkdir(parents=True)
        self.info = {
            'CFBundleIdentifier': 'uk.gordonbrindle.asciicitycapture',
            'CFBundleVersion': '1.2.1',
            'CFBundleShortVersionString': '1.2.1',
            'LSMinimumSystemVersion': '12.0',
        }
        self.save_info()

    def save_info(self):
        target = self.app / 'Contents/Info.plist'
        target.write_bytes(plistlib.dumps(self.info))

    def test_fixed_destination_and_upgrade_behaviour(self):
        spec = InstallerSpec.from_app(self.app)
        self.assertEqual(spec.install_location, '/Applications')
        component, = spec.components()
        self.assertEqual(component['RootRelativeBundlePath'], self.app.name)
        self.assertFalse(component['BundleIsRelocatable'])
        self.assertTrue(component['BundleIsVersionChecked'])
        self.assertTrue(component['BundleHasStrictIdentifier'])
        self.assertEqual(component['BundleOverwriteAction'], 'upgrade')
        self.assertFalse(any('Script' in key for key in component))

    def test_package_version_and_requirements_come_from_bundled_app(self):
        spec = InstallerSpec.from_app(self.app)
        self.assertEqual(spec.version, '1.2.1')
        self.assertEqual(spec.requirements(),
                         {'arch': ['arm64'], 'os': ['12.0']})
        self.assertEqual(spec.package_id,
                         'uk.gordonbrindle.asciicitycapture.installer')

    def test_unrelated_or_inconsistent_app_is_rejected(self):
        for changes in [
            {'CFBundleIdentifier': 'com.example.other'},
            {'CFBundleVersion': 'not-a-version'},
            {'CFBundleShortVersionString': '1.1.0'},
        ]:
            original = dict(self.info)
            self.info.update(changes)
            self.save_info()
            with self.assertRaises(ValueError):
                InstallerSpec.from_app(self.app)
            self.info = original

    def test_distribution_preserves_requirements_and_system_domain(self):
        spec = InstallerSpec.from_app(self.app)
        source = '''<installer-gui-script minSpecVersion="2">
          <options customize="allow" hostArchitectures="arm64"/>
          <volume-check><allowed-os-versions><os-version min="12.0"/>
          </allowed-os-versions></volume-check>
          <choices-outline><line choice="app"/></choices-outline>
          <choice id="app"><pkg-ref id="capture"/></choice>
          <pkg-ref id="capture" version="1.2.1">capture.pkg</pkg-ref>
        </installer-gui-script>'''
        root = ET.fromstring(spec.decorate_distribution(source))
        self.assertEqual(root.find('domains').attrib, {
            'enable_anywhere': 'false', 'enable_currentUserHome': 'false',
            'enable_localSystem': 'true',
        })
        self.assertEqual(root.find('options').get('customize'), 'never')
        self.assertEqual(root.find('options').get('hostArchitectures'),
                         'arm64')
        self.assertEqual(root.find('.//os-version').get('min'), '12.0')
        self.assertEqual(root.find('title').text, 'ASCII City Capture 1.2.1')
        self.assertEqual(root.find('welcome').get('file'), 'Welcome.html')
        self.assertEqual(root.find('conclusion').get('file'),
                         'Conclusion.html')
        self.assertEqual(root.find('pkg-ref').text, 'capture.pkg')


if __name__ == '__main__':
    unittest.main()
