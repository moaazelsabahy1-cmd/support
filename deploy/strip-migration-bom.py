#!/usr/bin/env python3
import pathlib

root = pathlib.Path("/var/www/solvio/prisma/migrations")
for path in sorted(root.glob("*/migration.sql")):
    data = path.read_bytes()
    if data.startswith(b"\xef\xbb\xbf"):
        path.write_bytes(data[3:])
        print("stripped_bom", path.parent.name)
    else:
        print("ok", path.parent.name)
