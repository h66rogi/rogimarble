from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from release import ReleaseError, SECRET_FILES, deploy, prepare_active, validate_manifest, verify_installed_runtime

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

class FakeRunner:
    def __init__(self, uuid: str, fail_migrate: bool = False):
        self.uuid = uuid
        self.fail_migrate = fail_migrate
        self.commands: list[list[str]] = []

    def run(self, argv: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
        self.commands.append(argv)
        if argv[0] == "findmnt":
            return subprocess.CompletedProcess(argv, 0, f"{argv[-1]} {self.uuid}\n", "")
        if argv[0] == "git":
            return subprocess.CompletedProcess(argv, 0, "b"*40+"\n", "")
        if self.fail_migrate and "migrate" in argv:
            raise subprocess.CalledProcessError(1, argv, "", "migration failed")
        return subprocess.CompletedProcess(argv, 0, "", "")

class ReleaseTest(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        app = root / "app"; run = root / "run"; data = root / "data"; config=root/"etc"
        (app / "deploy").mkdir(parents=True); (app / "packages/database/migrations").mkdir(parents=True)
        (app/".release-source-sha").write_text("b"*40+"\n",encoding="ascii")
        compose = app / "deploy/compose.production.yaml"; compose.write_text("services: {}\n", encoding="utf-8")
        runtime_paths=("deploy/Caddyfile.production","deploy/postgres/init-roles.sh","deploy/systemd/rogimarble-app.service","deploy/systemd/rogimarble-secrets.service","deploy/systemd/rogimarble-update.service","deploy/systemd/rogimarble-update.timer","deploy/systemd/rogimarble-backup.service","deploy/systemd/rogimarble-backup.timer","tools/ops/release.py","tools/ops/deploy.sh","tools/ops/supervise.sh","tools/ops/prepare-secrets.sh","tools/ops/install-host.sh","tools/ops/fetch-release.py","tools/ops/production-status.py","tools/ops/backup-postgres.sh","tools/ops/fetch-runtime-secrets.py","tools/ops/upload-backup.py","tools/ops/load-registry-auth.py")
        for relative in runtime_paths:
            target=app/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(relative+"\n",encoding="utf-8")
        migration = app / "packages/database/migrations/001_test.sql"; migration.write_text("SELECT 1;\n", encoding="utf-8")
        for name in ("postgres", "redis", "caddy-data", "caddy-config"):
            (data / name).mkdir(parents=True)
        (config / "secrets").mkdir(parents=True)
        for name in SECRET_FILES:
            secret = config / "secrets" / name; secret.write_text("test-only\n", encoding="utf-8"); secret.chmod(0o600)
        uuid = "11111111-2222-3333-4444-555555555555"
        images = {name: f"registry.invalid/{name}@sha256:" + "a" * 64 for name in ("api","web","caddy","postgres","redis")}
        manifest = {"schemaVersion":1,"product":"rogimarble","profile":"feedback","sourceSha":"b"*40,
            "releaseId":"test-release","contractVersion":"v1","composeSha256":digest(compose),"images":images,
            "runtimeFiles":{relative:digest(app/relative) for relative in runtime_paths},
            "migrations":[{"path":"packages/database/migrations/001_test.sql","sha256":digest(migration)}],
            "runtimeNonSecret":{"webDomain":"marble.rogi.chat","apiDomain":"marble-api.rogi.chat","acmeEmail":"ops@example.invalid",
                "channelId":"preview","composeProjectName":"rogimarble-prod","dataRoot":str(data),"dataVolumeUuid":uuid,
                "postgresDb":"rogimarble","postgresAdminUser":"postgres","migrationDbUser":"rogimarble_migrate","appDbUser":"rogimarble_app",
                **{key:os.getuid() or 1 for key in ("apiUid","webUid","postgresUid","redisUid","caddyUid")},
                **{key:os.getgid() or 1 for key in ("apiGid","webGid","postgresGid","redisGid","caddyGid")}}}
        manifest_path = root / "release.json"; manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        return temporary, app, config, run, data, uuid, manifest_path

    def test_manifest_rejects_mutable_image_and_checksum_tampering(self):
        temporary, app, _, _, data, _, manifest_path = self.fixture()
        self.addCleanup(temporary.cleanup)
        value=json.loads(manifest_path.read_text());value["images"]["api"]="registry.invalid/api:latest";manifest_path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ReleaseError,"immutable"):validate_manifest(manifest_path,app,data)
        value["images"]["api"]="registry.invalid/api@sha256:"+"a"*64;value["composeSha256"]="0"*64;manifest_path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ReleaseError,"checksum"):validate_manifest(manifest_path,app,data)

    def test_manifest_rejects_tampered_executed_runtime_file(self):
        temporary,app,_,_,data,_,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        (app/"tools/ops/supervise.sh").write_text("tampered\n",encoding="utf-8")
        with self.assertRaisesRegex(ReleaseError,"runtime file checksum"):validate_manifest(manifest_path,app,data)

    def test_acme_email_is_optional_but_nonempty_value_is_validated_and_rendered_as_complete_directive(self):
        temporary,app,_,run,data,_,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        value=json.loads(manifest_path.read_text());value["runtimeNonSecret"]["acmeEmail"]="";manifest_path.write_text(json.dumps(value));manifest=validate_manifest(manifest_path,app,data)
        from release import release_env
        self.assertIn("ACME_EMAIL_DIRECTIVE=\n",release_env(manifest,app,run).read_text())
        value["runtimeNonSecret"]["acmeEmail"]="ops@example.invalid";manifest_path.write_text(json.dumps(value));manifest=validate_manifest(manifest_path,app,data)
        self.assertIn("ACME_EMAIL_DIRECTIVE=email ops@example.invalid\n",release_env(manifest,app,run).read_text())
        value["runtimeNonSecret"]["acmeEmail"]="not-an-email";manifest_path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ReleaseError,"acmeEmail"):validate_manifest(manifest_path,app,data)

    def test_migration_failure_never_restarts_app(self):
        temporary, app, config, run, data, uuid, manifest_path = self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid,fail_migrate=True)
        with self.assertRaises(subprocess.CalledProcessError):deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None)
        self.assertFalse(any(command[:2]==["systemctl","restart"] for command in runner.commands))
        self.assertFalse(any("down" in command or "-v" in command for command in runner.commands))

    def test_existing_supervisor_is_stopped_before_storage_and_restored_on_failed_migration(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        previous=b'{"sourceSha":"previous"}';(config/"release.json").write_bytes(previous)
        class ActiveRunner(FakeRunner):
            def run(self,argv,*,check=True):
                if argv[:2]==["systemctl","is-active"]:
                    self.commands.append(argv);return subprocess.CompletedProcess(argv,0,"activating\n","")
                return super().run(argv,check=check)
        runner=ActiveRunner(uuid,fail_migrate=True)
        with self.assertRaises(subprocess.CalledProcessError):
            deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None)
        commands=runner.commands
        stop=commands.index(["systemctl","stop","rogimarble-app.service"])
        storage=next(i for i,c in enumerate(commands) if "up" in c)
        self.assertLess(stop,storage)
        self.assertIn(["systemctl","start","rogimarble-app.service"],commands)
        self.assertEqual((config/"release.json").read_bytes(),previous)
        self.assertFalse((config/"deployed-release.json").exists())

    def test_success_order_is_pull_storage_migrate_supervisor_smoke(self):
        temporary, app, config, run, data, uuid, manifest_path = self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid);deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None)
        rendered=[" ".join(command) for command in runner.commands]
        pull=next(i for i,v in enumerate(rendered) if v.endswith(" pull"));storage=next(i for i,v in enumerate(rendered) if " up -d --no-build --wait postgres redis" in v)
        migrate=next(i for i,v in enumerate(rendered) if " run --rm --no-deps migrate" in v);supervisor=next(i for i,v in enumerate(rendered) if v=="systemctl restart rogimarble-app.service")
        self.assertLess(pull,storage);self.assertLess(storage,migrate);self.assertLess(migrate,supervisor)
        self.assertTrue((config/"deployed-release.json").is_file())
        self.assertFalse((run/"docker-auth").exists())
        self.assertEqual(digest(run/"lib/supervise.sh"),json.loads(manifest_path.read_text())["runtimeFiles"]["tools/ops/supervise.sh"])
        (run/"lib/supervise.sh").write_text("tampered\n")
        with self.assertRaisesRegex(ReleaseError,"installed runtime file checksum"):verify_installed_runtime(json.loads(manifest_path.read_text()),run/"lib",run/"units")

    def test_reboot_restores_runtime_without_losing_successful_receipt(self):
        import shutil
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid)
        deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None)
        receipt=(config/"deployed-release.json").read_bytes()
        shutil.rmtree(run)
        prepare_active(config/"release.json",runner,app_root=app,config_root=config,run_root=run,data_root=data)
        self.assertEqual((config/"deployed-release.json").read_bytes(),receipt)
        self.assertTrue((run/"release.env").is_file())

    def test_supervisor_allows_compose_to_recreate_changed_release(self):
        temporary,app,_,run,_,_,_=self.fixture();self.addCleanup(temporary.cleanup)
        source=Path(__file__).resolve().parent/"supervise.sh";(app/"deploy/compose.production.yaml").write_text("services: {}\n")
        env_file=run/"release.env";env_file.parent.mkdir(parents=True,exist_ok=True);env_file.write_text("IMAGE_API=changed-digest\n")
        fake_bin=run/"bin";fake_bin.mkdir();capture=run/"argv";docker=fake_bin/"docker"
        docker.write_text(f"#!/bin/sh\nprintf '%s\\n' \"$@\" > '{capture}'\n",encoding="utf-8");docker.chmod(0o755)
        environment={**os.environ,"PATH":f"{fake_bin}:{os.environ['PATH']}","ROGIMARBLE_APP_ROOT":str(app),"ROGIMARBLE_ENV_FILE":str(env_file)}
        subprocess.run(["sh",str(source)],check=True,env=environment)
        arguments=capture.read_text().splitlines();self.assertIn("--abort-on-container-failure",arguments);self.assertNotIn("--no-recreate",arguments)

    def test_reboot_prepare_restores_active_env_and_role_scoped_secrets(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid);target=prepare_active(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data)
        self.assertEqual(target,run/"release.env");self.assertTrue(target.is_file())
        for name in SECRET_FILES:self.assertEqual((run/"secrets"/name).stat().st_mode & 0o777,0o400)

if __name__ == "__main__":
    unittest.main()
