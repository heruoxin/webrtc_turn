#!/usr/bin/env python3
# Copyright (C) 2026 webrtc_turn contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""Issues short-lived coturn credentials over the shared static secret.

The username/password pair follows the coturn REST API scheme:
username is "<expiry unix timestamp>:<nonce>" and the password is the
base64 of HMAC-SHA1(static secret, username).
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

TTL_SECONDS = 86400

ACCESS_TOKEN = os.environ["ACCESS_TOKEN"]
STATIC_SECRET = os.environ["TURN_STATIC_SECRET"].encode()
URLS = [url.strip() for url in os.environ["TURN_URLS"].split(",")]


def issue():
    username = f"{int(time.time()) + TTL_SECONDS}:{secrets.token_hex(8)}"
    mac = hmac.new(STATIC_SECRET, username.encode(), hashlib.sha1).digest()
    return {
        "iceServers": [
            {
                "urls": URLS,
                "username": username,
                "credential": base64.b64encode(mac).decode(),
            }
        ],
        "ttl": TTL_SECONDS,
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def reply(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        request = urlparse(self.path)
        if request.path != "/":
            return self.reply(404, "text/plain; charset=utf-8", b"Not found")

        token = parse_qs(request.query).get("token", [""])[0]
        if not hmac.compare_digest(token, ACCESS_TOKEN):
            return self.reply(
                401,
                "text/plain; charset=utf-8",
                "Wrong token. Check the relay URL you pasted into the app.".encode(),
            )

        self.reply(200, "application/json", json.dumps(issue()).encode())


ThreadingHTTPServer(("", 8080), Handler).serve_forever()
