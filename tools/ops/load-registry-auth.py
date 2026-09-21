#!/usr/bin/env python3
from __future__ import annotations
import argparse,base64,json,os,re,shutil
from pathlib import Path
def exact(value,keys,label):
  if not isinstance(value,dict) or set(value)!=set(keys):raise ValueError(f"invalid {label} fields")
  return value
def load(metadata_path:Path,output:Path,client=None)->Path:
  metadata=exact(json.loads(metadata_path.read_text()),{"region","secretArn"},"registry metadata")
  if not re.fullmatch(r"[a-z]{2}-[a-z]+-[0-9]",metadata["region"]):raise ValueError("invalid registry region")
  if not re.fullmatch(r"arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+",metadata["secretArn"]):raise ValueError("invalid registry secret ARN")
  if client is None:
    import boto3
    client=boto3.client("secretsmanager",region_name=metadata["region"])
  response=client.get_secret_value(SecretId=metadata["secretArn"],VersionStage="AWSCURRENT")
  value=exact(json.loads(response.get("SecretString","")),{"username","token"},"registry secret")
  if not isinstance(value["username"],str) or not re.fullmatch(r"[A-Za-z0-9-]{1,64}",value["username"]):raise ValueError("invalid registry username")
  if not isinstance(value["token"],str) or not 20<=len(value["token"])<=4096 or any(c in value["token"] for c in "\r\n\0"):raise ValueError("invalid registry token")
  temporary=output.with_name(f".{output.name}.{os.getpid()}");shutil.rmtree(temporary,ignore_errors=True);temporary.mkdir(mode=0o700,parents=True)
  auth=base64.b64encode(f"{value['username']}:{value['token']}".encode()).decode();config=temporary/"config.json";config.write_text(json.dumps({"auths":{"ghcr.io":{"auth":auth}}},separators=(",",":"))+"\n");config.chmod(0o600)
  if output.exists():shutil.rmtree(output)
  temporary.replace(output);return output
def main():
  parser=argparse.ArgumentParser();parser.add_argument("--metadata",type=Path,default=Path("/etc/rogimarble/registry.json"));parser.add_argument("--output",type=Path,required=True);args=parser.parse_args()
  try:load(args.metadata,args.output);return 0
  except Exception as error:print(f"registry authentication failed: {error}",file=__import__('sys').stderr);return 1
if __name__=="__main__":raise SystemExit(main())
