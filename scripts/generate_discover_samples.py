from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import json


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "bucket_pointcloud_compare_representative5_lite"
OUTPUT_ROOT = ROOT / "pointcloud_compare_tool" / "discover_samples"
SOURCE_CAMERA = {
    "fx": 372.429241685,
    "fy": 372.429241685,
    "cx": 640.0,
    "cy": 544.0,
    "baseline": 0.054885186954,
}

SCENE_SPECS = [
    ("scene", "GT", "gt"),
    ("scene2", "640x352 best -> fullres", "preproc352x640"),
    ("scene3", "1280x1088 best", "fullres1280x1088"),
]

COMPARE_VARIANTS = [
    ("gt", "preproc352x640", "GT vs 640x352 best -> fullres", "gt_vs_preproc352x640"),
    ("gt", "fullres1280x1088", "GT vs 1280x1088 best", "gt_vs_fullres1280x1088"),
]


def extract_json_array(text: str, start_token: str) -> tuple[list, int]:
    start = text.index(start_token)
    start = text.index("[", start)
    end = match_closing(text, start, "[", "]")
    return json.loads(text[start:end]), end


def extract_json_object(text: str, start_pos: int) -> dict:
    start = text.index("{", start_pos)
    end = match_closing(text, start, "{", "}")
    return json.loads(text[start:end])


def match_closing(text: str, start: int, open_char: str, close_char: str) -> int:
    level = 0
    in_string = False
    escaped = False
    for idx in range(start, len(text)):
        char = text[idx]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == open_char:
            level += 1
        elif char == close_char:
            level -= 1
            if level == 0:
                return idx + 1

    raise ValueError(f"Unable to match {open_char}{close_char} from {start}")

def round_point_triplets(points: list[list[float]], decimals: int = 6) -> list[list[float]]:
    return [[round(x, decimals), round(y, decimals), round(z, decimals)] for x, y, z in points]


def parse_html_sample(html_path: Path) -> dict:
    text = html_path.read_text()
    traces, data_end = extract_json_array(text, "Plotly.newPlot(")
    layout = extract_json_object(text, data_end)

    grouped: dict[str, list[list[float]]] = defaultdict(list)
    for trace in traces:
        scene = trace["scene"]
        xs = trace["x"]
        ys = trace["y"]
        zs = trace["z"]
        grouped[scene].extend(zip(xs, ys, zs))

    sample_dir = html_path.parent.name
    title_text = layout["title"]["text"]
    image_path = title_text.split("<br>")[1] if "<br>" in title_text else ""

    clouds = {}
    for scene_name, label, cloud_key in SCENE_SPECS:
        points = round_point_triplets([list(point) for point in grouped[scene_name]])
        clouds[cloud_key] = {
            "label": label,
            "points": points,
            "point_count": len(points),
        }

    return {
        "sample_dir": sample_dir,
        "title": title_text,
        "image_path": image_path,
        "clouds": clouds,
        "source_html": str(html_path.relative_to(ROOT)),
    }


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    samples = []
    html_paths = sorted(SOURCE_ROOT.glob("val_*/pointcloud_bucket_compare.html"))
    for html_path in html_paths:
        sample = parse_html_sample(html_path)
        sample_id = sample["sample_dir"]
        sample_output = OUTPUT_ROOT / sample_id
        sample_output.mkdir(parents=True, exist_ok=True)

        cloud_files = {}
        for cloud_key, cloud in sample["clouds"].items():
            file_name = f"{sample_id}_{cloud_key}.json"
            file_path = sample_output / file_name
            file_path.write_text(
                json.dumps(
                    {
                        "sample_id": sample_id,
                        "label": cloud["label"],
                        "points": cloud["points"],
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            )
            cloud_files[cloud_key] = file_path.relative_to(OUTPUT_ROOT.parent).as_posix()

        for left_key, right_key, compare_label, compare_key in COMPARE_VARIANTS:
            samples.append(
                {
                    "id": f"{sample_id}_{compare_key}",
                    "sample_id": sample_id,
                    "title": f"{sample_id} | {compare_label}",
                    "image_path": sample["image_path"],
                    "left_url": cloud_files[left_key],
                    "right_url": cloud_files[right_key],
                    "left_label": sample["clouds"][left_key]["label"],
                    "right_label": sample["clouds"][right_key]["label"],
                    "left_points": sample["clouds"][left_key]["point_count"],
                    "right_points": sample["clouds"][right_key]["point_count"],
                    "source_html": sample["source_html"],
                }
            )

    manifest = {
        "camera": SOURCE_CAMERA,
        "source_root": str(SOURCE_ROOT.relative_to(ROOT)),
        "samples": samples,
    }
    (OUTPUT_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2)
    )

    print(f"generated {len(samples)} sample presets in {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
