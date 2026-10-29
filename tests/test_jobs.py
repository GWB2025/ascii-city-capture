"""Download job lifecycle; callers can poll without blocking the city."""
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_jobs import ImportJobs

URL = 'https://prototype-next.grownowgames.workers.dev/'


class JobTests(unittest.TestCase):
    def test_progress_success_and_concurrent_check_rejection(self):
        catalog = Mock()
        def run(url, progress):
            progress('Saving city files…')
            return {'id': 'future', 'support': 'detected'}
        catalog.import_url.side_effect = run
        jobs = ImportJobs(catalog)
        with patch('import_jobs.threading.Thread') as thread:
            first = jobs.start(URL)
            self.assertEqual(first['status'], 'checking')
            with self.assertRaisesRegex(ValueError, 'already running'):
                jobs.start(URL)
            thread.assert_called_once()
            thread.call_args.kwargs['target'](*thread.call_args.kwargs['args'])
        result = jobs.get(first['id'])
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['entry']['id'], 'future')
        self.assertEqual(result['message'], 'Saving city files…')
        self.assertIsNone(jobs.active)

    def test_failure_can_be_retrieved_and_does_not_block_another_check(self):
        catalog = Mock()
        catalog.import_url.side_effect = OSError('Website unavailable')
        jobs = ImportJobs(catalog)
        with patch('import_jobs.threading.Thread') as thread:
            first = jobs.start(URL)
            thread.call_args.kwargs['target'](*thread.call_args.kwargs['args'])
            self.assertEqual(jobs.get(first['id'])['status'], 'error')
            self.assertEqual(jobs.get(first['id'])['message'], 'Website unavailable')
            self.assertNotEqual(jobs.start(URL)['id'], first['id'])
        catalog.select.assert_not_called()
