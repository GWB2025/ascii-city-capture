ASCII CITY CAPTURE — version 1.2.1 / selectable ASCII City releases

GET STARTED

1. Double-click ASCII-City-Capture.app. You may move the app to Applications.
2. The companion opens in Chrome. Click inside the city and explore normally.
3. Choose Capture view, or press Option+C while exploring. The city pauses.
4. Choose Pen plotter or Printer, paper size, margins, drawing size and ink.
5. Save the SVG. Return to city resumes the same session.

UPDATING FROM AN EARLIER VERSION

Version 1.2.1 fixes the browser error: Failed to execute 'fetch' on 'Window':
Illegal invocation. It prevented the version list and initial city from loading.
Close the old capture tab and open the newly downloaded app. Its new window
should show Capture 1.2.1 in the toolbar. A Mac restart is not required.

Unzip the new download and open the app from that new folder (or replace your
copy in Applications). The toolbar identifies the selected city and Capture 1.2.1.
This update starts alongside older capture services: a restart is not required
to clear the previous "older capture service is still running" message.
Use the new window opened by this app; an older browser tab still has its older
city session. Previously saved SVGs are unchanged.

No Terminal commands, extensions or extra Python packages are needed for normal
use on this Apple Silicon Mac. Python 3.9 or newer is required and is already
installed here. The application is now self-contained: all its code and city
files are inside the .app. No neighbouring files or folders are required.
An Opening window appears during startup. If startup fails, an error dialog
shows the reason instead of silently closing.

Version 1.0.1 replaces the first version's shell launcher with a native Mac
launcher. It copies its runtime to a stable per-user location before starting,
so moving the .app or macOS relocating a downloaded app does not break references
to the city files. The downloaded app bundle itself remains unchanged.

The companion chooses an available local address and opens it automatically.
It remembers that address and reuses its own server on later launches. If that
port is occupied by a different service, it chooses another without stopping
the existing process. Closing the browser tab closes that city session; the
small local server remains available until the Mac restarts. Opening the app
never connects to USB or moves your plotter.

CITY VERSIONS

Click City versions in the top toolbar.

• To return to an earlier release, choose Use this version beside its name.
• To add a release, paste its full website URL, choose Check and add, then
  choose Use this version when it appears in the saved list.
• To check an updated website again, paste the same URL again. A changed release
  is saved as a separate copy; the earlier copy remains available.

Prototype 4 (0.3.0-rc.27) and Prototype 4.5 (0.4.5-dn.14) are included and tested.
Your choice is remembered when you reopen the app. Switching starts a new city
session: the current position/view is reset. This does not resume an old journey.
Previously downloaded SVGs and PNGs are unaffected.

Add accepts HTTPS release links hosted by grownowgames.workers.dev. It checks
the release manifest, file hashes and known capture/navigation conventions.
If only the internal JavaScript names have changed, the adapter is generated
automatically. A new build is labelled Capture detected; check its first preview.
If the renderer or navigation conventions changed too much, the app reports
that capture support needs updating. That build cannot replace your working
version. Compatibility with every future city release cannot be guaranteed.

Saved city snapshots are kept separately from the app, so updating the capture
app does not discard them. Their core files are stored locally; optional music
may still require its original website. New releases are added only when you
supply a URL, and are opened only when you choose Use this version.
There is no automatic latest-version search or automatic switching.

PROTOTYPE 4.5

Version 1.1.0 bundles the new city release 0.4.5-dn.14 from the 4.5 website.
It preserves the original startup progress display and waits for the city to
finish loading before enabling Capture view. Day/night rendering, the scrolling
navigation panel and the original city controls remain available. Colour PNG
and SVG captures include the new sky and scene colours.

The city clock obtains its HTTP time from the local companion server, so it
follows this Mac's system clock. Keep the Mac's date and time set correctly.
Prototype 4.5 is the initial default. City versions lets you explicitly change
the release after compatibility checks.

CAPTURES AND EXPORTS

The city is a separate local session. A view open on the original website is not
automatically transferred. Use the normal city controls, telephone relays, taxis,
sky taxis and monorail within the capture session. Those features use the original
city code; this companion changes its rendering and adds capture controls.

Only the city scene canvas is captured. The navigation interface, capture toolbar
and previews do not appear in exported images.

The app automatically includes a readable XML comment near the top of every
saved SVG: District, City Pos, Elevation, Sector, Street, Cross, Landmark, Phone
and Bearing, together with the city release, capture time (UTC) and area. Landmark and Phone
include the distance and direction shown by the city. Values are taken from the
captured frame, before the city resumes, using the full, untruncated navigation
values. The comments do not print or produce pen strokes. They are present in
both print and plotter SVGs, including every numbered part of a split export.
The same information is also included in the SVG's structured metadata.

Fields unavailable in that area (for example exterior streets while indoors)
are marked Not available rather than reusing a previous location. Elevation
follows the city display: terrain height on foot, or altitude and height above
ground (AGL) during flight. This addition applies to SVG exports, not PNG files.

