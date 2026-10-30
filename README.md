# ASCII City Capture

A Mac companion for exploring ASCII City and capturing a scene with its original
characters, positions and colours. Export a PNG, filled character outlines for
printing, or visible character contours for a pen plotter.

Current capture app: **1.2.1**. Includes tested snapshots of **Prototype 4**
(`0.3.0-rc.27`) and **Prototype 4.5** (`0.4.5-dn.14`).

## Features

- Explore using the original city controls, then pause a complete frame for capture.
- Export colour PNGs and SVGs with character shapes embedded as paths.
- Prepare plotter contours with hidden strokes removed and split large scenes
  into numbered passes with matching page coordinates.
- Include district, city position, elevation, sector, street, cross, landmark,
  phone and bearing in SVG comments.
- Choose a saved city release or check a new release URL. Compatible releases
  are saved separately; switching starts a fresh session.
- Launch through a native Apple silicon app and install into Applications with
  a standard macOS installer.

Version 1.2.1 fixes the `Window.fetch: Illegal invocation` error in the version
selector. The launcher uses a verified local service address per app revision,
so older capture services do not prevent upgrades.

## Use the app

Open **ASCII-City-Capture** from Applications. Click **Capture view** (or press
**Option+C**), choose the export settings, and save. **Return to city** resumes
exploration. **City versions** changes the release; your selected version is
remembered on the next launch.

See [the user guide](README.txt) for colour modes, plotting multiple passes,
fonts and city-version compatibility.

## Requirements

- Apple silicon Mac with macOS 12 or later for the packaged app.
- Python 3.9 or later; the server uses the standard library.
- A local Courier New or DejaVu Sans Mono font.
- Google Chrome is the preferred browser.
- Apple's command-line developer tools to build the native launcher and installer.
- Node.js for JavaScript tests. The separate DOM and city replay tests also need
  `jsdom` and `@napi-rs/canvas` as described in the validation notes.

Fonts, Python and Chrome are not redistributed by the installer. The existing
app signature is ad-hoc; the installer is unsigned and is not Apple-notarised.

## Run from source

```sh
python3 launch.py
```

To validate both bundled city releases without starting a server or browser:

```sh
python3 launch.py --check --data-dir /tmp/ascii-city-capture-check
```

## Build the Mac app and installer

From the repository root:

```sh
python3 build_mac.py
python3 installer/build_installer.py \
  --app ASCII-City-Capture.app \
  --output dist/ASCII-City-Capture-1.2.1-Installer.pkg
```

The second command also creates an installer ZIP and checks the expanded package.
The installer targets `/Applications/ASCII-City-Capture.app`, replaces an older
copy at that location, and protects newer app versions. User data remains in
`~/Library/Application Support/ASCII City Capture`.

Build products, local dependencies and captured output are ignored by Git.

## Test

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m unittest discover -s installer/tests -p 'test_*.py'
node --test tests/geometry.test.mjs tests/navigation.test.mjs \
  tests/session.test.mjs tests/fetch.test.mjs
```

The default checks cover release integrity, version selection, download jobs,
HTTP routes, launcher behaviour, SVG geometry/navigation, iframe session isolation,
the browser-fetch regression and installer policy. They do not operate a plotter.

[App validation notes](VALIDATION.txt) and
[installer validation notes](installer/VALIDATION.txt) distinguish automated,
isolated replay and package checks from unverified interactive Mac behaviour.

## Source layout

| Path | Purpose |
| --- | --- |
| `web/` | Capture interface, drawing bridge, adapters and SVG geometry |
| `server.py`, `city_versions.py`, `import_jobs.py` | Local server, release catalogue and compatibility checks |
| `launch.py`, `native/`, `build_mac.py` | Runtime preparation and native Mac launcher |
| `installer/` | Installer builder, tests and instructions |
| `cache/`, `releases/` | Original tested upstream city snapshots |
| `tests/` | Unit, integration and replay tests |

## Attribution and licences

ASCII City is by **Grow Now! Games**. This companion does not claim authorship
of the city or reconstruction of its original source project. Original city
assets remain unchanged; capture instrumentation is applied when the local
server serves the app.

This repository is private. It includes the tested upstream snapshots for
reproducible builds; no permission to redistribute those assets is implied.
See [third-party notices](THIRD_PARTY_NOTICES.md). No project-wide open-source
licence has been selected for the companion itself.

## AI assistance

This project includes contributions developed by Gordon Brindle with assistance
from OpenAI's ChatGPT, particularly with software implementation and
documentation. Gordon directs the project and makes the final design and
development decisions.
