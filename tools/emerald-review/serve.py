"""Serve the verified local package and transient court athlete examples on loopback."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PACKAGE = ROOT / "dist"
FILES = {
    "/": HERE / "index.html",
    "/court/tools/emerald-review/examples.mjs": HERE / "examples.mjs",
    "/saved-rally.json": ROOT / "docs/builder/examples/eight-shot-drive-drop.json",
    "/teaching.mp4": ROOT / "release-results/emerald-teaching/emerald-cap-teaching.mp4",
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".glb": "model/gltf-binary", ".mjs": "text/javascript"}

    def translate_path(self, path):
        route = unquote(urlsplit(path).path)
        if route in FILES:
            return str(FILES[route])
        if route.startswith("/court/"):
            asset = (PACKAGE / (route[7:] or "index.html")).resolve()
            if asset.is_relative_to(PACKAGE) and asset.is_file():
                return str(asset)
        return str(PACKAGE / ".missing-route")


if __name__ == "__main__":
    if not (PACKAGE / "build-info.json").is_file():
        sys.exit("Build the local runtime with npm run build:site first.")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8502
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=PACKAGE))
    print(f"Court athlete review at http://127.0.0.1:{port}/", flush=True)
    server.serve_forever()
