#!/usr/bin/env python3
import hashlib,json,os,re,shutil,tarfile,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sha=os.environ['SOURCE_SHA']; release=os.environ.get('RELEASE_ID',f'main-{sha[:12]}')
if not re.fullmatch(r'[0-9a-f]{40}',sha): raise SystemExit('SOURCE_SHA must be lowercase 40 hex')
images={k:os.environ[f'IMAGE_{k.upper()}'] for k in ('api','web','caddy','postgres','redis')}
for k,v in images.items():
 if not re.fullmatch(r'[^\s@]+@sha256:[0-9a-f]{64}',v): raise SystemExit(f'IMAGE_{k.upper()} is not immutable')
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
runtime=['deploy/Caddyfile.production','deploy/postgres/init-roles.sh','deploy/systemd/rogimarble-app.service','deploy/systemd/rogimarble-secrets.service','deploy/systemd/rogimarble-update.service','deploy/systemd/rogimarble-update.timer','deploy/systemd/rogimarble-backup.service','deploy/systemd/rogimarble-backup.timer','tools/ops/release.py','tools/ops/deploy.sh','tools/ops/supervise.sh','tools/ops/prepare-secrets.sh','tools/ops/install-host.sh','tools/ops/fetch-release.py','tools/ops/production-status.py','tools/ops/backup-postgres.sh']
migrations=sorted((root/'packages/database/migrations').glob('*.sql'))
manifest={'schemaVersion':1,'product':'rogimarble','profile':'feedback','sourceSha':sha,'releaseId':release,'contractVersion':'v1','composeSha256':digest(root/'deploy/compose.production.yaml'),'runtimeFiles':{p:digest(root/p) for p in runtime},'images':images,'migrations':[{'path':p.relative_to(root).as_posix(),'sha256':digest(p)} for p in migrations]}
out=root/'dist/release'; shutil.rmtree(out,ignore_errors=True); out.mkdir(parents=True)
with tempfile.TemporaryDirectory() as td:
 stage=Path(td); (stage/'manifest.build.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n')
 for rel in ['deploy','tools/ops','packages/database/migrations']:
  shutil.copytree(root/rel,stage/rel,ignore=shutil.ignore_patterns('.preview','__pycache__','*.pyc','.env','*.png','operator-credentials.json'))
 with tarfile.open(out/'release-bundle.tar.gz','w:gz',format=tarfile.PAX_FORMAT) as tar:
  for p in sorted(stage.rglob('*')): tar.add(p,arcname=p.relative_to(stage),recursive=False)
checksum=digest(out/'release-bundle.tar.gz'); (out/'release-bundle.tar.gz.sha256').write_text(f'{checksum}  release-bundle.tar.gz\n')
print(out)
