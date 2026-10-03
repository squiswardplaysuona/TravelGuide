# -*- coding: utf-8 -*-
"""Sync .agents/skills/ (source of truth) -> skills/ (Claude Code plugin copy).

Run from repo root:
    python scripts/sync-skills.py
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".agents" / "skills"
DST = ROOT / "skills"


def main() -> int:
    if not SRC.is_dir():
        print(f"source not found: {SRC}")
        return 1
    if DST.exists():
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    count = sum(1 for p in DST.glob("*/SKILL.md"))
    print(f"synced {count} skills -> {DST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
