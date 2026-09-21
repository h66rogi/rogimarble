#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,os,re,tarfile,tempfile,urllib.request
from pathlib import Path,PurePosixPath

API="https://api.github.com"; MAX_ARCHIVE=100*1024*1024
class FetchError(RuntimeError):pass
def read_json(path:Path):return json.loads(path.read_text(encoding="utf-8"))
def exact(value,keys,label):
    if not isinstance(value,dict) or set(value)!=set(keys):raise FetchError(f"invalid {label} fields")
    return value
def download(url:str,limit:int)->bytes:
    request=urllib.request.Request(url,headers={"Accept":"application/vnd.github+json","User-Agent":"rogimarble-release-host/1"})
    with urllib.request.urlopen(request,timeout=20) as response:
        length=int(response.headers.get("Content-Length","0"));
        if length>limit:raise FetchError("release asset exceeds size limit")
        data=response.read(limit+1)
    if len(data)>limit:raise FetchError("release asset exceeds size limit")
    return data
def safe_extract(archive:Path,target:Path)->None:
    with tarfile.open(archive,"r:gz") as bundle:
        members=bundle.getmembers()
        for member in members:
            path=PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk() or not(member.isdir() or member.isfile()):raise FetchError("unsafe release archive entry")
        bundle.extractall(target,filter="data")
def can_skip(active, candidate, receipt, unit_ok:bool, health_ok:bool)->bool:
    return bool(isinstance(active,dict) and isinstance(receipt,dict) and active.get("sourceSha")==candidate.get("sourceSha") and receipt.get("status")=="deployed" and receipt.get("sourceSha")==candidate.get("sourceSha") and receipt.get("releaseId")==candidate.get("releaseId") and receipt.get("images")==candidate.get("images") and unit_ok and health_ok)
def stage(source_path:Path,overlay_path:Path,releases_root:Path,run_root:Path,current_sha:str|None=None)->tuple[Path,Path]:
    source=exact(read_json(source_path),{"repository","workflowPath"},"release source");repo=source["repository"]
    if not isinstance(repo,str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",repo):raise FetchError("invalid public GitHub repository")
    release=download(f"{API}/repos/{repo}/releases/latest",1024*1024);metadata=json.loads(release)
    if metadata.get("draft") or metadata.get("prerelease"):raise FetchError("latest release is not a production release")
    assets={item.get("name"):item.get("browser_download_url") for item in metadata.get("assets",[]) if isinstance(item,dict)}
    if set(("release-bundle.tar.gz","release-bundle.tar.gz.sha256"))-assets.keys():raise FetchError("release assets are incomplete")
    archive_bytes=download(assets["release-bundle.tar.gz"],MAX_ARCHIVE);checksum=download(assets["release-bundle.tar.gz.sha256"],256).decode().strip().split()[0]
    if not re.fullmatch(r"[0-9a-f]{64}",checksum) or hashlib.sha256(archive_bytes).hexdigest()!=checksum:raise FetchError("release archive checksum mismatch")
    with tempfile.TemporaryDirectory(dir=releases_root) as temporary:
        temp=Path(temporary);archive=temp/"bundle.tar.gz";archive.write_bytes(archive_bytes);tree=temp/"tree";tree.mkdir();safe_extract(archive,tree)
        build=read_json(tree/"manifest.build.json");expected={"schemaVersion","product","profile","sourceSha","releaseId","contractVersion","composeSha256","runtimeFiles","images","migrations"}
        exact(build,expected,"build manifest")
        if metadata.get("tag_name")!=f"production-{build.get('sourceSha')}":raise FetchError("release tag does not bind manifest source SHA")
        workflow_path=source["workflowPath"]
        if workflow_path!=".github/workflows/release.yml":raise FetchError("unapproved release workflow path")
        runs=json.loads(download(f"{API}/repos/{repo}/actions/runs?head_sha={build['sourceSha']}&per_page=100",4*1024*1024))
        if not any(item.get("path")==workflow_path and item.get("conclusion")=="success" and item.get("head_sha")==build["sourceSha"] and item.get("head_branch")=="main" and item.get("event")=="push" for item in runs.get("workflow_runs",[]) if isinstance(item,dict)):
            raise FetchError("required successful main release workflow run is absent")
        if current_sha and current_sha!=build["sourceSha"]:
            comparison=json.loads(download(f"{API}/repos/{repo}/compare/{current_sha}...{build['sourceSha']}",4*1024*1024))
            if comparison.get("status")!="ahead":raise FetchError("automatic release must be a descendant of the active source; use explicit manual rollback")
        runtime=read_json(overlay_path);manifest={**build,"runtimeNonSecret":runtime}
        release_id=build.get("releaseId");
        if not isinstance(release_id,str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}",release_id):raise FetchError("invalid release id")
        destination=releases_root/release_id
        if not destination.exists():
            (tree/"manifest.build.json").unlink();os.rename(tree,destination)
            marker=destination/".release-source-sha";marker.write_text(build["sourceSha"]+"\n",encoding="ascii");marker.chmod(0o444)
    candidate=run_root/"candidate";candidate.mkdir(parents=True,exist_ok=True);manifest_path=candidate/"release.json";temporary_manifest=candidate/f"release.json.{os.getpid()}"
    temporary_manifest.write_text(json.dumps(manifest,sort_keys=True,indent=2)+"\n",encoding="utf-8");temporary_manifest.chmod(0o600);temporary_manifest.replace(manifest_path)
    return destination,manifest_path
def main():
    parser=argparse.ArgumentParser();parser.add_argument("--source",type=Path,default=Path("/etc/rogimarble/release-source.json"));parser.add_argument("--overlay",type=Path,default=Path("/etc/rogimarble/runtime-overlay.json"));parser.add_argument("--releases-root",type=Path,default=Path("/opt/rogimarble/releases"));parser.add_argument("--run-root",type=Path,default=Path("/run/rogimarble"));args=parser.parse_args()
    try:
        active=Path("/etc/rogimarble/release.json")
        active_value=read_json(active) if active.is_file() else None
        app,manifest=stage(args.source,args.overlay,args.releases_root,args.run_root,active_value.get("sourceSha") if active_value else None)
        candidate=read_json(manifest);receipt_path=args.run_root/"deployed-release.json";receipt=read_json(receipt_path) if receipt_path.is_file() else None
        if active_value and active_value.get("sourceSha")==candidate.get("sourceSha"):
            unit=__import__('subprocess').run(["systemctl","is-active","--quiet","rogimarble-app.service"])
            health=__import__('subprocess').run(["curl","--fail","--silent","--show-error","--max-time","5","https://marble-api.rogi.chat/ready"])
            if can_skip(active_value,candidate,receipt,unit.returncode==0,health.returncode==0):return 0
        os.execv("/usr/bin/python3",["python3","/usr/local/lib/rogimarble/release.py","--manifest",str(manifest),"--app-root",str(app)])
    except (FetchError,OSError,ValueError,json.JSONDecodeError) as error:print(f"release fetch failed: {error}",file=__import__('sys').stderr);return 1
if __name__=="__main__":raise SystemExit(main())
