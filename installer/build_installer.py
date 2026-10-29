"""Build a standard macOS installer for the unchanged Capture app bundle."""

import argparse
from dataclasses import dataclass
import hashlib
from html import escape
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
APP_NAME = 'ASCII-City-Capture.app'
BUNDLE_ID = 'uk.gordonbrindle.asciicitycapture'


@dataclass(frozen=True)
class InstallerSpec:
    app: Path
    version: str
    minimum_os: str
    install_location: str = '/Applications'
    package_id: str = BUNDLE_ID + '.installer'

    @classmethod
    def from_app(cls, app):
        app = Path(app).resolve()
        info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
        version = info.get('CFBundleVersion', '')
        minimum_os = info.get('LSMinimumSystemVersion', '')
        if (info.get('CFBundleIdentifier') != BUNDLE_ID
                or not re.fullmatch(r'\d+\.\d+\.\d+', version)
                or info.get('CFBundleShortVersionString') != version
                or not re.fullmatch(r'\d+\.\d+(?:\.\d+)?', minimum_os)):
            raise ValueError(
                'The source must be a complete ASCII City Capture bundle '
                'with consistent version information.')
        return cls(app, version, minimum_os)

    def components(self):
        return [{
            'RootRelativeBundlePath': APP_NAME,
            'BundleIsRelocatable': False,
            'BundleIsVersionChecked': True,
            'BundleHasStrictIdentifier': True,
            'BundleOverwriteAction': 'upgrade',
        }]

    def requirements(self):
        return {'arch': ['arm64'], 'os': [self.minimum_os]}

    def decorate_distribution(self, source):
        root = ET.fromstring(source)
        for name in ('title', 'welcome', 'conclusion', 'domains'):
            for element in root.findall(name):
                root.remove(element)
        title = ET.SubElement(root, 'title')
        title.text = 'ASCII City Capture ' + self.version
        ET.SubElement(root, 'welcome', {'file': 'Welcome.html'})
        ET.SubElement(root, 'conclusion', {'file': 'Conclusion.html'})
        ET.SubElement(root, 'domains', {
            'enable_anywhere': 'false',
            'enable_currentUserHome': 'false',
            'enable_localSystem': 'true',
        })
        options = root.find('options')
        if options is None:
            options = ET.SubElement(root, 'options')
        options.set('customize', 'never')
        options.set('hostArchitectures', 'arm64')
        options.set('require-scripts', 'false')
        return ET.tostring(root, encoding='unicode', xml_declaration=True)


