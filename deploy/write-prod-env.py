#!/usr/bin/env python3
"""Write /var/www/solvio/.env on the VPS. Does not print secret values."""
import os
import subprocess

PATH = "/var/www/solvio/.env"
pg = subprocess.check_output(["openssl", "rand", "-hex", "32"], text=True).strip()
auth = subprocess.check_output(["openssl", "rand", "-base64", "32"], text=True).strip()
content = (
    "NODE_ENV=production\n"
    "HOST=127.0.0.1\n"
    "PORT=3000\n"
    "\n"
    "NEXT_PUBLIC_APP_URL=https://chatens.com\n"
    "BETTER_AUTH_URL=https://chatens.com\n"
    "\n"
    f"POSTGRES_PASSWORD={pg}\n"
    f"DATABASE_URL=postgresql://solvio:{pg}@127.0.0.1:5433/solvio\n"
    "\n"
    f"BETTER_AUTH_SECRET={auth}\n"
    "\n"
    "QDRANT_URL=http://127.0.0.1:6333\n"
    "QDRANT_COLLECTION=solvio_chunks\n"
    "\n"
    "OPENROUTER_API_KEY=\n"
    "OPENROUTER_MODEL=google/gemini-3.7-flash\n"
    "OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small\n"
    "\n"
    "NEXT_PUBLIC_SOCKET_PATH=/socket.io\n"
    "WIDGET_PUBLIC_KEY=wk_dev_default\n"
    "NEXT_PUBLIC_WIDGET_KEY=wk_dev_default\n"
    "WIDGET_ALLOWED_ORIGINS=https://chatens.com,https://www.chatens.com\n"
)
fd = os.open(PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    handle.write(content)
os.chmod(PATH, 0o600)
print("ENV_WRITTEN")
print("OPENROUTER_KEY_EMPTY=yes")
