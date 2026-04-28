from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from typing import NamedTuple


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class ServerHandle(NamedTuple):
    server: ThreadingHTTPServer
    thread: Thread
    base_url: str


def start_static_server(asset_root: Path, host: str = "127.0.0.1", port: int = 0) -> ServerHandle:
    handler = partial(QuietStaticHandler, directory=str(asset_root))
    server = ThreadingHTTPServer((host, port), handler)
    thread = Thread(target=server.serve_forever, name="discover-pointcloud-http", daemon=True)
    thread.start()
    actual_host, actual_port = server.server_address[:2]
    return ServerHandle(
        server=server,
        thread=thread,
        base_url=f"http://{actual_host}:{actual_port}",
    )


def stop_static_server(handle: ServerHandle | None) -> None:
    if handle is None:
        return
    handle.server.shutdown()
    handle.server.server_close()
    handle.thread.join(timeout=2.0)
