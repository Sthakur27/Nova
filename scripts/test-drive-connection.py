#!/usr/bin/env python3
"""One-shot desktop OAuth/Drive smoke test; never reads local notes or saves tokens.

Usage: python3 scripts/test-drive-connection.py --client-id ID
Enter the desktop client secret at the hidden prompt, then open the printed URL
in your system browser. Creates one generated Markdown note in a new test folder.
The test artifacts remain in Drive for inspection; no files are deleted.
"""
import argparse
import base64
import getpass
import hashlib
import http.server
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

SCOPE = 'https://www.googleapis.com/auth/drive.file'


def request(url, token=None, data=None, content_type='application/json', method=None):
    headers = {'Content-Type': content_type}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        # Do not log token exchanges, credentials, or request headers.
        raise RuntimeError(f'Google returned HTTP {error.code}. Check API setup, consent, and quota.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-id', required=True)
    args = parser.parse_args()
    client_secret = getpass.getpass('Desktop client secret (not saved): ')
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    state = secrets.token_urlsafe(32)
    result = {}

    class Callback(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Callback URLs contain a one-time authorization code.

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            valid = parsed.path == '/callback' and secrets.compare_digest(query.get('state', [''])[0], state)
            if not valid:
                self.send_error(400, 'Invalid callback')
                return
            result.update(query)
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.end_headers()
            self.wfile.write(b'Authorization received. Return to Nova setup to see the test result. You can close this tab.')

    with http.server.HTTPServer(('127.0.0.1', 0), Callback) as server:
        server.timeout = 1
        redirect = f'http://127.0.0.1:{server.server_port}/callback'
        params = dict(client_id=args.client_id, redirect_uri=redirect, response_type='code',
                      scope=SCOPE, state=state, code_challenge=challenge, code_challenge_method='S256',
                      access_type='online', prompt='select_account consent')
        print('Open this URL in your system browser to authorize the test:', flush=True)
        print('https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode(params), flush=True)
        deadline = time.monotonic() + 1800
        while not result and time.monotonic() < deadline:
            server.handle_request()
    if 'code' not in result:
        raise RuntimeError('Authorization was declined or timed out. No test files were uploaded.')
    body = urllib.parse.urlencode(dict(client_id=args.client_id, client_secret=client_secret,
        code=result['code'][0], code_verifier=verifier, redirect_uri=redirect,
        grant_type='authorization_code')).encode()
    tokens = json.loads(request('https://oauth2.googleapis.com/token', data=body,
                               content_type='application/x-www-form-urlencoded'))
    token = tokens['access_token']
    if SCOPE not in tokens.get('scope', '').split():
        raise RuntimeError('Drive file permission was not granted. No test files were uploaded.')
    stamp = time.strftime('%Y-%m-%d %H-%M-%S')
    folder = json.loads(request('https://www.googleapis.com/drive/v3/files?fields=id', token,
        json.dumps({'name': 'Nova connection test ' + stamp, 'mimeType': 'application/vnd.google-apps.folder'}).encode()))
    note = ('# Nova connection test\n\nThis is a generated test note. No personal notes were uploaded.\n'
            + '\nTest ID: ' + secrets.token_hex(12) + '\n').encode()
    boundary = 'nova_' + secrets.token_hex(24)
    metadata = json.dumps({'name': 'Connection test.md', 'parents': [folder['id']], 'mimeType': 'text/markdown'})
    upload = (f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n'
              f'--{boundary}\r\nContent-Type: text/markdown\r\n\r\n').encode() + note + f'\r\n--{boundary}--\r\n'.encode()
    file = json.loads(request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
                             token, upload, 'multipart/related; boundary=' + boundary))
    downloaded = request('https://www.googleapis.com/drive/v3/files/' + urllib.parse.quote(file['id'], safe='') + '?alt=media', token)
    if downloaded != note:
        raise RuntimeError('Read-back did not match the generated note.')
    print('PASS: Google authorization, test-note upload, and exact read-back succeeded.', flush=True)
    print('Test folder: https://drive.google.com/drive/folders/' + folder['id'], flush=True)
    print('Access tokens were held only in memory. Test files remain for inspection.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, KeyError, ValueError) as error:
        raise SystemExit(str(error)) from None
