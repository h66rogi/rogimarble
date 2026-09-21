#!/usr/bin/env python3
from __future__ import annotations
import argparse, os, re, shutil, stat, subprocess, tempfile
from pathlib import Path

REQUIRED={"CHECK_ADDRESS","CHECK_SERVER_NAME","CHECK_CHANNEL"}
OPTIONAL={"CHECK_CONSUMER","CHECK_CA_FILE","CHECK_CERT_FILE","CHECK_KEY_FILE"}
SAFE_ID=re.compile(r"^[A-Za-z0-9._-]{1,128}$")
HOST=re.compile(r"^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|(?:[0-9]{1,3}\.){3}[0-9]{1,3}):[1-9][0-9]{0,4}$")
DNS=re.compile(r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$")

def regular_private(path:Path)->None:
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode&0o077 or not 1<=info.st_size<=65536:
        raise ValueError(f"collector credential must be a private regular file: {path.name}")

def read_config(path:Path)->dict[str,str]:
    regular_private(path); values={}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line=raw.strip()
        if not line or line.startswith("#"):continue
        if "=" not in line:raise ValueError("collector config must use KEY=VALUE lines")
        key,value=line.split("=",1)
        if key not in REQUIRED|OPTIONAL or key in values or value!=value.strip() or any(c in value for c in "\r\n\0"):
            raise ValueError("collector config contains an unsupported, duplicate, or unsafe field")
        values[key]=value
    if not REQUIRED<=values.keys():raise ValueError("collector config is missing required fields")
    if not HOST.fullmatch(values["CHECK_ADDRESS"]) or not DNS.fullmatch(values["CHECK_SERVER_NAME"]):raise ValueError("collector target or TLS authority is invalid")
    for key in ("CHECK_CHANNEL","CHECK_CONSUMER"):
        if key in values and not SAFE_ID.fullmatch(values[key]):raise ValueError(f"invalid {key}")
    return values

def openssl(*args:str)->str:
    return subprocess.run(["openssl",*args],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout

def validate_pair(source:Path)->None:
    cert,key,ca=source/"client.pem",source/"client.key",source/"ca.pem"
    for path in (cert,key,ca):regular_private(path)
    openssl("x509","-in",str(cert),"-noout","-checkend",str(30*24*60*60))
    openssl("verify","-CAfile",str(ca),str(cert))
    cert_pub=openssl("x509","-in",str(cert),"-pubkey","-noout")
    key_pub=openssl("pkey","-in",str(key),"-pubout")
    if cert_pub!=key_pub:raise ValueError("collector client certificate and key do not match")
    text=openssl("x509","-in",str(cert),"-noout","-ext","subjectAltName")
    if "URI:spiffe://rogi-collector/rogimarble/reader" not in text:raise ValueError("collector reader URI SAN is missing")

def prepare(source:Path,target_root:Path,uid:int,gid:int,game_channel:str)->Path:
    if not SAFE_ID.fullmatch(game_channel):raise ValueError("invalid game channel")
    target_root.mkdir(mode=0o750,parents=True,exist_ok=True)
    generation=Path(tempfile.mkdtemp(prefix="collector-client.",dir=target_root));generation.chmod(0o710)
    try:
        if source.exists():
            if source.is_symlink() or not source.is_dir():raise ValueError("collector credential source must be a directory")
            config=read_config(source/"check.env");validate_pair(source)
            for name in ("ca.pem","client.pem","client.key"):
                target=generation/name;target.write_bytes((source/name).read_bytes());target.chmod(0o400);os.chown(target,uid,gid)
            consumer=config.get("CHECK_CONSUMER","rogimarble")
            body=("COLLECTOR_ENABLED=true\n"+f"COLLECTOR_TARGET={config['CHECK_ADDRESS']}\nCOLLECTOR_SERVER_NAME={config['CHECK_SERVER_NAME']}\n"
                  f"COLLECTOR_CA_FILE=/run/collector-client/ca.pem\nCOLLECTOR_CERT_FILE=/run/collector-client/client.pem\nCOLLECTOR_KEY_FILE=/run/collector-client/client.key\n"
                  f"COLLECTOR_CONSUMER_ID={consumer}\nCOLLECTOR_CHANNEL_ID={config['CHECK_CHANNEL']}\nCOLLECTOR_GAME_CHANNEL_ID={game_channel}\n")
        else: body="COLLECTOR_ENABLED=false\n"
        config_path=generation/"collector.env";config_path.write_text(body,encoding="utf-8");config_path.chmod(0o400);os.chown(config_path,uid,gid)
        os.chown(generation,uid,gid)
        link=target_root/"collector-client";temporary=target_root/f".collector-client.{os.getpid()}";temporary.symlink_to(generation.name);temporary.replace(link)
        return link
    except Exception:
        shutil.rmtree(generation,ignore_errors=True);raise

def main()->int:
    parser=argparse.ArgumentParser();parser.add_argument("--source",type=Path,default=Path("/etc/rogimarble/collector-client"));parser.add_argument("--run-root",type=Path,default=Path("/run/rogimarble"));parser.add_argument("--uid",type=int,required=True);parser.add_argument("--gid",type=int,required=True);parser.add_argument("--game-channel",required=True);args=parser.parse_args()
    if not 1<=args.uid<=65535 or not 1<=args.gid<=65535:raise SystemExit("invalid API uid/gid")
    try:prepare(args.source,args.run_root,args.uid,args.gid,args.game_channel);return 0
    except Exception as error:print(f"collector client preparation failed: {error}",file=__import__('sys').stderr);return 1
if __name__=="__main__":raise SystemExit(main())
