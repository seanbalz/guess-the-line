"""Bounded, credential-free HTTPS GETs for reviewed public source URLs.

Callers supply exact initial URLs and, only where needed, explicit CDN hosts.
No file/FTP handlers, automatic redirects, cookies or proxy environment are used.
Python 3.10+ is required; TLS explicitly verifies certificates and hostnames.
"""
import http.client
import ssl
from urllib.parse import urljoin, urlsplit


def _https_url(url):
    if (not isinstance(url, str) or not url or '\\' in url or '#' in url
            or any(ord(char) <= 32 or ord(char) >= 127 for char in url)):
        raise ValueError('Invalid public download URL.')
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.port not in (None, 443)):
        raise ValueError('Public downloads require HTTPS without credentials or custom ports.')
    return parsed


def fetch_public_bytes(url, *, allowed_urls, maximum, user_agent, timeout=60,
                       redirect_hosts=()):
    """Fetch one exact reviewed URL, checking every redirect before connecting."""
    if type(maximum) is not int or maximum <= 0:
        raise ValueError('A positive download byte limit is required.')
    if url not in allowed_urls:
        raise ValueError('Only explicit public source URLs may be fetched.')
    for hop in range(6):
        parsed = _https_url(url)
        if url not in allowed_urls and parsed.hostname not in redirect_hosts:
            raise ValueError('Public download redirect destination is not allowed.')
        # Audited for Python 3.10+: explicit verified TLS, covered by the SSLContext regression test.
        connection = http.client.HTTPSConnection(parsed.hostname, timeout=timeout, context=ssl.create_default_context())  # nosemgrep: python.lang.security.audit.httpsconnection-detected.httpsconnection-detected
        try:
            target = parsed.path or '/'
            if parsed.query:
                target += '?' + parsed.query
            connection.request('GET', target, headers={'User-Agent': user_agent})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location or hop == 5:
                    raise ValueError('Missing redirect destination or too many redirects.')
                # Validate before urljoin, which would otherwise strip control characters.
                if ('\\' in location or '#' in location
                        or any(ord(char) <= 32 or ord(char) >= 127 for char in location)):
                    raise ValueError('Invalid public download redirect.')
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ValueError(f'Public download failed with HTTP {response.status}.')
            data = response.read(maximum + 1)
            if len(data) > maximum:
                raise ValueError('Public response exceeds its size limit.')
            return data
        finally:
            connection.close()
