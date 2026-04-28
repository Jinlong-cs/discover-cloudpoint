from __future__ import annotations

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_FRONTEND = ROOT / "discover_pointcloud" / "frontend"
SOURCE_FILES = [
    ROOT / "index.html",
    ROOT / "app.js",
    ROOT / "styles.css",
]
SOURCE_VENDOR = ROOT / "vendor"


def main() -> None:
    missing_sources = [
        str(path)
        for path in [*SOURCE_FILES, SOURCE_VENDOR]
        if not path.exists()
    ]
    if missing_sources:
        raise FileNotFoundError(f"missing frontend source assets: {missing_sources}")

    PACKAGE_FRONTEND.mkdir(parents=True, exist_ok=True)

    for source_file in SOURCE_FILES:
        shutil.copy2(source_file, PACKAGE_FRONTEND / source_file.name)

    target_vendor = PACKAGE_FRONTEND / "vendor"
    if target_vendor.exists():
        shutil.rmtree(target_vendor)
    shutil.copytree(SOURCE_VENDOR, target_vendor)

    print(f"synchronized canonical frontend assets into {PACKAGE_FRONTEND}")


if __name__ == "__main__":
    main()
