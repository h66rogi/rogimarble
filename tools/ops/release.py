#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
from typing import Any, Callable

CORE_SERVICES = {'postgres', 'redis', 'edge'}
SLOTS = ('blue', 'green')
EXPECTED_SERVICES = CORE_SERVICES
APP_IMAGE_KEYS = ("api", "web")
APP_IMAGE_RETENTION = 3
MINIMUM_DEPLOY_FREE_BYTES = 4 * 1024 * 1024 * 1024

def containers_healthy(result, expected=EXPECTED_SERVICES):
    if not result['ok']:
        return False
    try:
        output = result['output']
        rows = json.loads(output) if output.lstrip().startswith('[') else [json.loads(line) for line in output.splitlines() if line.strip()]
        by_service = {row['Service']: row for row in rows}
        return expected.issubset(by_service) and all(
            by_service[name].get('State') == 'running' and by_service[name].get('Health') == 'healthy'
            for name in expected)
    except (ValueError, KeyError, TypeError):
        return False

PRODUCT = "rogimarble"
APP_ROOT = Path("/opt/rogimarble/app")
CONFIG_ROOT = Path("/etc/rogimarble")
RUN_ROOT = Path("/run/rogimarble")
DATA_ROOT = Path("/srv/rogimarble")
COMPOSE_PATH = Path("deploy/compose.production.yaml")
IMAGE_KEYS = {"api", "web", "caddy", "postgres", "redis"}
RUNTIME_FILES = {"deploy/Caddyfile.production", "deploy/postgres/init-roles.sh",
                 "deploy/systemd/rogimarble-app.service", "deploy/systemd/rogimarble-slot@.service", "deploy/systemd/rogimarble-secrets.service",
                 "deploy/systemd/rogimarble-update.service", "deploy/systemd/rogimarble-update.timer",
                 "deploy/systemd/rogimarble-backup.service", "deploy/systemd/rogimarble-backup.timer",
                 "tools/ops/release.py", "tools/ops/deploy.sh", "tools/ops/supervise.sh", "tools/ops/supervise-slot.sh",
                 "tools/ops/prepare-secrets.sh", "tools/ops/install-host.sh", "tools/ops/fetch-release.py",
                 "tools/ops/production-status.py", "tools/ops/backup-postgres.sh", "tools/ops/fetch-runtime-secrets.py", "tools/ops/upload-backup.py", "tools/ops/load-registry-auth.py"}
RUNTIME_FILES.add("tools/ops/prepare-collector-client.py")
RUNTIME_KEYS = {"webDomain", "apiDomain", "acmeEmail", "channelId", "composeProjectName", "dataRoot",
                "dataVolumeUuid", "postgresDb", "postgresAdminUser", "migrationDbUser", "appDbUser",
                "apiUid", "apiGid", "webUid", "webGid", "postgresUid", "postgresGid", "redisUid", "redisGid", "caddyUid", "caddyGid"}
SECRET_FILES = ("postgres_admin_password", "postgres_migration_password", "postgres_app_password",
                "migration_database_url", "api_database_url", "session_secret")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SAFE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
IMAGE = re.compile(r"^[^\s@]+@sha256:[0-9a-f]{64}$")

