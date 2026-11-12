"""Download boundaries must be enforced before any file or network access."""
import hashlib
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('download_pipeline', pathlib.Path(__file__).with_name('pipeline.py'))
pipeline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pipeline)
download = pipeline.public_download
URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv'
CDN = 'release-assets.githubusercontent.com'


def response(status=200, data=b'csv', location=None):
    return Mock(status=status, read=Mock(return_value=data), getheader=Mock(return_value=location))


class PublicDownloadTests(unittest.TestCase):
    def fetch(self, url=URL, **overrides):
        options = dict(allowed_urls={URL}, maximum=10, user_agent='GTL-test',
                       redirect_hosts={CDN})
        options.update(overrides)
        return download.fetch_public_bytes(url, **options)

    def test_exact_url_uses_verified_https_and_bounded_read(self):
        reply = response(data=b'0123456789')
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value = reply
            self.assertEqual(self.fetch(), b'0123456789')
            connection.assert_called_once_with('github.com', timeout=60)
            connection.return_value.request.assert_called_once_with(
                'GET', '/nflverse/nflverse-data/releases/download/schedules/games.csv',
                headers={'User-Agent': 'GTL-test'})
            reply.read.assert_called_once_with(11)
            connection.return_value.close.assert_called_once()

    def test_unapproved_initial_urls_never_connect(self):
        for url in ('file:///etc/passwd', 'http://127.0.0.1/',
                    'https://169.254.169.254/', URL + '?extra=1',
                    'https://' + CDN + '/unreviewed'):
            with self.subTest(url=url), patch.object(download.http.client, 'HTTPSConnection') as connection:
                with self.assertRaises(ValueError):
                    self.fetch(url)
                connection.assert_not_called()

    def test_malformed_allowlist_url_still_cannot_bypass_https_validation(self):
        for url in ('file:///etc/passwd', 'ftp://github.com/a', 'http://github.com/a',
                    'https://user:password@github.com/a', 'https://github.com:8443/a',
                    'https://github.com/a#fragment', ' https://github.com/a',
                    'https://github.com/\npath', 'https://github.com\\evil/a'):
            with self.subTest(url=url), patch.object(download.http.client, 'HTTPSConnection') as connection:
                with self.assertRaises(ValueError):
                    self.fetch(url, allowed_urls={url})
                connection.assert_not_called()

    def test_github_asset_redirect_preserves_signed_query(self):
        redirect = response(302, location=f'https://{CDN}/asset.csv?sig=a%2Bb&se=123')
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.side_effect = [redirect, response()]
            self.assertEqual(self.fetch(), b'csv')
            self.assertEqual(connection.call_args_list[-1].args, (CDN,))
            connection.return_value.request.assert_called_with(
                'GET', '/asset.csv?sig=a%2Bb&se=123', headers={'User-Agent': 'GTL-test'})
            self.assertEqual(connection.return_value.close.call_count, 2)
            redirect.read.assert_not_called()

    def test_redirects_cannot_escape_https_or_allowed_destinations(self):
        for destination in ('file:///etc/passwd', 'http://' + CDN + '/a',
                            'https://127.0.0.1/', 'https://169.254.169.254/latest/',
                            'https://' + CDN + '.evil.example/a',
                            'https://evil.example/', '//evil.example/',
                            'https://user@' + CDN + '/a', 'https://' + CDN + ':444/a',
                            'https://' + CDN + '/a#frag', '\nhttps://' + CDN + '/a',
                            'https://' + CDN + '\\evil/a', '/unapproved-path'):
            with self.subTest(destination=destination), patch.object(download.http.client, 'HTTPSConnection') as connection:
                connection.return_value.getresponse.return_value = response(302, location=destination)
                with self.assertRaises(ValueError):
                    self.fetch()
                connection.assert_called_once()
                connection.return_value.close.assert_called_once()

    def test_every_redirect_hop_is_validated(self):
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.side_effect = [
                response(302, location=f'https://{CDN}/a'),
                response(307, location='https://127.0.0.1/private')]
            with self.assertRaises(ValueError):
                self.fetch()
            self.assertEqual(connection.call_count, 2)

    def test_redirects_are_opt_in(self):
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value = response(302, location=f'https://{CDN}/a')
            with self.assertRaises(ValueError):
                self.fetch(redirect_hosts=())
            connection.assert_called_once()

    def test_redirect_loops_stop_after_five_hops(self):
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value = response(302, location=URL)
            with self.assertRaisesRegex(ValueError, 'too many redirects'):
                self.fetch()
            self.assertEqual(connection.call_count, 6)
            self.assertEqual(connection.return_value.close.call_count, 6)

    def test_bad_status_or_missing_location_is_rejected(self):
        for status in (204, 206, 302, 400, 404, 500):
            with self.subTest(status=status), patch.object(download.http.client, 'HTTPSConnection') as connection:
                reply = response(status)
                connection.return_value.getresponse.return_value = reply
                with self.assertRaises(ValueError):
                    self.fetch()
                reply.read.assert_not_called()
                connection.return_value.close.assert_called_once()

    def test_oversize_download_is_rejected(self):
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value = response(data=b'x' * 11)
            with self.assertRaisesRegex(ValueError, 'size limit'):
                self.fetch()
            connection.return_value.close.assert_called_once()

    def test_invalid_size_limit_never_connects(self):
        for maximum in (None, True, 0, -1, 1.5):
            with self.subTest(maximum=maximum), patch.object(download.http.client, 'HTTPSConnection') as connection:
                with self.assertRaises(ValueError):
                    self.fetch(maximum=maximum)
                connection.assert_not_called()

    def test_connection_closes_when_request_fails(self):
        with patch.object(download.http.client, 'HTTPSConnection') as connection:
            connection.return_value.request.side_effect = TimeoutError('timeout')
            with self.assertRaises(TimeoutError):
                self.fetch()
            connection.return_value.close.assert_called_once()


class DownloadCallerTests(unittest.TestCase):
    def test_every_caller_rejects_unapproved_urls_before_connecting(self):
        import replay_sources
        import replay_current_sources
        import replay_schedule
        spec = importlib.util.spec_from_file_location(
            'crest_fetch', pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'fetch-epl-crests.py')
        crests = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(crests)
        callers = (lambda url: replay_sources.get_public(url, 100),
                   lambda url: replay_current_sources.get_public(url, 100),
                   replay_schedule.public_bytes, crests.fetch)
        for caller in callers:
            for url in ('file:///etc/passwd', 'https://127.0.0.1/', 'https://evil.example/'):
                with self.subTest(caller=caller, url=url), patch.object(download.http.client, 'HTTPSConnection') as connection:
                    with self.assertRaises(ValueError):
                        caller(url)
                    connection.assert_not_called()

    def test_manifest_cannot_select_a_local_file_even_with_matching_hash(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            secret = root / 'private.csv'
            secret.write_bytes(b'private local content')
            source = {**pipeline.source_record(), 'url': secret.as_uri(),
                      'bytes': secret.stat().st_size,
                      'sha256': hashlib.sha256(secret.read_bytes()).hexdigest()}
            with patch.object(pipeline, 'source_record', return_value=source), \
                    patch.object(pipeline, 'read_games'):
                with self.assertRaises(ValueError):
                    pipeline.fetch_history(root / 'output')
            self.assertFalse((root / 'output').exists())


if __name__ == '__main__':
    unittest.main()
