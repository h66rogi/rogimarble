from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from release import (MINIMUM_DEPLOY_FREE_BYTES, ReleaseError, SECRET_FILES, deploy,
                     ensure_deploy_capacity, prepare_active, reclaim_old_app_images,
                     validate_manifest, verify_installed_runtime)

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

class FakeRunner:
    def __init__(self, uuid: str, fail_migrate: bool = False):
        self.uuid = uuid
        self.fail_migrate = fail_migrate
        self.commands: list[list[str]] = []
        self.active_units = {"rogimarble-app.service"}

    def run(self, argv: list[str], *, check: bool = True, input: str | None = None) -> subprocess.CompletedProcess[str]:
        self.commands.append(argv)
        if argv[:3] == ["systemctl", "is-active", "--quiet"]:
            return subprocess.CompletedProcess(argv, 0 if argv[-1] in self.active_units else 3, "", "")
        if argv[:2] == ["systemctl", "start"]:
            self.active_units.add(argv[-1])
        if argv[:2] == ["systemctl", "stop"]:
            self.active_units.discard(argv[-1])
        if argv[-3:] == ["ps", "-q", "edge"]:
            return subprocess.CompletedProcess(argv, 0, "edge-id\n", "")
        if argv[-3:] == ["ps", "--format", "json"]:
            rows=[{"Service":name,"State":"running","Health":"healthy"} for name in ("postgres","redis","edge","api-blue","web-blue","api-green","web-green")]
            return subprocess.CompletedProcess(argv,0,json.dumps(rows),"")
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
        runtime_paths=("deploy/Caddyfile.production","deploy/postgres/init-roles.sh","deploy/systemd/rogimarble-app.service","deploy/systemd/rogimarble-slot@.service","deploy/systemd/rogimarble-secrets.service","deploy/systemd/rogimarble-update.service","deploy/systemd/rogimarble-update.timer","deploy/systemd/rogimarble-backup.service","deploy/systemd/rogimarble-backup.timer","tools/ops/release.py","tools/ops/deploy.sh","tools/ops/supervise.sh","tools/ops/supervise-slot.sh","tools/ops/prepare-secrets.sh","tools/ops/prepare-collector-client.py","tools/ops/install-host.sh","tools/ops/fetch-release.py","tools/ops/production-status.py","tools/ops/backup-postgres.sh","tools/ops/fetch-runtime-secrets.py","tools/ops/upload-backup.py","tools/ops/load-registry-auth.py")
        for relative in runtime_paths:
            target=app/relative;target.parent.mkdir(parents=True,exist_ok=True)
            if relative=="tools/ops/prepare-collector-client.py":target.write_bytes((Path(__file__).parent/"prepare-collector-client.py").read_bytes())
            elif relative=="deploy/Caddyfile.production":target.write_text("reverse_proxy {$API_UPSTREAM}\nreverse_proxy {$WEB_UPSTREAM}\n",encoding="utf-8")
            else:target.write_text(relative+"\n",encoding="utf-8")
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

    def test_app_image_retention_preserves_active_latest_and_unrelated_images(self):
        class ImageRunner:
            def __init__(self):
                self.commands=[]
                self.images={
                    "registry.invalid/api":[
                        {"Id":f"sha256:api-{index}","Created":f"2026-09-{index:02d}T00:00:00Z",
                         "RepoDigests":[f"registry.invalid/api@sha256:{index:064x}"]}
                        for index in range(1,7)
                    ],
                    "registry.invalid/web":[
                        {"Id":f"sha256:web-{index}","Created":f"2026-09-{index:02d}T00:00:00Z",
                         "RepoDigests":[f"registry.invalid/web@sha256:{index:064x}"]}
                        for index in range(1,5)
                    ],
                }
                self.images["registry.invalid/api"][1]["RepoDigests"].append(
                    "registry.invalid/shared@sha256:"+"f"*64
                )
            def run(self,argv,*,check=True):
                self.commands.append(argv)
                if argv==["docker","ps","-aq"]:
                    return subprocess.CompletedProcess(argv,0,"live-container\n","")
                if argv[:3]==["docker","inspect","--format={{.Image}}"]:
                    return subprocess.CompletedProcess(argv,0,"sha256:api-1\n","")
                if argv[:5]==["docker","image","ls","--quiet","--no-trunc"]:
                    return subprocess.CompletedProcess(argv,0,"\n".join(image["Id"] for image in self.images[argv[-1]])+"\n","")
                if argv[:3]==["docker","image","inspect"]:
                    selected={image["Id"]:image for images in self.images.values() for image in images}
                    return subprocess.CompletedProcess(argv,0,json.dumps([selected[image_id] for image_id in argv[3:]]),"")
                if argv[:3]==["docker","image","rm"]:
                    return subprocess.CompletedProcess(argv,0,"","")
                raise AssertionError(argv)
        runner=ImageRunner()
        manifest={"images":{"api":"registry.invalid/api@sha256:"+"a"*64,"web":"registry.invalid/web@sha256:"+"b"*64}}
        result=reclaim_old_app_images(manifest,runner)
        removed={command[-1] for command in runner.commands if command[:3]==["docker","image","rm"]}
        self.assertEqual(result,{"removed":2,"skippedShared":1})
        self.assertEqual(removed,{"sha256:api-3","sha256:web-1"})
        self.assertNotIn("sha256:api-1",removed)
        self.assertNotIn("sha256:api-2",removed)

    def test_low_disk_space_is_rejected_before_pull_with_actionable_error(self):
        class Usage:
            free=MINIMUM_DEPLOY_FREE_BYTES-1
        with self.assertRaisesRegex(ReleaseError,"insufficient Docker disk space.*4.0 GiB required"):
            ensure_deploy_capacity(Path("/path/that/does/not/exist"),disk_usage=lambda _:Usage())

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
        with self.assertRaises(subprocess.CalledProcessError):deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
        self.assertFalse(any(command[:2]==["systemctl","restart"] for command in runner.commands))
        self.assertFalse(any("down" in command or "-v" in command for command in runner.commands))

    def test_failed_online_migration_leaves_active_slot_and_edge_running(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid)
        deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
        previous=(config/"release.json").read_bytes()
        receipt=(config/"deployed-release.json").read_bytes()
        collector_link=run/"collector-client"
        previous_generation=os.readlink(collector_link)
        runner.commands.clear()
        runner.fail_migrate=True
        with self.assertRaises(subprocess.CalledProcessError):
            deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
        self.assertFalse(any(command[:2]==["systemctl","stop"] for command in runner.commands))
        self.assertFalse(any(command[:2]==["systemctl","restart"] for command in runner.commands))
        self.assertEqual(os.readlink(collector_link),previous_generation)
        self.assertEqual((config/"release.json").read_bytes(),previous)
        self.assertEqual((config/"deployed-release.json").read_bytes(),receipt)

    def test_success_order_is_pull_storage_migrate_supervisor_smoke(self):
        temporary, app, config, run, data, uuid, manifest_path = self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid);deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
        rendered=[" ".join(command) for command in runner.commands]
        pull=next(i for i,v in enumerate(rendered) if v.endswith(" pull"));storage=next(i for i,v in enumerate(rendered) if " up -d --no-build --wait postgres redis" in v)
        migrate=next(i for i,v in enumerate(rendered) if " run --rm --no-deps migrate" in v);supervisor=next(i for i,v in enumerate(rendered) if v=="systemctl restart rogimarble-app.service")
        inventories=[i for i,v in enumerate(rendered) if v=="docker ps -aq"]
        self.assertLess(pull,storage);self.assertLess(storage,migrate);self.assertLess(migrate,supervisor)
        self.assertEqual(len(inventories),2);self.assertLess(inventories[0],pull);self.assertGreater(inventories[1],supervisor)
        self.assertTrue((config/"deployed-release.json").is_file())
        self.assertFalse((run/"docker-auth").exists())
        self.assertEqual(digest(run/"lib/supervise.sh"),json.loads(manifest_path.read_text())["runtimeFiles"]["tools/ops/supervise.sh"])
        (run/"lib/supervise.sh").write_text("tampered\n")
        with self.assertRaisesRegex(ReleaseError,"installed runtime file checksum"):verify_installed_runtime(json.loads(manifest_path.read_text()),run/"lib",run/"units")

    def test_online_release_switches_route_before_stopping_old_slot(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid)
        options=dict(app_root=app,config_root=config,run_root=run,data_root=data,
                     lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
        deploy(manifest_path,runner,**options)
        runner.commands.clear()
        deploy(manifest_path,runner,**options)
        commands=runner.commands
        route=next(index for index,command in enumerate(commands) if command[:4]==["docker","exec","-i","edge-id"])
        stop=commands.index(["systemctl","stop","rogimarble-slot@green.service"])
        self.assertLess(route,stop)
        self.assertFalse(any(command in (["systemctl","restart","rogimarble-app.service"],
                                         ["systemctl","stop","rogimarble-app.service"]) for command in commands))
        self.assertEqual((config/"active-slot").read_text().strip(),"blue")
        self.assertEqual(json.loads((config/"deployed-release.json").read_text())["slot"],"blue")

    def test_failed_online_smoke_restores_old_route_and_receipt(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        options=dict(app_root=app,config_root=config,run_root=run,data_root=data,
                     lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
        runner=FakeRunner(uuid)
        deploy(manifest_path,runner,**options)
        receipt=(config/"deployed-release.json").read_bytes()
        class FailingSmokeRunner(FakeRunner):
            def __init__(self,uuid):
                super().__init__(uuid)
                self.active_units={"rogimarble-app.service","rogimarble-slot@green.service"}
                self.route_inputs=[]
            def run(self,argv,*,check=True,input=None):
                if argv[:4]==["docker","exec","-i","edge-id"]:
                    self.route_inputs.append(input)
                if argv[0]=="curl" and len(self.route_inputs)==1:
                    self.commands.append(argv)
                    return subprocess.CompletedProcess(argv,1,"","failed")
                return super().run(argv,check=check,input=input)
        failed=FailingSmokeRunner(uuid)
        with self.assertRaisesRegex(ReleaseError,"smoke check failed"):
            deploy(manifest_path,failed,**options)
        self.assertEqual(len(failed.route_inputs),2)
        self.assertIn("api-blue:4000",failed.route_inputs[0])
        self.assertIn("api-green:4000",failed.route_inputs[1])
        self.assertEqual((config/"active-slot").read_text().strip(),"green")
        self.assertEqual((config/"deployed-release.json").read_bytes(),receipt)
        self.assertIn("rogimarble-slot@green.service",failed.active_units)

    def test_receipt_waits_until_container_starting_health_has_settled(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        class StartingRunner(FakeRunner):
            probes=0
            def run(self,argv,*,check=True):
                result=super().run(argv,check=check)
                if argv[-3:]==["ps","--format","json"]:
                    self.probes+=1
                    if self.probes==1:return subprocess.CompletedProcess(argv,0,result.stdout.replace('healthy','starting'),"")
                return result
        runner=StartingRunner(uuid);waits=[]
        def wait(seconds):
            self.assertFalse((config/"deployed-release.json").exists());waits.append(seconds)
        deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=wait,capacity_check=lambda:None)
        self.assertEqual(waits,[1]);self.assertEqual(runner.probes,3)
        for command in runner.commands:
            if command[-3:]==["ps","--format","json"]:self.assertIn(command[command.index("--env-file")+1],(str(run/"candidate-release.env"),str(run/"release.env")))
        self.assertTrue((config/"deployed-release.json").is_file())

    def test_reboot_restores_runtime_without_losing_successful_receipt(self):
        import shutil
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid)
        deploy(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data,lib_root=run/"lib",unit_root=run/"units",sleep=lambda _:None,capacity_check=lambda:None)
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
        arguments=capture.read_text().splitlines();self.assertIn("--abort-on-container-exit",arguments);self.assertNotIn("--no-recreate",arguments)

    def test_slot_supervisor_exits_when_either_app_exits(self):
        temporary,app,_,run,_,_,_=self.fixture();self.addCleanup(temporary.cleanup)
        source=Path(__file__).resolve().parent/"supervise-slot.sh"
        env_file=run/"release-green.env";env_file.parent.mkdir(parents=True,exist_ok=True);env_file.write_text("IMAGE_API=changed-digest\n")
        fake_bin=run/"bin";fake_bin.mkdir();capture=run/"argv";docker=fake_bin/"docker"
        docker.write_text(f"#!/bin/sh\nprintf '%s\\n' \"$@\" > '{capture}'\n",encoding="utf-8");docker.chmod(0o755)
        environment={**os.environ,"PATH":f"{fake_bin}:{os.environ['PATH']}","ROGIMARBLE_APP_ROOT":str(app),"ROGIMARBLE_ENV_FILE":str(env_file)}
        subprocess.run(["sh",str(source),"green"],check=True,env=environment)
        arguments=capture.read_text().splitlines()
        self.assertIn("--abort-on-container-exit",arguments)
        self.assertIn("--no-recreate",arguments)
        self.assertEqual(arguments[-2:],["api-green","web-green"])

    def test_reboot_prepare_restores_active_env_and_role_scoped_secrets(self):
        temporary,app,config,run,data,uuid,manifest_path=self.fixture();self.addCleanup(temporary.cleanup)
        runner=FakeRunner(uuid);target=prepare_active(manifest_path,runner,app_root=app,config_root=config,run_root=run,data_root=data)
        self.assertEqual(target,run/"release.env");self.assertTrue(target.is_file())
        for name in SECRET_FILES:self.assertEqual((run/"secrets"/name).stat().st_mode & 0o777,0o400)

if __name__ == "__main__":
    unittest.main()
