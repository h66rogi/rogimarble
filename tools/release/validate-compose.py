#!/usr/bin/env python3
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def validate_tmpfs(model: dict) -> None:
    services = model.get("services")
    if not isinstance(services, dict):
        raise ValueError("Compose model has no services map")
    checked = 0
    for service_name, service in services.items():
        entries = service.get("tmpfs", [])
        if not isinstance(entries, list):
            raise ValueError(f"{service_name}.tmpfs must be a list")
        for entry in entries:
            if not isinstance(entry, str):
                raise ValueError(f"{service_name}.tmpfs contains a non-string entry")
            target = entry.split(":", 1)[0]
            if not target.startswith("/"):
                raise ValueError(
                    f"{service_name}.tmpfs entry is not an absolute container path: {entry!r}"
                )
            checked += 1
    if checked == 0:
        raise ValueError("Compose model has no tmpfs entries")


def parsed_compose() -> dict:
    fake_digest = "sha256:" + "1" * 64
    env = os.environ.copy()
    env.update(
        {
            "COMPOSE_PROJECT_NAME": "rogimarble-compose-validation",
            "IMAGE_POSTGRES": f"example.invalid/postgres@{fake_digest}",
            "IMAGE_REDIS": f"example.invalid/redis@{fake_digest}",
            "IMAGE_API": f"example.invalid/api@{fake_digest}",
            "IMAGE_WEB": f"example.invalid/web@{fake_digest}",
            "IMAGE_CADDY": f"example.invalid/caddy@{fake_digest}",
            "POSTGRES_UID": "999",
            "POSTGRES_GID": "999",
            "REDIS_UID": "999",
            "REDIS_GID": "999",
            "API_UID": "1000",
            "API_GID": "1000",
            "WEB_UID": "1000",
            "WEB_GID": "1000",
            "CADDY_UID": "1000",
            "CADDY_GID": "1000",
            "POSTGRES_DB": "rogimarble",
            "POSTGRES_ADMIN_USER": "postgres",
            "MIGRATION_DB_USER": "rogimarble_migrate",
            "APP_DB_USER": "rogimarble_app",
            "DATA_ROOT": "/srv/rogimarble",
            "RUNTIME_SECRET_ROOT": "/run/rogimarble/secrets",
            "RUNTIME_COLLECTOR_ROOT": "/run/rogimarble/collector-client",
            "APP_ROOT": "/opt/rogimarble/app",
            "WEB_DOMAIN": "marble.rogi.chat",
            "API_DOMAIN": "marble-api.rogi.chat",
        }
    )
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(ROOT / "deploy/compose.production.yaml"),
            "config",
            "--format",
            "json",
        ],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


if __name__ == "__main__":
    try:
        model = json.load(sys.stdin) if "--model-stdin" in sys.argv[1:] else parsed_compose()
        validate_tmpfs(model)
    except (ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(f"Compose validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