class ReleaseError(RuntimeError):
    pass

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def object_exact(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ReleaseError(f"{label} must contain exactly: {', '.join(sorted(keys))}")
    return value

def validate_manifest(path: Path, app_root: Path = APP_ROOT, expected_data_root: Path = DATA_ROOT) -> dict[str, Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"cannot read release manifest: {exc}") from exc
    root_keys = {"schemaVersion", "product", "profile", "sourceSha", "releaseId", "contractVersion",
                 "composeSha256", "runtimeFiles", "images", "migrations", "runtimeNonSecret"}
    manifest = object_exact(raw, root_keys, "manifest")
    if manifest["schemaVersion"] != 1 or manifest["product"] != PRODUCT or manifest["profile"] != "feedback":
        raise ReleaseError("manifest must be schemaVersion=1, product=rogimarble, profile=feedback")
    if not isinstance(manifest["sourceSha"], str) or not SHA40.fullmatch(manifest["sourceSha"]):
        raise ReleaseError("sourceSha must be 40 lowercase hex characters")
    if not isinstance(manifest["releaseId"], str) or not SAFE.fullmatch(manifest["releaseId"]):
        raise ReleaseError("releaseId is invalid")
    if manifest["contractVersion"] != "v1":
        raise ReleaseError("contractVersion must be v1")
    if not isinstance(manifest["composeSha256"], str) or not HEX64.fullmatch(manifest["composeSha256"]):
        raise ReleaseError("composeSha256 is invalid")
    compose = app_root / COMPOSE_PATH
    if not compose.is_file() or sha256(compose) != manifest["composeSha256"]:
        raise ReleaseError("production Compose checksum mismatch")
    runtime_files=object_exact(manifest["runtimeFiles"],RUNTIME_FILES,"runtimeFiles")
    for relative,expected in runtime_files.items():
        target=app_root/relative
        if not isinstance(expected,str) or not HEX64.fullmatch(expected) or not target.is_file() or sha256(target)!=expected:
            raise ReleaseError(f"runtime file checksum mismatch: {relative}")
    images = object_exact(manifest["images"], IMAGE_KEYS, "images")
    if any(not isinstance(value, str) or not IMAGE.fullmatch(value) for value in images.values()):
        raise ReleaseError("every image must be an immutable repository@sha256 digest")
    migrations = manifest["migrations"]
    if not isinstance(migrations, list) or not migrations:
        raise ReleaseError("migrations must be a non-empty ordered list")
    seen: set[str] = set()
    ordered_paths: list[str] = []
    for index, entry in enumerate(migrations):
        item = object_exact(entry, {"path", "sha256"}, f"migrations[{index}]")
        relative = item["path"]
        if not isinstance(relative, str) or not re.fullmatch(r"packages/database/migrations/[0-9]{3}_[a-z0-9_]+\.sql", relative):
            raise ReleaseError(f"invalid migration path: {relative!r}")
        if relative in seen or not isinstance(item["sha256"], str) or not HEX64.fullmatch(item["sha256"]):
            raise ReleaseError("duplicate migration or invalid checksum")
        seen.add(relative)
        ordered_paths.append(relative)
        migration_path = app_root / relative
        if not migration_path.is_file() or sha256(migration_path) != item["sha256"]:
            raise ReleaseError(f"migration checksum mismatch: {relative}")
    actual_migrations=sorted(path.relative_to(app_root).as_posix() for path in (app_root/"packages/database/migrations").glob("*.sql"))
    if ordered_paths!=actual_migrations:
        raise ReleaseError("manifest migrations must list every bundled migration in filename order")
    runtime = object_exact(manifest["runtimeNonSecret"], RUNTIME_KEYS, "runtimeNonSecret")
    if runtime["webDomain"] != "marble.rogi.chat" or runtime["apiDomain"] != "marble-api.rogi.chat":
        raise ReleaseError("production domains do not match the approved marble domains")
    if any(not isinstance(runtime[key], str) or not DOMAIN.fullmatch(runtime[key]) for key in ("webDomain", "apiDomain")):
        raise ReleaseError("invalid domain")
    if not isinstance(runtime["acmeEmail"], str) or (runtime["acmeEmail"]!="" and not re.fullmatch(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}",runtime["acmeEmail"])):
        raise ReleaseError("acmeEmail is invalid")
    for key in ("channelId", "composeProjectName", "postgresDb", "postgresAdminUser", "migrationDbUser", "appDbUser"):
        if not isinstance(runtime[key], str) or not SAFE.fullmatch(runtime[key]):
            raise ReleaseError(f"invalid runtimeNonSecret.{key}")
    for key in ("apiUid","apiGid","webUid","webGid","postgresUid","postgresGid","redisUid","redisGid","caddyUid","caddyGid"):
        if not isinstance(runtime[key], int) or runtime[key]<1 or runtime[key]>65535:
            raise ReleaseError(f"invalid runtimeNonSecret.{key}")
    if runtime["dataRoot"] != str(expected_data_root) or not isinstance(runtime["dataVolumeUuid"], str) or not SAFE.fullmatch(runtime["dataVolumeUuid"]):
        raise ReleaseError("dataRoot or dataVolumeUuid violates the host contract")
    return manifest

class Runner:
    def run(self, argv: list[str], *, check: bool = True, input: str | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(argv, check=check, text=True, input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def _checked_output(result: subprocess.CompletedProcess[str], action: str) -> str:
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise ReleaseError(f"{action} failed: {detail}")
    return result.stdout

def reclaim_old_app_images(manifest: dict[str, Any], runner: Runner,
                           retain: int = APP_IMAGE_RETENTION) -> dict[str, int]:
    """Bound only Rogimarble application images while preserving rollback and live images."""
    if retain < 1:
        raise ReleaseError("application image retention must be at least one")
    container_ids = _checked_output(
        runner.run(["docker", "ps", "-aq"], check=False), "container image inventory"
    ).split()
    active_ids: set[str] = set()
    if container_ids:
        active_ids.update(_checked_output(
            runner.run(["docker", "inspect", "--format={{.Image}}", *container_ids], check=False),
            "active container image inspection",
        ).split())

    removed = skipped_shared = 0
    for key in APP_IMAGE_KEYS:
        repository = manifest["images"][key].split("@", 1)[0]
        image_ids = list(dict.fromkeys(_checked_output(
            runner.run(["docker", "image", "ls", "--quiet", "--no-trunc", repository], check=False),
            f"{key} image inventory",
        ).split()))
        if not image_ids:
            continue
        try:
            images = json.loads(_checked_output(
                runner.run(["docker", "image", "inspect", *image_ids], check=False),
                f"{key} image inspection",
            ))
        except json.JSONDecodeError as exc:
            raise ReleaseError(f"{key} image inspection returned invalid JSON") from exc
        if not isinstance(images, list) or any(not isinstance(image, dict) for image in images):
            raise ReleaseError(f"{key} image inspection returned an invalid inventory")
        images.sort(key=lambda image: str(image.get("Created", "")), reverse=True)
        keep = {str(image.get("Id", "")) for image in images[:retain]} | active_ids
        for image in images:
            image_id = str(image.get("Id", ""))
            if not image_id or image_id in keep:
                continue
            digests = image.get("RepoDigests") or []
            if not isinstance(digests, list) or any(
                not isinstance(digest, str) or not digest.startswith(f"{repository}@")
                for digest in digests
            ):
                skipped_shared += 1
                continue
            result = runner.run(["docker", "image", "rm", image_id], check=False)
            if result.returncode == 0:
                removed += 1
    return {"removed": removed, "skippedShared": skipped_shared}

def ensure_deploy_capacity(path: Path = Path("/var/lib/docker"), *,
                           disk_usage: Callable[[Path], Any] = shutil.disk_usage,
                           minimum_free_bytes: int = MINIMUM_DEPLOY_FREE_BYTES) -> None:
    target = path if path.exists() else Path("/")
    free = disk_usage(target).free
    if free < minimum_free_bytes:
        raise ReleaseError(
            "insufficient Docker disk space after safe application-image cleanup: "
            f"{free / (1024 ** 3):.1f} GiB free, {minimum_free_bytes / (1024 ** 3):.1f} GiB required"
        )

def source_identity(app_root:Path,runner:Runner)->str:
    if (app_root/".git").exists():return runner.run(["git","-C",str(app_root),"rev-parse","HEAD"]).stdout.strip()
    marker=app_root/".release-source-sha"
    return marker.read_text(encoding="ascii").strip() if marker.is_file() else ""

def active_slot(config_root: Path) -> str | None:
    path = config_root / "active-slot"
    if not path.exists():
        return None
    slot = path.read_text(encoding="ascii").strip()
    if slot not in SLOTS:
        raise ReleaseError("invalid active application slot")
    return slot

def candidate_slot(config_root: Path) -> str:
    return "blue" if active_slot(config_root) == "green" else "green"

def write_active_slot(config_root: Path, slot: str) -> None:
    if slot not in SLOTS:
        raise ReleaseError("invalid application slot")
    temporary = config_root / f".active-slot.{os.getpid()}"
    temporary.write_text(slot + "\n", encoding="ascii")
    temporary.chmod(0o600)
    temporary.replace(config_root / "active-slot")

def check_secret(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode & 0o077 or info.st_size<1 or info.st_size>8192:
        raise ReleaseError(f"secret must be a regular 0600-style file: {path}")

def release_env(manifest: dict[str, Any], app_root: Path, run_root: Path, name: str = "release.env",
                slot: str = "green") -> Path:
    if slot not in SLOTS:
        raise ReleaseError("invalid application slot")
    runtime, images = manifest["runtimeNonSecret"], manifest["images"]
    values = {
        "COMPOSE_PROJECT_NAME": runtime["composeProjectName"], "APP_ROOT": str(app_root),
        "DATA_ROOT": runtime["dataRoot"], "RUNTIME_SECRET_ROOT": str(run_root / "secrets"),
        "WEB_DOMAIN": runtime["webDomain"], "API_DOMAIN": runtime["apiDomain"], "ACME_EMAIL_DIRECTIVE": f"email {runtime['acmeEmail']}" if runtime["acmeEmail"] else "",
        "API_UPSTREAM": f"api-{slot}:4000", "WEB_UPSTREAM": f"web-{slot}:3000",
        "POSTGRES_DB": runtime["postgresDb"], "POSTGRES_ADMIN_USER": runtime["postgresAdminUser"],
        "MIGRATION_DB_USER": runtime["migrationDbUser"], "APP_DB_USER": runtime["appDbUser"],
        "CHANNEL_ID": runtime["channelId"],
        "RUNTIME_COLLECTOR_ROOT": str(run_root / "collector-client"),
        **{key.upper().replace("UID","_UID").replace("GID","_GID"): str(runtime[key]) for key in ("apiUid","apiGid","webUid","webGid","postgresUid","postgresGid","redisUid","redisGid","caddyUid","caddyGid")},
        **{f"IMAGE_{key.upper()}": value for key, value in images.items()},
    }
    run_root.mkdir(mode=0o750, parents=True, exist_ok=True)
    target = run_root / name
    temp = run_root / f"{name}.{os.getpid()}"
    temp.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")
    temp.chmod(0o600)
    temp.replace(target)
    return target

def prepare_runtime(manifest:dict[str,Any],app_root:Path,config_root:Path,run_root:Path,env_name:str,slot:str="green")->Path:
    runtime=manifest["runtimeNonSecret"];source_root=run_root/"source-secrets" if (run_root/"source-secrets").is_dir() else config_root/"secrets";target_root=run_root/"secrets"
    ownership={"postgres_admin_password":(runtime["postgresUid"],runtime["postgresGid"]),"postgres_migration_password":(runtime["postgresUid"],runtime["postgresGid"]),
      "postgres_app_password":(runtime["postgresUid"],runtime["postgresGid"]),"migration_database_url":(runtime["apiUid"],runtime["apiGid"]),
      "api_database_url":(runtime["apiUid"],runtime["apiGid"]),"session_secret":(runtime["apiUid"],runtime["apiGid"])}
    target_root.mkdir(mode=0o711,parents=True,exist_ok=True);target_root.chmod(0o711)
    for name,(uid,gid) in ownership.items():
      source=source_root/name;check_secret(source);target=target_root/name;temporary=target_root/f".{name}.{os.getpid()}"
      temporary.write_bytes(source.read_bytes());temporary.chmod(0o400);os.chown(temporary,uid,gid);temporary.replace(target)
    subprocess.run([sys.executable,str(app_root/"tools/ops/prepare-collector-client.py"),"--source",str(config_root/"collector-client"),"--run-root",str(run_root),"--uid",str(runtime["apiUid"]),"--gid",str(runtime["apiGid"]),"--game-channel",runtime["channelId"]],check=True)
    return release_env(manifest,app_root,run_root,env_name,slot)

def preflight(manifest_path: Path, runner: Runner, app_root: Path, config_root:Path, run_root: Path, data_root: Path) -> tuple[dict[str, Any], Path]:
    manifest = validate_manifest(manifest_path, app_root, data_root)
    runtime = manifest["runtimeNonSecret"]
    if data_root != Path(runtime["dataRoot"]):
        raise ReleaseError("data root mismatch")
    source=source_identity(app_root,runner)
    if source!=manifest["sourceSha"]:
        raise ReleaseError("checked out source SHA does not match manifest")
    result = runner.run(["findmnt", "-n", "-o", "TARGET,UUID", "--target", str(data_root)])
    fields=result.stdout.strip().split()
    if fields != [str(data_root),runtime["dataVolumeUuid"]]:
        raise ReleaseError("data volume UUID mismatch or volume is not mounted")
    for directory in (data_root / "postgres", data_root / "redis", data_root / "caddy-data", data_root / "caddy-config"):
        if not directory.is_dir():
            raise ReleaseError(f"required bind directory missing: {directory}")
    source_root=run_root/"source-secrets" if (run_root/"source-secrets").is_dir() else config_root/"secrets"
    for name in SECRET_FILES:check_secret(source_root/name)
    slot = candidate_slot(config_root)
    env_file = release_env(manifest, app_root, run_root,"candidate-release.env",slot)
    runner.run(["docker", "compose", "--env-file", str(env_file), "-f", str(app_root / COMPOSE_PATH), "config", "--quiet"])
    return manifest, env_file

def installed_runtime_destinations(lib_root:Path,unit_root:Path)->dict[str,Path]:return {
    "tools/ops/release.py":lib_root/"release.py","tools/ops/supervise.sh":lib_root/"supervise.sh",
    "tools/ops/supervise-slot.sh":lib_root/"supervise-slot.sh",
    "tools/ops/prepare-secrets.sh":lib_root/"prepare-secrets.sh","tools/ops/fetch-release.py":lib_root/"fetch-release.py",
    "tools/ops/prepare-collector-client.py":lib_root/"prepare-collector-client.py",
    "tools/ops/production-status.py":lib_root/"production-status.py","tools/ops/backup-postgres.sh":lib_root/"backup-postgres.sh",
    "tools/ops/fetch-runtime-secrets.py":lib_root/"fetch-runtime-secrets.py",
    "tools/ops/upload-backup.py":lib_root/"upload-backup.py",
    "tools/ops/load-registry-auth.py":lib_root/"load-registry-auth.py",
    "deploy/systemd/rogimarble-app.service":unit_root/"rogimarble-app.service",
    "deploy/systemd/rogimarble-slot@.service":unit_root/"rogimarble-slot@.service",
    "deploy/systemd/rogimarble-secrets.service":unit_root/"rogimarble-secrets.service",
    "deploy/systemd/rogimarble-update.service":unit_root/"rogimarble-update.service","deploy/systemd/rogimarble-update.timer":unit_root/"rogimarble-update.timer",
    "deploy/systemd/rogimarble-backup.service":unit_root/"rogimarble-backup.service","deploy/systemd/rogimarble-backup.timer":unit_root/"rogimarble-backup.timer"}

def verify_installed_runtime(manifest:dict[str,Any],lib_root:Path,unit_root:Path)->None:
    for relative,destination in installed_runtime_destinations(lib_root,unit_root).items():
        if not destination.is_file() or sha256(destination)!=manifest["runtimeFiles"][relative]:raise ReleaseError(f"installed runtime file checksum mismatch: {relative}")

def prepare_active(manifest_path:Path,runner:Runner=Runner(),*,app_root:Path=APP_ROOT,config_root:Path=CONFIG_ROOT,run_root:Path=RUN_ROOT,data_root:Path=DATA_ROOT,lib_root:Path|None=None,unit_root:Path|None=None)->Path:
    manifest=validate_manifest(manifest_path,app_root,data_root);runtime=manifest["runtimeNonSecret"]
    source=source_identity(app_root,runner)
    if source!=manifest["sourceSha"]:raise ReleaseError("checked out source SHA does not match manifest")
    fields=runner.run(["findmnt","-n","-o","TARGET,UUID","--target",str(data_root)]).stdout.strip().split()
    if fields!=[str(data_root),runtime["dataVolumeUuid"]]:raise ReleaseError("data volume UUID mismatch or volume is not mounted")
    for directory in (data_root/"postgres",data_root/"redis",data_root/"caddy-data",data_root/"caddy-config"):
        if not directory.is_dir():raise ReleaseError(f"required bind directory missing: {directory}")
    if lib_root is not None and unit_root is not None:verify_installed_runtime(manifest,lib_root,unit_root)
    slot = active_slot(config_root) or "green"
    prepare_runtime(manifest,app_root,config_root,run_root,f"release-{slot}.env",slot)
    return release_env(manifest,app_root,run_root,"release.env",slot)

def install_runtime_files(manifest:dict[str,Any],app_root:Path,lib_root:Path,unit_root:Path)->None:
    destinations=installed_runtime_destinations(lib_root,unit_root)
    lib_root.mkdir(parents=True,exist_ok=True);unit_root.mkdir(parents=True,exist_ok=True)
    for relative,destination in destinations.items():
        source=app_root/relative;temporary=destination.with_name(f".{destination.name}.{os.getpid()}")
        shutil.copyfile(source,temporary);temporary.chmod(0o755 if destination.suffix in (".py",".sh") else 0o644);temporary.replace(destination)
    verify_installed_runtime(manifest,lib_root,unit_root)

def restore_prior_runtime_files(manifest: dict[str, Any], app_root: Path,
                                lib_root: Path, unit_root: Path) -> None:
    destinations = installed_runtime_destinations(lib_root, unit_root)
    for relative in manifest["runtimeFiles"]:
        destination = destinations.get(relative)
        if destination is None:
            raise ReleaseError(f"cannot restore prior runtime file: {relative}")
        source = app_root / relative
        if sha256(source) != manifest["runtimeFiles"][relative]:
            raise ReleaseError(f"prior runtime file checksum mismatch: {relative}")
        temporary = destination.with_name(f".{destination.name}.restore.{os.getpid()}")
        shutil.copyfile(source, temporary)
        temporary.chmod(0o755 if destination.suffix in (".py", ".sh") else 0o644)
        temporary.replace(destination)

def restore_collector_link(link:Path,previous_target:str|None)->None:
    temporary=link.with_name(f".{link.name}.rollback.{os.getpid()}")
    temporary.unlink(missing_ok=True)
    if previous_target is None:
        link.unlink(missing_ok=True)
        return
    temporary.symlink_to(previous_target)
    temporary.replace(link)

def reload_edge(slot: str, manifest: dict[str, Any], runner: Runner, app_root: Path, env_file: Path) -> None:
    compose = ["docker", "compose", "--env-file", str(env_file), "-f", str(app_root / COMPOSE_PATH)]
    edge_id = _checked_output(runner.run(compose + ["ps", "-q", "edge"], check=False), "edge lookup").strip()
    if not edge_id:
        raise ReleaseError("edge container is missing")
    config = (app_root / "deploy/Caddyfile.production").read_text(encoding="utf-8")
    for key, value in (("API_UPSTREAM", f"api-{slot}:4000"), ("WEB_UPSTREAM", f"web-{slot}:3000")):
        placeholder = "{$" + key + "}"
        if placeholder not in config:
            raise ReleaseError(f"Caddy template is missing {placeholder}")
        config = config.replace(placeholder, value)
    runner.run(["docker", "exec", "-i", edge_id, "caddy", "reload",
                "--config", "-", "--adapter", "caddyfile"], input=config)

def smoke(manifest: dict[str, Any], runner: Runner, sleep: Callable[[float], None]) -> None:
    for url in (f"https://{manifest['runtimeNonSecret']['webDomain']}/healthz",
                f"https://{manifest['runtimeNonSecret']['apiDomain']}/ready"):
        for attempt in range(30):
            result = runner.run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5", url], check=False)
            if result.returncode == 0:
                break
            if attempt == 29:
                raise ReleaseError(f"smoke check failed: {url}")
            sleep(2)

def wait_for_services(compose: list[str], runner: Runner, expected: set[str],
                      sleep: Callable[[float], None]) -> None:
    for attempt in range(60):
        state = runner.run(compose + ["ps", "--format", "json"], check=False)
        if containers_healthy({"ok": state.returncode == 0, "output": state.stdout}, expected):
            return
        if attempt == 59:
            raise ReleaseError("container health did not settle after activation")
        sleep(1)

def deploy(manifest_path: Path, runner: Runner = Runner(), *, app_root: Path = APP_ROOT,
           config_root:Path=CONFIG_ROOT,run_root: Path = RUN_ROOT, data_root: Path = DATA_ROOT,
           lib_root:Path=Path("/usr/local/lib/rogimarble"),unit_root:Path=Path("/etc/systemd/system"),
           active_link:Path|None=None,sleep: Callable[[float], None] = time.sleep,
           capacity_check: Callable[[], None] = ensure_deploy_capacity) -> None:
    run_root.mkdir(mode=0o750, parents=True, exist_ok=True)
    lock_path = run_root / "deploy.lock"
    with lock_path.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ReleaseError("another marble deployment holds the host lock") from exc
        manifest, env_file = preflight(manifest_path, runner, app_root,config_root,run_root, data_root)
        old_slot = active_slot(config_root)
        next_slot = candidate_slot(config_root)
        old_manifest_path = config_root / "release.json"
        old_manifest_bytes = old_manifest_path.read_bytes() if old_manifest_path.is_file() else None
        old_manifest = json.loads(old_manifest_bytes) if old_manifest_bytes else None
        old_root = active_link.resolve() if active_link is not None and active_link.is_symlink() else None
        old_env_path = run_root / "release.env"
        old_env_bytes = old_env_path.read_bytes() if old_env_path.is_file() else None
        if old_manifest is not None and active_link is not None and (old_root is None or old_env_bytes is None):
            raise ReleaseError("previous release checkout or runtime env is missing")
        if old_slot:
            if old_manifest is None:
                raise ReleaseError("active slot has no manifest")
            if any(manifest["images"][name] != old_manifest["images"][name]
                   for name in ("caddy", "postgres", "redis")):
                raise ReleaseError("online deployment cannot replace data or edge images")
            if manifest["runtimeNonSecret"] != old_manifest["runtimeNonSecret"]:
                raise ReleaseError("online deployment requires unchanged host runtime settings")
            if runner.run(["systemctl", "is-active", "--quiet", "rogimarble-app.service"], check=False).returncode != 0:
                raise ReleaseError("core supervisor is not active")
            if runner.run(["systemctl", "is-active", "--quiet", f"rogimarble-slot@{old_slot}.service"], check=False).returncode != 0:
                raise ReleaseError("active application slot is not supervised")
        reclaim_old_app_images(manifest, runner)
        capacity_check()
        collector_link=run_root/"collector-client"
        previous_collector_target=os.readlink(collector_link) if collector_link.is_symlink() else None
        route_switched = False
        activated = False
        candidate_started = False
        old_stopped = False
        compose = ["docker", "compose", "--env-file", str(env_file), "-f", str(app_root / COMPOSE_PATH)]
        slot_services = [f"api-{next_slot}", f"web-{next_slot}"]
        try:
            prepare_runtime(manifest,app_root,config_root,run_root,"candidate-release.env",next_slot)
            registry=run_root/"docker-auth";shutil.rmtree(registry,ignore_errors=True)
            try:
                runner.run(["python3",str(app_root/"tools/ops/load-registry-auth.py"),"--metadata",str(config_root/"registry.json"),"--output",str(registry)])
                runner.run(["docker","--config",str(registry),"compose","--env-file",str(env_file),"-f",str(app_root/COMPOSE_PATH),"pull"])
            finally:shutil.rmtree(registry,ignore_errors=True)
            if old_manifest is None:
                runner.run(compose + ["up", "-d", "--no-build", "--wait", "postgres", "redis"])
            runner.run(compose + ["run", "--rm", "--no-deps", "migrate"])
            if old_slot:
                smoke(old_manifest, runner, sleep)
            if runner.run(["systemctl", "is-active", "--quiet", f"rogimarble-slot@{next_slot}.service"], check=False).returncode == 0:
                raise ReleaseError("candidate slot supervisor is unexpectedly active")
            runner.run(compose + ["rm", "-sf", *slot_services])
            runner.run(compose + ["up", "-d", "--no-deps", "--no-build", "--wait", *slot_services])
            candidate_started = True
            wait_for_services(compose, runner, set(slot_services), sleep)
            (run_root / f"release-{next_slot}.env").write_bytes(env_file.read_bytes())
            (run_root / f"release-{next_slot}.env").chmod(0o600)
            activated = True
            install_runtime_files(manifest,app_root,lib_root,unit_root)
            runner.run(["systemctl","daemon-reload"])
            if active_link is not None:
                temporary=active_link.with_name(f".{active_link.name}.{os.getpid()}")
                temporary.symlink_to(app_root);temporary.replace(active_link)
            manifest_temp=config_root/f"release.json.{os.getpid()}"
            manifest_temp.write_bytes(manifest_path.read_bytes());manifest_temp.chmod(0o600);manifest_temp.replace(old_manifest_path)
            (run_root/"candidate-release.env").replace(run_root/"release.env")
            write_active_slot(config_root,next_slot)
            if not old_slot:
                runner.run(["systemctl", "restart", "rogimarble-app.service"])
                runner.run(["systemctl", "enable", "rogimarble-app.service"])
            runner.run(["systemctl", "start", f"rogimarble-slot@{next_slot}.service"])
            runner.run(["systemctl", "enable", f"rogimarble-slot@{next_slot}.service"])
            if runner.run(["systemctl", "is-active", "--quiet", f"rogimarble-slot@{next_slot}.service"], check=False).returncode != 0:
                raise ReleaseError("candidate slot supervisor did not stay active")
            if old_slot:
                route_switched = True
                reload_edge(next_slot, manifest, runner, app_root, env_file)
            smoke(manifest, runner, sleep)
            active_compose = ["docker", "compose", "--env-file", str(run_root / "release.env"), "-f", str(app_root / COMPOSE_PATH)]
            wait_for_services(active_compose, runner, CORE_SERVICES | set(slot_services), sleep)
            if old_slot:
                runner.run(["systemctl", "stop", f"rogimarble-slot@{old_slot}.service"])
                old_stopped = True
                runner.run(["systemctl", "disable", f"rogimarble-slot@{old_slot}.service"])
            reclaim_old_app_images(manifest, runner)
            deployed = config_root / "deployed-release.json"
            receipt={"status":"deployed","deployedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"releaseId":manifest["releaseId"],"sourceSha":manifest["sourceSha"],"images":manifest["images"],"slot":next_slot}
            receipt_temp = config_root / f".deployed-release.{os.getpid()}.json"
            receipt_temp.write_text(json.dumps(receipt, sort_keys=True, indent=2) + "\n", encoding="utf-8")
            receipt_temp.chmod(0o600)
            receipt_temp.replace(deployed)
        except Exception:
            if old_stopped:
                runner.run(["systemctl", "enable", f"rogimarble-slot@{old_slot}.service"])
                runner.run(["systemctl", "start", f"rogimarble-slot@{old_slot}.service"])
            if old_slot and route_switched:
                try:
                    reload_edge(old_slot, old_manifest, runner, app_root, env_file)
                except Exception as exc:
                    raise ReleaseError(f"route rollback failed; old slot must be restored manually: {exc}") from exc
            if old_slot and activated:
                if old_root is not None and active_link is not None:
                    temporary=active_link.with_name(f".{active_link.name}.rollback.{os.getpid()}")
                    temporary.symlink_to(old_root);temporary.replace(active_link)
                    restore_prior_runtime_files(old_manifest,old_root,lib_root,unit_root)
                    runner.run(["systemctl","daemon-reload"])
                if old_manifest_bytes is not None:
                    old_manifest_path.write_bytes(old_manifest_bytes)
                if old_env_bytes is not None:
                    old_env_path.write_bytes(old_env_bytes)
                    old_env_path.chmod(0o600)
                write_active_slot(config_root,old_slot)
            elif activated and old_manifest_bytes is not None:
                if old_root is not None and active_link is not None:
                    temporary=active_link.with_name(f".{active_link.name}.rollback.{os.getpid()}")
                    temporary.symlink_to(old_root);temporary.replace(active_link)
                    restore_prior_runtime_files(old_manifest,old_root,lib_root,unit_root)
                    runner.run(["systemctl","daemon-reload"])
                old_manifest_path.write_bytes(old_manifest_bytes)
                if old_env_bytes is not None:
                    old_env_path.write_bytes(old_env_bytes)
                    old_env_path.chmod(0o600)
                (config_root / "active-slot").unlink(missing_ok=True)
                runner.run(["systemctl","restart","rogimarble-app.service"],check=False)
            if candidate_started:
                runner.run(["systemctl","stop",f"rogimarble-slot@{next_slot}.service"],check=False)
                runner.run(["systemctl","disable",f"rogimarble-slot@{next_slot}.service"],check=False)
                runner.run(compose + ["stop", "--timeout", "45", *slot_services],check=False)
            restore_collector_link(collector_link,previous_collector_target)
            raise

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--prepare-active",action="store_true")
    parser.add_argument("--app-root",type=Path,default=APP_ROOT)
    args = parser.parse_args()
    try:
        if args.prepare_active:
            prepare_active(args.manifest,lib_root=Path("/usr/local/lib/rogimarble"),unit_root=Path("/etc/systemd/system"))
        elif args.check_only:
            preflight(args.manifest, Runner(), args.app_root,CONFIG_ROOT,RUN_ROOT, DATA_ROOT)
        else:
            deploy(args.manifest,app_root=args.app_root,active_link=APP_ROOT if args.app_root!=APP_ROOT else None)
    except (ReleaseError, OSError, subprocess.CalledProcessError) as exc:
        print(f"release failed: {exc}", file=sys.stderr)
        return 1
    print("release validation passed" if args.check_only else "release deployed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
