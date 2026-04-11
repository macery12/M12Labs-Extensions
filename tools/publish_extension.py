#!/usr/bin/env python3

from __future__ import annotations

import sys

from m12labs_extension_tool import main as tool_main


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print('Usage: python3 tools/publish_extension.py <extension-source-dir>')
        return 1

    return tool_main(['publish', argv[1]])


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))