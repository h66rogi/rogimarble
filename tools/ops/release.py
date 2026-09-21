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

PRODUCT = "rogimarble"
APP_ROOT = Path("/opt/rogimarble/app")
CONFIG_ROOT = Path("/etc/rogimarble")
RUN_ROOT = Path("/run/rogimarble")
DATA_ROOT = Path("/srv/rogimarble")
COMPOSE_PATH = Path("deploy/compose.production.yaml")
IMAGE_KEYS = {"api", "web", "caddy", "postgres", "redis"}
RUNTIME_FILES = {"deploy/Caddyfile.production", "deploy/postgres/init-roles.sh",
                 "deploy/systemd/rogimarble-app.service", "deploy/systemd/rogimarble-secrets.service",
                 "deploy/systemd/rogimarble-update.service", "deploy/systemd/rogimarble-update.timer",
                 "deploy/systemd/rogimarble-backup.service", "deploy/systemd/rogimarble-backup.timer",
                 "tools/ops/release.py", "tools/ops/deploy.sh", "tools/ops/supervise.sh",
                 "tools/ops/prepare-secrets.sh", "tools/ops/install-host.sh", "tools/ops/fetch-release.py",
                 "tools/ops/production-status.py", "tools/ops/backup-postgres.sh", "tools/ops/fetch-runtime-secrets.py", "tools/ops/upload-backup.py", "tools/ops/load-registry-auth.py"}
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
    def run(self, argv: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(argv, check=check, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def source_identity(app_root:Path,runner:Runner)->str:
    if (app_root/".git").exists():return runner.run(["git","-C",str(app_root),"rev-parse","HEAD"]).stdout.strip()
    marker=app_root/".release-source-sha"
    return marker.read_text(encoding="ascii").strip() if marker.is_file() else ""

def check_secret(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode & 0o077 or info.st_size<1 or info.st_size>8192:
        raise ReleaseError(f"secret must be a regular 0600-style file: {path}")

def release_env(manifest: dict[str, Any], app_root: Path, run_root: Path, name: str = "release.env") -> Path:
    runtime, images = manifest["runtimeNonSecret"], manifest["images"]
    values = {
        "COMPOSE_PROJECT_NAME": runtime["composeProjectName"], "APP_ROOT": str(app_root),
        "DATA_ROOT": runtime["dataRoot"], "RUNTIME_SECRET_ROOT": str(run_root / "secrets"),
        "WEB_DOMAIN": runtime["webDomain"], "API_DOMAIN": runtime["apiDomain"], "ACME_EMAIL_DIRECTIVE": f"email {runtime['acmeEmail']}" if runtime["acmeEmail"] else "",
        "POSTGRES_DB": runtime["postgresDb"], "POSTGRES_ADMIN_USER": runtime["postgresAdminUser"],
        "MIGRATION_DB_USER": runtime["migrationDbUser"], "APP_DB_USER": runtime["appDbUser"],
        "CHANNEL_ID": runtime["channelId"],
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

def prepare_runtime(manifest:dict[str,Any],app_root:Path,config_root:Path,run_root:Path,env_name:str)->Path:
    runtime=manifest["runtimeNonSecret"];source_root=run_root/"source-secrets" if (run_root/"source-secrets").is_dir() else config_root/"secrets";target_root=run_root/"secrets"
    ownership={"postgres_admin_password":(runtime["postgresUid"],runtime["postgresGid"]),"postgres_migration_password":(runtime["postgresUid"],runtime["postgresGid"]),
      "postgres_app_password":(runtime["postgresUid"],runtime["postgresGid"]),"migration_database_url":(runtime["apiUid"],runtime["apiGid"]),
      "api_database_url":(runtime["apiUid"],runtime["apiGid"]),"session_secret":(runtime["apiUid"],runtime["apiGid"])}
    target_root.mkdir(mode=0o711,parents=True,exist_ok=True);target_root.chmod(0o711)
    for name,(uid,gid) in ownership.items():
      source=source_root/name;check_secret(source);target=target_root/name;temporary=target_root/f".{name}.{os.getpid()}"
      temporary.write_bytes(source.read_bytes());temporary.chmod(0o400);os.chown(temporary,uid,gid);temporary.replace(target)
    return release_env(manifest,app_root,run_root,env_name)

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
    env_file = release_env(manifest, app_root, run_root,"candidate-release.env")
    runner.run(["docker", "compose", "--env-file", str(env_file), "-f", str(app_root / COMPOSE_PATH), "config", "--quiet"])
    return manifest, env_file

def installed_runtime_destinations(lib_root:Path,unit_root:Path)->dict[str,Path]:return {
    "tools/ops/release.py":lib_root/"release.py","tools/ops/supervise.sh":lib_root/"supervise.sh",
    "tools/ops/prepare-secrets.sh":lib_root/"prepare-secrets.sh","tools/ops/fetch-release.py":lib_root/"fetch-release.py",
    "tools/ops/production-status.py":lib_root/"production-status.py","tools/ops/backup-postgres.sh":lib_root/"backup-postgres.sh",
    "tools/ops/fetch-runtime-secrets.py":lib_root/"fetch-runtime-secrets.py",
    "tools/ops/upload-backup.py":lib_root/"upload-backup.py",
    "tools/ops/load-registry-auth.py":lib_root/"load-registry-auth.py",
    "deploy/systemd/rogimarble-app.service":unit_root/"rogimarble-app.service","deploy/systemd/rogimarble-secrets.service":unit_root/"rogimarble-secrets.service",
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
    return prepare_runtime(manifest,app_root,config_root,run_root,"release.env")

def install_runtime_files(manifest:dict[str,Any],app_root:Path,lib_root:Path,unit_root:Path)->None:
    destinations=installed_runtime_destinations(lib_root,unit_root)
    lib_root.mkdir(parents=True,exist_ok=True);unit_root.mkdir(parents=True,exist_ok=True)
    for relative,destination in destinations.items():
        source=app_root/relative;temporary=destination.with_name(f".{destination.name}.{os.getpid()}")
        shutil.copyfile(source,temporary);temporary.chmod(0o755 if destination.suffix in (".py",".sh") else 0o644);temporary.replace(destination)
    verify_installed_runtime(manifest,lib_root,unit_root)

def deploy(manifest_path: Path, runner: Runner = Runner(), *, app_root: Path = APP_ROOT,
           config_root:Path=CONFIG_ROOT,run_root: Path = RUN_ROOT, data_root: Path = DATA_ROOT,
           lib_root:Path=Path("/usr/local/lib/rogimarble"),unit_root:Path=Path("/etc/systemd/system"),
           active_link:Path|None=None,sleep: Callable[[float], None] = time.sleep) -> None:
    run_root.mkdir(mode=0o750, parents=True, exist_ok=True)
    lock_path = run_root / "deploy.lock"
    with lock_path.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ReleaseError("another marble deployment holds the host lock") from exc
        manifest, env_file = preflight(manifest_path, runner, app_root,config_root,run_root, data_root)
        prepare_runtime(manifest,app_root,config_root,run_root,"candidate-release.env")
        compose = ["docker", "compose", "--env-file", str(env_file), "-f", str(app_root / COMPOSE_PATH)]
        registry=run_root/"docker-auth";shutil.rmtree(registry,ignore_errors=True)
        try:
            runner.run(["python3",str(app_root/"tools/ops/load-registry-auth.py"),"--metadata",str(config_root/"registry.json"),"--output",str(registry)])
            runner.run(["docker","--config",str(registry),"compose","--env-file",str(env_file),"-f",str(app_root/COMPOSE_PATH),"pull"])
        finally:shutil.rmtree(registry,ignore_errors=True)
        # An attached old Compose supervisor must not race candidate storage recreation.
        restore_previous = False
        if (config_root / "release.json").is_file():
            prior_state = runner.run(["systemctl", "is-active", "rogimarble-app.service"], check=False).stdout.strip()
            restore_previous = prior_state in ("active", "activating", "reloading")
            runner.run(["systemctl", "stop", "rogimarble-app.service"])
        try:
            runner.run(compose + ["up", "-d", "--no-build", "--wait", "postgres", "redis"])
            runner.run(compose + ["run", "--rm", "--no-deps", "migrate"])
        except Exception:
            # No active source, manifest or runtime promotion has occurred yet.
            if restore_previous:
                runner.run(["systemctl", "start", "rogimarble-app.service"], check=False)
            raise
        # Only after a successful forward migration may systemd replace the application set.
        if active_link is not None:
            temporary=active_link.with_name(f".{active_link.name}.{os.getpid()}")
            temporary.symlink_to(app_root);temporary.replace(active_link)
        install_runtime_files(manifest,app_root,lib_root,unit_root)
        runner.run(["systemctl","daemon-reload"])
        active_manifest=config_root/"release.json";manifest_temp=config_root/f"release.json.{os.getpid()}"
        manifest_temp.write_bytes(manifest_path.read_bytes());manifest_temp.chmod(0o600);manifest_temp.replace(active_manifest)
        (run_root/"candidate-release.env").replace(run_root/"release.env")
        runner.run(["systemctl", "restart", "rogimarble-app.service"])
        for url in (f"https://{manifest['runtimeNonSecret']['webDomain']}/healthz",
                    f"https://{manifest['runtimeNonSecret']['apiDomain']}/ready"):
            for attempt in range(30):
                result = runner.run(["curl", "--fail", "--silent", "--show-error", "--max-time", "5", url], check=False)
                if result.returncode == 0:
                    break
                if attempt == 29:
                    raise ReleaseError(f"smoke check failed: {url}")
                sleep(2)
        deployed = config_root / "deployed-release.json"
        receipt={"status":"deployed","deployedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"releaseId":manifest["releaseId"],"sourceSha":manifest["sourceSha"],"images":manifest["images"]}
        receipt_temp = config_root / f".deployed-release.{os.getpid()}.json"
        receipt_temp.write_text(json.dumps(receipt, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        receipt_temp.chmod(0o600)
        receipt_temp.replace(deployed)

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
