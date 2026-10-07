
#!/usr/bin/env python3
"""SPA static server: unknown paths fall back to index.html (like Vercel rewrites)."""
from __future__ import annotations

import argparse
import mimetypes
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent


class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        # Normalize and block path traversal
        rel = path.lstrip("/")
        if ".." in Path(rel).parts:
            self.send_error(400, "Bad request")
            return

        candidate = ROOT / rel if rel else ROOT / "index.html"

        # Exact file
        if candidate.is_file():
            return SimpleHTTPRequestHandler.do_GET(self)

        # Directory with index.html
        if candidate.is_dir() and (candidate / "index.html").is_file():
            self.path = (path.rstrip("/") + "/index.html") if path != "/" else "/index.html"
            return SimpleHTTPRequestHandler.do_GET(self)

        # SPA fallback for client routes like /dashboard, /certificate
        if path != "/" and not Path(rel).suffix:
            self.path = "/index.html"
            return SimpleHTTPRequestHandler.do_GET(self)

        return self.send_error(404, "File not found")

    def end_headers(self):
        # Avoid sticky cache while developing sign/popup fixes
        if self.path.startswith("/static/js/") or self.path.endswith(".html") or self.path == "/index.html":
            self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    # Ensure common JS MIME type
    mimetypes.add_type("application/javascript", ".js")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), SpaHandler)
    print(f"SPA server running at http://127.0.0.1:{args.port}/")
    print("Routes like /dashboard and /certificate will load index.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    main()
