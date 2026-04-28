from __future__ import annotations

import argparse
from contextlib import ExitStack
import time
import webbrowser
from importlib.resources import as_file, files
from importlib.resources.abc import Traversable
from pathlib import Path
from typing import Sequence

from .server import ServerHandle, start_static_server, stop_static_server


def frontend_root() -> Traversable:
    return files("discover_pointcloud").joinpath("frontend")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="discover-pointcloud",
        description="Launch Discover PointCloud.",
    )
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Open in the default browser. This is the default and needs no GUI dependencies.",
    )
    parser.add_argument(
        "--qt",
        action="store_true",
        help="Open in the built-in Qt window. Requires: pip install -e '.[qt]'",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host used by the embedded asset server. Default: 127.0.0.1",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Port used by the embedded asset server. Default: 0 (random free port)",
    )
    return parser


def launch_browser(base_url: str) -> int:
    url = f"{base_url}/index.html"
    webbrowser.open(url)
    print(f"Discover PointCloud is running at {url}")
    print("Press Ctrl+C to stop the local server.")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nStopped Discover PointCloud.")
        return 0


def launch_qt_window(base_url: str) -> int:
    import sys

    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWidgets import QApplication
    except ImportError as error:
        raise RuntimeError(
            "Qt mode requires PySide6. Install it with: python -m pip install -e '.[qt]'"
        ) from error

    app = QApplication.instance() or QApplication(sys.argv)
    view = QWebEngineView()
    view.setWindowTitle("Discover PointCloud")
    view.resize(1680, 1050)
    view.load(QUrl(f"{base_url}/index.html"))
    view.show()
    return app.exec()


def run(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    server_handle: ServerHandle | None = None
    with ExitStack() as stack:
        asset_root = Path(stack.enter_context(as_file(frontend_root())))
        try:
            server_handle = start_static_server(asset_root, host=args.host, port=args.port)
            if args.qt:
                try:
                    return launch_qt_window(server_handle.base_url)
                except RuntimeError as error:
                    print(error)
                    return 2
            if args.browser:
                launch_browser(server_handle.base_url)
                return 0
            return launch_browser(server_handle.base_url)
        finally:
            stop_static_server(server_handle)
