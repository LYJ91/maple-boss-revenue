"""Fetch mesu.live option tables for cube EV. Run: python scripts/fetch_mesu_cube_tables.py"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

METHODS = {
    # mesu English enums are swapped vs Nexon Korean names:
    # mesu MASTER rates = 장인/실버 (unique L2 1.1858%)
    # mesu ARTISAN rates = 명장/골드 (unique L2 1.6959%, legend L2 0.1996%)
    "silver": "MASTER",
    "gold": "ARTISAN",
    "black": "POTENTIAL",
    "bronze": "STRANGE_ADDI",
}

# mesu equip enum → our category key
EQUIPS = [
    "무기",
    "엠블렘",
    "보조무기(포스실드, 소울링 제외)",
    "포스실드, 소울링",
    "방패",
    "모자",
    "상의",
    "한벌옷",
    "하의",
    "신발",
    "장갑",
    "망토",
    "벨트",
    "어깨장식",
    "얼굴장식",
    "눈장식",
    "귀고리",
    "반지",
    "펜던트",
    "기계심장",
]

GRADES = ["RARE", "EPIC", "UNIQUE", "LEGENDARY"]
LEVELS = [200]  # primary; pot probs often same across high levels for % opts

OUT = Path(__file__).resolve().parents[1] / "src" / "data" / "mesuCubeOptions.json"


def fetch_option_table(method: str, equip: str, level: int, grade: str) -> list[dict]:
    inner = {
        "method": method,
        "equip": equip,
        "level": level,
        "optionGrade": grade,
        "v": "2",
    }
    q = urllib.parse.quote(json.dumps(inner, ensure_ascii=False))
    url = "https://www.mesu.live/api/trpc/potential.getOptionTable?input=" + q
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.mesu.live/calc/potential",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    rows = data["result"]["data"]
    return [{"name": x["name"], "probability": x["probability"]} for x in rows]


def fetch_option_grade(method: str, grade: str) -> dict:
    inner = {"method": method, "grade": grade, "v": "2"}
    q = urllib.parse.quote(json.dumps(inner, ensure_ascii=False))
    url = "https://www.mesu.live/api/trpc/potential.getOptionGrade?input=" + q
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.mesu.live/calc/potential",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["result"]["data"]


def main() -> None:
    tables: dict = {"source": "mesu.live potential.getOptionTable", "v": "2", "level": 200, "methods": {}}
    grades_out: dict = {}

    for cube_id, method in METHODS.items():
        print("method", cube_id, method)
        tables["methods"][cube_id] = {}
        # grade line probs for each item grade
        for g in GRADES:
            try:
                grades_out.setdefault(cube_id, {})[g] = fetch_option_grade(method, g)
                print("  grade", g, "ok")
            except Exception as e:
                print("  grade", g, "skip", e)

        for equip in EQUIPS:
            tables["methods"][cube_id][equip] = {}
            for g in GRADES:
                # bronze/strange addi max epic; silver max unique
                if cube_id == "silver" and g == "LEGENDARY":
                    continue
                if cube_id == "bronze" and g in ("UNIQUE", "LEGENDARY"):
                    continue
                try:
                    rows = fetch_option_table(method, equip, 200, g)
                    tables["methods"][cube_id][equip][g] = rows
                    print(f"  {equip} {g}: {len(rows)}")
                except Exception as e:
                    print(f"  {equip} {g}: FAIL {e}")

    tables["optionGrades"] = grades_out
    OUT.write_text(json.dumps(tables, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