class InstallerBuilder:
    """Write only a staging directory and output file, never Applications."""

    def __init__(self, spec):
        self.spec = spec

    @staticmethod
    def run(arguments, **kwargs):
        return subprocess.run([str(value) for value in arguments], check=True,
                              **kwargs)

    @staticmethod
    def page(title, body):
        return ('<!doctype html><html lang="en-GB"><meta charset="utf-8">'
                '<style>body{font:14px -apple-system,Helvetica,sans-serif;'
                'line-height:1.5;padding:14px;color:#222}'
                'h1{font-size:24px;font-weight:500}li{margin:10px 0}'
                '</style><title>' + escape(title) + '</title><h1>'
                + escape(title) + '</h1>' + body + '</html>')

    def resources(self, destination):
        destination.mkdir()
        version = escape(self.spec.version)
        welcome = self.page('ASCII City Capture ' + self.spec.version,
                            '<p>This installer places ASCII City Capture in '
                            '<strong>Applications</strong> for all users.</p>'
                            '<p>It includes the fix for the browser '
                            '“Illegal invocation” error, the City versions '
                            'selector, colour capture and SVG export.</p>'
                            '<p>Choose <strong>Continue</strong>, then '
                            '<strong>Install</strong>. macOS may ask for an '
                            'administrator password.</p>'
                            '<p>Requires an Apple silicon Mac, macOS '
                            + escape(self.spec.minimum_os)
                            + ' or later, and Python 3.9 or later. '
                            'Google Chrome is the preferred browser.</p>')
        conclusion = self.page('Ready to explore',
                               '<ol><li>Close any older capture browser tab.'
                               '</li><li>Open <strong>Finder → Applications → '
                               'ASCII-City-Capture</strong>.</li>'
                               '<li>The toolbar should show '
                               '<strong>Capture ' + version + '</strong>.</li>'
                               '</ol><p>Use <strong>City versions</strong> to '
                               'choose a release, then explore and capture '
                               'a view.</p><p>Your saved city releases are '
                               'kept in your existing user data folder.</p>')
        (destination / 'Welcome.html').write_text(welcome)
        (destination / 'Conclusion.html').write_text(conclusion)

    def build(self, output):
        output = Path(output).resolve()
        if output.suffix != '.pkg' or output.is_relative_to(self.spec.app):
            raise ValueError('Choose a .pkg output path outside the app.')
        self.run(['/usr/bin/codesign', '--verify', '--deep', '--strict',
                  self.spec.app])
        binary = self.spec.app / 'Contents/MacOS/ASCIICityCapture'
        arches = self.run(['/usr/bin/lipo', '-archs', binary],
                          capture_output=True, text=True).stdout.split()
        if arches != ['arm64']:
            raise ValueError('This installer is for the Apple silicon build.')
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='capture-installer-') as temp:
            stage = Path(temp)
            payload = stage / 'payload'
            payload.mkdir()
            shutil.copytree(self.spec.app, payload / APP_NAME, symlinks=True)
            components = stage / 'components.plist'
            components.write_bytes(plistlib.dumps(self.spec.components()))
            product = stage / 'requirements.plist'
            product.write_bytes(plistlib.dumps(self.spec.requirements()))
            component = stage / 'capture.pkg'
            self.run(['/usr/bin/pkgbuild', '--root', payload,
                      '--component-plist', components, '--identifier',
                      self.spec.package_id, '--version', self.spec.version,
                      '--install-location', self.spec.install_location,
                      '--ownership', 'recommended', component])
            distribution = stage / 'Distribution.xml'
            self.run(['/usr/bin/productbuild', '--synthesize', '--product',
                      product, '--package', component, distribution])
            distribution.write_text(self.spec.decorate_distribution(
                distribution.read_text()))
            resources = stage / 'Resources'
            self.resources(resources)
            self.run(['/usr/bin/productbuild', '--distribution', distribution,
                      '--resources', resources, '--package-path', stage,
                      output])
        return output

    @staticmethod
    def contents(root):
        result = {}
        for path in sorted(root.rglob('*')):
            if path.is_symlink():
                value = 'link:' + os.readlink(path)
            elif path.is_file():
                value = hashlib.sha256(path.read_bytes()).hexdigest()
            else:
                continue
            result[str(path.relative_to(root))] = value
        return result

    def verify(self, package):
        """Inspect the entire payload without performing an installation."""
        with tempfile.TemporaryDirectory(prefix='capture-pkg-check-') as temp:
            temp = Path(temp)
            expanded = temp / 'expanded'
            self.run(['/usr/sbin/pkgutil', '--expand-full', package, expanded])
            info = ET.parse(expanded / 'capture.pkg/PackageInfo').getroot()
            assert info.get('install-location') == self.spec.install_location
            assert info.get('identifier') == self.spec.package_id
            assert info.get('version') == self.spec.version
            assert info.find('scripts') is None
            app = expanded / 'capture.pkg/Payload' / APP_NAME
            assert self.contents(app) == self.contents(self.spec.app)
            assert {path.name for path in app.parent.iterdir()} == {APP_NAME}
            assert os.access(app / 'Contents/MacOS/ASCIICityCapture', os.X_OK)
            distribution = ET.parse(expanded / 'Distribution').getroot()
            domains = distribution.find('domains')
            options = distribution.find('options')
            minimum_os = distribution.find('.//os-version').get('min')
            assert domains.get('enable_localSystem') == 'true'
            assert options.get('hostArchitectures') == 'arm64'
            assert minimum_os == self.spec.minimum_os
            assert info.get('relocatable') == 'false'
            assert info.get('auth') == 'root'
            assert info.find('upgrade-bundle/bundle').get('id') == BUNDLE_ID
            assert info.find('strict-identifier/bundle').get('id') == BUNDLE_ID
            self.run(['/usr/bin/codesign', '--verify', '--deep', '--strict',
                      app])
            self.run([app / 'Contents/MacOS/ASCIICityCapture', '--self-test'])
            self.run(['python3', app / 'Contents/Resources/runtime/launch.py',
                      '--check', '--data-dir', temp / 'user-data'],
                     env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
            return {'version': self.spec.version,
                    'destination': self.spec.install_location + '/' + APP_NAME,
                    'payload_files': len(self.contents(app)),
                    'payload_matches_app': True,
                    'installation_performed': False}

    def archive(self, package):
        """Keep the installer and its reproducible source in one download."""
        archive = package.with_suffix('.zip')
        prefix = 'ASCII-City-Capture-Installer/'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
            output.write(package, prefix + package.name)
            output.write(ROOT / 'README.txt', prefix + 'READ-ME-FIRST.txt')
            for name in ('build_installer.py', 'VALIDATION.txt'):
                output.write(ROOT / name, prefix + 'Source/' + name)
            output.write(ROOT / 'README.txt', prefix + 'Source/README.txt')
            for file in (ROOT / 'tests').glob('*.py'):
                output.write(file, prefix + 'Source/tests/' + file.name)
        with zipfile.ZipFile(archive) as checked:
            assert checked.testzip() is None
            assert checked.read(prefix + package.name) == package.read_bytes()
        return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    arguments = parser.parse_args()
    builder = InstallerBuilder(InstallerSpec.from_app(arguments.app))
    package = builder.build(arguments.output)
    result = builder.verify(package)
    result['download'] = str(builder.archive(package))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
