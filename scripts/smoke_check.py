from __future__ import annotations

from contextlib import ExitStack
from importlib.resources import as_file
from pathlib import Path
from urllib.request import urlopen
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from discover_pointcloud.app import frontend_root
from discover_pointcloud.server import start_static_server, stop_static_server


def fetch_text(url: str) -> str:
    with urlopen(url, timeout=5) as response:
        return response.read().decode("utf-8")


def main() -> None:
    with ExitStack() as stack:
        asset_root = Path(stack.enter_context(as_file(frontend_root())))
        required_files = [
            asset_root / "index.html",
            asset_root / "app.js",
            asset_root / "styles.css",
            asset_root / "vendor" / "plotly-2.35.2.min.js",
            asset_root / "vendor" / "html2canvas-1.4.1.min.js",
        ]
        missing = [str(path) for path in required_files if not path.exists()]
        if missing:
            raise FileNotFoundError(f"missing packaged assets: {missing}")

        server_handle = None
        try:
            server_handle = start_static_server(asset_root)
            index_html = fetch_text(f"{server_handle.base_url}/index.html")
            plotly_text = fetch_text(
                f"{server_handle.base_url}/vendor/plotly-2.35.2.min.js"
            )
            if "Point Cloud Compare" not in index_html:
                raise ValueError("index.html did not look like the point cloud UI")
            if "Plotly" not in plotly_text:
                raise ValueError("served Plotly vendor bundle did not look valid")
        finally:
            stop_static_server(server_handle)

    print("smoke check passed: packaged frontend assets served correctly")


if __name__ == "__main__":
    main()
