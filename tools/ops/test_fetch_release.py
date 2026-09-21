from __future__ import annotations
import hashlib,importlib.util,io,json,tarfile,tempfile,unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("fetch_release",Path(__file__).with_name("fetch-release.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class FetchReleaseTest(unittest.TestCase):
  def test_public_release_is_checksum_and_source_tag_bound(self):
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);releases=root/"releases";releases.mkdir();run=root/"run"
    source=root/"source.json";source.write_text(json.dumps({"repository":"owner/repo","workflowPath":".github/workflows/release.yml"}));overlay=root/"overlay.json";overlay.write_text(json.dumps({"runtime":"host-only"}))
    sha="b"*40;build={"schemaVersion":1,"product":"rogimarble","profile":"feedback","sourceSha":sha,"releaseId":"r1","contractVersion":"v1","composeSha256":"a"*64,"runtimeFiles":{},"images":{},"migrations":[]}
    stream=io.BytesIO()
    with tarfile.open(fileobj=stream,mode="w:gz") as archive:
      body=json.dumps(build).encode();entry=tarfile.TarInfo("manifest.build.json");entry.size=len(body);archive.addfile(entry,io.BytesIO(body))
      body=b"source";entry=tarfile.TarInfo("README.md");entry.size=len(body);archive.addfile(entry,io.BytesIO(body))
    bundle=stream.getvalue();checksum=hashlib.sha256(bundle).hexdigest().encode()
    metadata=json.dumps({"draft":False,"prerelease":False,"tag_name":f"production-{sha}","assets":[{"name":"release-bundle.tar.gz","browser_download_url":"bundle"},{"name":"release-bundle.tar.gz.sha256","browser_download_url":"checksum"}]}).encode()
    runs=json.dumps({"workflow_runs":[{"path":".github/workflows/release.yml","conclusion":"success","head_sha":sha,"head_branch":"main","event":"push"}]}).encode()
    prior=module.download;module.download=lambda url,limit:{f"{module.API}/repos/owner/repo/releases/latest":metadata,f"{module.API}/repos/owner/repo/actions/runs?head_sha={sha}&per_page=100":runs,"bundle":bundle,"checksum":checksum}[url];self.addCleanup(setattr,module,"download",prior)
    app,manifest=module.stage(source,overlay,releases,run);self.assertEqual(app,releases/"r1");self.assertEqual(json.loads(manifest.read_text())["runtimeNonSecret"],{"runtime":"host-only"})

  def test_archive_rejects_parent_traversal(self):
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);archive=root/"bad.tar.gz"
    with tarfile.open(archive,"w:gz") as bundle:entry=tarfile.TarInfo("../escape");entry.size=1;bundle.addfile(entry,io.BytesIO(b"x"))
    with self.assertRaises(module.FetchError):module.safe_extract(archive,root/"out")

if __name__=="__main__":unittest.main()
