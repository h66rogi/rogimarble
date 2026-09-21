#!/usr/bin/env python3
import json,shutil,subprocess,time
from pathlib import Path
def command(argv):
  result=subprocess.run(argv,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  return {"ok":result.returncode==0,"output":result.stdout.strip()[:8192]}
manifest=Path("/etc/rogimarble/release.json");receipt=Path("/run/rogimarble/deployed-release.json");backup_root=Path("/srv/rogimarble/backups")
latest=max(backup_root.glob("*.dump.gz"),key=lambda p:p.stat().st_mtime,default=None)
status={"checkedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"manifest":json.loads(manifest.read_text()) if manifest.is_file() else None,
 "receipt":json.loads(receipt.read_text()) if receipt.is_file() else None,"appUnit":command(["systemctl","is-active","rogimarble-app.service"]),
 "containers":command(["docker","compose","--env-file","/run/rogimarble/release.env","-f","/opt/rogimarble/app/deploy/compose.production.yaml","ps","--format","json"]),
 "readiness":command(["curl","--fail","--silent","--show-error","--max-time","5","https://marble-api.rogi.chat/ready"]),
 "dataDisk":shutil.disk_usage("/srv/rogimarble")._asdict(),"latestBackup":{"path":str(latest),"ageSeconds":int(time.time()-latest.stat().st_mtime)} if latest else None}
print(json.dumps(status,sort_keys=True,indent=2))
raise SystemExit(0 if status["appUnit"]["ok"] and status["containers"]["ok"] and status["readiness"]["ok"] else 1)
