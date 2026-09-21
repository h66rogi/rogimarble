#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,re
from pathlib import Path
def exact(value,keys):
  if not isinstance(value,dict) or set(value)!=set(keys):raise ValueError("backup metadata fields are invalid")
  return value
def upload(path:Path,config_path:Path,client=None)->str:
  if not path.is_file() or path.stat().st_size<1:raise ValueError("backup file is missing or empty")
  config=exact(json.loads(config_path.read_text()),{"region","bucket","prefix"})
  if not re.fullmatch(r"[a-z]{2}-[a-z]+-[0-9]",config["region"]):raise ValueError("invalid backup region")
  if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]",config["bucket"]):raise ValueError("invalid backup bucket")
  if not re.fullmatch(r"[A-Za-z0-9/_-]{1,128}",config["prefix"]):raise ValueError("invalid backup prefix")
  if client is None:
    import boto3
    client=boto3.client("s3",region_name=config["region"])
  key=f"{config['prefix'].rstrip('/')}/{path.name}"
  client.upload_file(str(path),config["bucket"],key,ExtraArgs={"ServerSideEncryption":"AES256"})
  return key
def main():
  parser=argparse.ArgumentParser();parser.add_argument("backup",type=Path);parser.add_argument("--config",type=Path,default=Path("/etc/rogimarble/backup.json"));args=parser.parse_args()
  try:upload(args.backup,args.config);return 0
  except Exception as error:print(f"backup upload failed: {error}",file=__import__('sys').stderr);return 1
if __name__=="__main__":raise SystemExit(main())
