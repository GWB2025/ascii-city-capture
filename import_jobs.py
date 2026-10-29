"""Keep slow city downloads outside HTTP request threads."""

import secrets
import threading


class ImportJobs:
    def __init__(self, catalog):
        self.catalog = catalog
        self.lock = threading.RLock()
        self.jobs = {}
        self.active = None

    def start(self, url):
        from city_versions import normalise_source
        url = normalise_source(url)
        with self.lock:
            if self.active:
                raise ValueError('A city check is already running. Please wait for it to finish.')
            key = secrets.token_urlsafe(18)
            self.jobs[key] = {'id': key, 'status': 'checking', 'message': 'Starting city check…'}
            self.active = key
            threading.Thread(target=self.run, args=(key, url), daemon=True).start()
            return self.get(key)

    def get(self, key):
        with self.lock:
            if key not in self.jobs:
                raise ValueError('That city check is no longer available. '
                                 'Please check the URL again.')
            return dict(self.jobs[key])

    def run(self, key, url):
        def progress(message):
            with self.lock:
                self.jobs[key]['message'] = message
        try:
            entry = self.catalog.import_url(url, progress)
            result = {'status': 'complete', 'entry': entry}
        except Exception as error:
            result = {'status': 'error', 'message': str(error)}
        with self.lock:
            self.jobs[key].update(result)
            self.active = None
            while len(self.jobs) > 20:
                del self.jobs[next(iter(self.jobs))]
