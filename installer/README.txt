ASCII CITY CAPTURE 1.2.1 — MAC INSTALLER

INSTALL

1. Double-click ASCII-City-Capture-1.2.1-Installer.pkg.
2. Follow the macOS Installer: Continue, then Install.
3. Enter your Mac administrator password if requested.
4. Close any older capture browser tab.
5. Open Finder > Applications > ASCII-City-Capture.

The toolbar should say Capture 1.2.1. The installer places the complete app at:
  /Applications/ASCII-City-Capture.app
An older copy at that location is replaced. The installer will not downgrade a
newer app. Saved city versions stay in their existing Application Support folder.

This is the same 1.2.1 app with the fix for the browser's “Illegal invocation”
error. Includes Prototype 4 and 4.5, the version selector, colour capture and SVG
navigation comments. No Mac restart is required.

REQUIREMENTS

Apple silicon Mac, macOS 12 or later, Python 3.9 or later. Python is already
present on Gordon's Mac. Google Chrome is the preferred browser. The installer
places the existing app; it does not install Python or Chrome.

OPENING THE INSTALLER

This privately built installer is unsigned and has not been notarised by Apple.
If macOS blocks it because the developer cannot be verified, review the warning.
If you choose to open this download, Apple's documented option is:
  System Settings > Privacy & Security > Open Anyway
This appears after trying to open the installer. Confirm only for the intended
ASCII City Capture installer. Do not disable macOS security globally.
Apple guidance: https://support.apple.com/en-gb/102445

SOURCE AND CHECKS

The Source folder contains the installer builder and tests. It is not needed to
install or use the app. The app's own source is retained in the separate full
ASCII-City-Capture-Mac-v1.zip download.

To rebuild on a development Mac with Apple's command-line tools:
  python3 build_installer.py --app /path/to/ASCII-City-Capture.app --output /path/to/ASCII-City-Capture-1.2.1-Installer.pkg
Run the installer policy tests:
  python3 -m unittest discover -s tests -p 'test_*.py'

The builder verifies its expanded package and creates an accompanying ZIP.
See Source/VALIDATION.txt for what was checked.

AI ASSISTANCE

This project includes contributions developed by Gordon Brindle with assistance
from OpenAI's ChatGPT, particularly with software implementation and
documentation. Gordon directs the project and makes the final design and
development decisions.
