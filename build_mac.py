"""Build a complete Mac bundle, with no sibling-file dependencies."""

from pathlib import Path
import plistlib
import shutil
import subprocess

from release import VERSION

ROOT = Path(__file__).resolve().parent
APP = ROOT / 'ASCII-City-Capture.app'
CONTENTS = APP / 'Contents'


def build():
    payload = CONTENTS / 'Resources/runtime'
    payload.mkdir(parents=True, exist_ok=True)
    for name in ('launch.py', 'server.py', 'release.py', 'city_versions.py', 'import_jobs.py'):
        shutil.copyfile(ROOT / name, payload / name)
    for name in ('web', 'cache', 'releases'):
        if (payload / name).exists():
            shutil.rmtree(payload / name)
        shutil.copytree(ROOT / name, payload / name)
    shutil.copytree(ROOT / 'native', CONTENTS / 'Resources/launcher-source',
                    dirs_exist_ok=True)
    info = {
        'CFBundleName': 'ASCII City Capture',
        'CFBundleDisplayName': 'ASCII City Capture',
        'CFBundleIdentifier': 'uk.gordonbrindle.asciicitycapture',
        'CFBundleExecutable': 'ASCIICityCapture',
        'CFBundleVersion': VERSION,
        'CFBundleShortVersionString': VERSION,
        'CFBundleInfoDictionaryVersion': '6.0',
        'CFBundlePackageType': 'APPL',
        'LSMinimumSystemVersion': '12.0',
        'LSUIElement': True,
        'NSHighResolutionCapable': True,
    }
    (CONTENTS / 'Info.plist').write_bytes(plistlib.dumps(info))
    binary = CONTENTS / 'MacOS/ASCIICityCapture'
    binary.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['/usr/bin/clang', '-fobjc-arc', '-framework', 'Cocoa',
                    '-mmacosx-version-min=12.0', str(ROOT / 'native/Launcher.m'),
                    '-o', str(binary)], check=True)
    subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(APP)],
                   check=True)
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict',
                    str(APP)], check=True)
    print(APP)


if __name__ == '__main__':
    build()
