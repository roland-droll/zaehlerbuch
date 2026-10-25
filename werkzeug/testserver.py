"""Testserver für die Prüfseiten: liefert den Projektordner aus wie `python -m http.server` und nimmt per
POST /ablage/<name>.png Bilder an, die nach test/ausgabe/ geschrieben werden (zum Ansehen der Suchergebnisse).
Aufruf im Projektordner: python werkzeug/testserver.py [port]"""
import os, re, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AUSGABE = os.path.join(WURZEL, "test", "ausgabe")


class Bearbeiter(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # immer die aktuelle Fassung beim Testen
        super().end_headers()

    def do_POST(self):
        m = re.fullmatch(r"/ablage/([\w.-]+\.(png|jpg|json|txt))", self.path)
        if not m:
            self.send_error(404); return
        laenge = int(self.headers.get("Content-Length", 0))
        os.makedirs(AUSGABE, exist_ok=True)
        with open(os.path.join(AUSGABE, m.group(1)), "wb") as f:
            f.write(self.rfile.read(laenge))
        self.send_response(204); self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    ThreadingHTTPServer(("127.0.0.1", port), partial(Bearbeiter, directory=WURZEL)).serve_forever()
