#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,os,re,shutil,stat
from pathlib import Path

KEYS={"postgres_admin_password","postgres_migration_password","postgres_app_password","migration_database_url","api_database_url","session_secret"}
ARN=re.compile(r"^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$")
def exact(value,keys,label):
  if not isinstance(value,dict) or set(value)!=set(keys):raise ValueError(f"{label} must contain exactly {sorted(keys)}")
  return value
def fetch(config_path:Path,run_root:Path,client=None)->Path:
  config=exact(json.loads(config_path.read_text()),{"region","runtimeSecretArn"},"secret metadata")
  if not isinstance(config["region"],str) or not re.fullmatch(r"[a-z]{2}-[a-z]+-[0-9]",config["region"]):raise ValueError("invalid AWS region")
  if not isinstance(config["runtimeSecretArn"],str) or not ARN.fullmatch(config["runtimeSecretArn"]):raise ValueError("invalid runtime secret ARN")
  if client is None:
    import boto3
    client=boto3.client("secretsmanager",region_name=config["region"])
  response=client.get_secret_value(SecretId=config["runtimeSecretArn"],VersionStage="AWSCURRENT")
  if "SecretString" not in response:raise ValueError("runtime secret must use SecretString JSON")
  values=exact(json.loads(response["SecretString"]),KEYS,"runtime secret")
  generation=run_root/f"source-secrets.{os.getpid()}";generation.mkdir(mode=0o700,parents=True)
  try:
    for name,value in values.items():
      if not isinstance(value,str) or not 1<=len(value.encode())<=8192 or "\0" in value:raise ValueError(f"invalid secret value: {name}")
      target=generation/name;target.write_text(value,encoding="utf-8");target.chmod(0o400)
    link=run_root/"source-secrets";temporary=run_root/f".source-secrets.{os.getpid()}";temporary.symlink_to(generation.name);temporary.replace(link)
    for old in run_root.glob("source-secrets.*"):
      if old!=generation and old.is_dir():shutil.rmtree(old)
    return link
  except Exception:
    shutil.rmtree(generation,ignore_errors=True);raise
def main():
  parser=argparse.ArgumentParser();parser.add_argument("--config",type=Path,default=Path("/etc/rogimarble/secrets-manager.json"));parser.add_argument("--run-root",type=Path,default=Path("/run/rogimarble"));args=parser.parse_args()
  try:fetch(args.config,args.run_root);return 0
  except Exception as error:print(f"runtime secret refresh failed: {error}",file=__import__('sys').stderr);return 1
if __name__=="__main__":raise SystemExit(main())