Printer: filled character outlines, original drawing positions, colours and
layering. Choose Colour and Include scene background for the full scene. Black
or an unchecked background gives a white-paper version. These SVGs contain their
character outlines and do not need the font installed on the printing computer.

Pen plotter: visible character contours as plain paths, with opaque overdraw
removed. Backgrounds do not become pen strokes. Curves are approximated within
0.045 scene pixels. This is a contour drawing, not a single-stroke typeface or a
shaded reproduction. Translucent effects become solid pen outlines. Very fine
details may merge with a broad pen; the preview reflects the selected pen width.
Colour mode maps the scene to six pen colours.

Detailed scenes automatically save as a ZIP of numbered SVG parts. Every part
uses the same coordinates, and the combined preview shows the complete drawing.
This keeps each file within the existing SVG Plotter's size and sampling limits.

In SVG Plotter, for EVERY part select:
  Page placement -> Keep original size and position -> Apply placement
Keep the sheet fixed and the same origin throughout. Finish each part before
loading the next. Do not fit or centre the separate parts independently.
For the T-A4's 210 x 297 mm drawing area, use A4 portrait or smaller paper.

Save captured image downloads the scene canvas as a PNG. It preserves the on-screen
character rendering but is a raster image, not a plotting file.

FONT AND CITY RELEASE

The city and SVG exporter both use the same local font. On this Mac that is
Courier New, one of the original city's declared fallback fonts. DejaVu Sans
Mono is used on systems without Courier New. Font files are read from the local
computer and are not included in this package.

Included city releases from Grow Now Games:
Prototype 4.5 — 0.4.5-dn.14
https://prototype4-5-a5be.grownowgames.workers.dev/
Prototype 4 — 0.3.0-rc.27
https://prototype4-1d81.grownowgames.workers.dev/

Original city code and assets remain the work of their respective authors. This
is a separate capture companion, not a claim to authorship of the city or a
reconstruction of its original source project. Original asset files are retained
unchanged in cache. An adapter is applied only when serving the local copy.
Release hashes and drawing conventions are checked before adapting the renderer.
An incompatible release is kept out of the running city.

The cached city starts without downloading additional packages. Optional music
is fetched from the original site on first use and then cached.

VALIDATION AND LIMITS

Automated geometry tests cover opaque and partial occlusion, holes in glyphs,
canvas clipping, draw validation, page placement and export structure. A full
captured city scene is checked for character preservation, split-file size,
sampling budgets and complete path coverage across all parts. ZIP integrity is
also checked independently.

An isolated replay of the actual city code and bootstrap verifies startup,
day/night scenes and sky, capture, pause, resume, keyboard movement and mouse
look. Navigation comments match the city's own renderer in all four captures.
It is not a live browser or physical plotter test. Journeys through every
transport system have not been independently tested.

The development environment blocked binding a local web server and blocked
local-file browser previews. A live Chrome smoke test on this Mac therefore
remains pending. Captures should be checked in the preview and SVG
Plotter before starting a physical drawing. See VALIDATION.txt for results.

If opening the app fails, the error is also recorded in launcher.log and
server.log inside:
  ~/Library/Application Support/ASCII City Capture/logs/
If the page was already open before restarting the server, reload the page.

DEVELOPMENT

The native launcher is built from native/Launcher.m using build_mac.py. The
companion server uses only Python's standard library. OpenType.js 1.3.4 is
vendored with its licence in web/vendor. Tests use Node's built-in test runner:
  node --test tests/geometry.test.mjs tests/navigation.test.mjs tests/session.test.mjs tests/fetch.test.mjs
  python3 -m unittest discover -s tests -p 'test_*.py'

tests/full-scene.mjs accepts a capture JSON file and a TTF font path.
tests/replay.mjs is an isolated integration harness requiring jsdom and
@napi-rs/canvas, with CITY_TEST_ROOT and CAPTURE_TEST_ROOT naming its fixtures.
CITY_TEST_ROOT contains the original 4.5 HTML, manifest and hashed assets;
CAPTURE_TEST_ROOT contains the production bridge.js and city-adapter.js.
The harness observes navigation before line wrapping and controls the simulated
clock/camera only in the test; those test controls are not installed in the app.
It does not control a browser or a physical plotting machine.

Version-selector DOM tests: tests/versions-ui.test.mjs (requires jsdom).
Multi-release replay: tests/replay-versions.mjs (jsdom + @napi-rs/canvas).
Its CAPTURE_TEST_ROOT contains bridge.js and a generated profile.json;
CITY_TEST_ROOT contains the selected release cache. RENAMED=1 exercises the
synthetic future build, with renamed identifiers and its matching profile.
The synthetic build is test-only and is not offered as a real city release.

AI ASSISTANCE

This project includes contributions developed by Gordon Brindle with assistance
from OpenAI's ChatGPT, particularly with software implementation and
documentation. Gordon directs the project and makes the final design and
development decisions.
