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
    current="c"*40;responses={f"{module.API}/repos/owner/repo/releases/latest":metadata,f"{module.API}/repos/owner/repo/actions/runs?head_sha={sha}&per_page=100":runs,f"{module.API}/repos/owner/repo/compare/{current}...{sha}":json.dumps({"status":"ahead"}).encode(),"bundle":bundle,"checksum":checksum}
    prior=module.download;module.download=lambda url,limit:responses[url];self.addCleanup(setattr,module,"download",prior)
    app,manifest=module.stage(source,overlay,releases,run,current);self.assertEqual(app,releases/"r1");self.assertEqual(json.loads(manifest.read_text())["runtimeNonSecret"],{"runtime":"host-only"})
    responses[f"{module.API}/repos/owner/repo/compare/{current}...{sha}"]=json.dumps({"status":"behind"}).encode()
    with self.assertRaisesRegex(module.FetchError,"manual rollback"):module.stage(source,overlay,releases,run,current)

  def test_archive_rejects_parent_traversal(self):
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);archive=root/"bad.tar.gz"
    with tarfile.open(archive,"w:gz") as bundle:entry=tarfile.TarInfo("../escape");entry.size=1;bundle.addfile(entry,io.BytesIO(b"x"))
    with self.assertRaises(module.FetchError):module.safe_extract(archive,root/"out")

  def test_candidate_deployer_requires_matching_source_and_file_checksum(self):
    with tempfile.TemporaryDirectory() as directory:
      root=Path(directory);app=root/"candidate";deployer=app/"tools/ops/release.py";deployer.parent.mkdir(parents=True)
      deployer.write_text("# candidate updater\n")
      marker=app/".release-source-sha";marker.write_text("a"*40+"\n")
      manifest=root/"release.json";manifest.write_text(json.dumps({"sourceSha":"a"*40,"runtimeFiles":{"tools/ops/release.py":hashlib.sha256(deployer.read_bytes()).hexdigest()}}))
      self.assertEqual(module.verified_deployer(app,manifest),deployer)
      marker.write_text("b"*40+"\n")
      with self.assertRaisesRegex(module.FetchError,"source marker"):module.verified_deployer(app,manifest)
      marker.write_text("a"*40+"\n");deployer.write_text("# altered\n")
      with self.assertRaisesRegex(module.FetchError,"checksum"):module.verified_deployer(app,manifest)
      deployer.unlink();deployer.symlink_to(manifest)
      with self.assertRaisesRegex(module.FetchError,"checksum"):module.verified_deployer(app,manifest)

  def test_failed_activation_never_skips_without_matching_receipt_and_health(self):
    candidate={"sourceSha":"a"*40,"releaseId":"r1","images":{"api":"digest"}};active={"sourceSha":"a"*40};receipt={"status":"deployed","sourceSha":"a"*40,"releaseId":"r1","images":{"api":"digest"}}
    self.assertFalse(module.can_skip(active,candidate,None,True,True));self.assertFalse(module.can_skip(active,candidate,receipt,False,True));self.assertFalse(module.can_skip(active,candidate,receipt,True,False));self.assertTrue(module.can_skip(active,candidate,receipt,True,True))

if __name__=="__main__":unittest.main()
