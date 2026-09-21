from __future__ import annotations
import importlib.util,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location("collector_client",Path(__file__).with_name("prepare-collector-client.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CollectorClientTest(unittest.TestCase):
  def test_missing_source_creates_disabled_config(self):
    with tempfile.TemporaryDirectory() as value:
      root=Path(value);link=module.prepare(root/"absent",root/"run",os.getuid(),os.getgid(),"preview")
      self.assertEqual((link/"collector.env").read_text(),"COLLECTOR_ENABLED=false\n")
  def test_valid_source_is_copied_without_mutating_original(self):
    with tempfile.TemporaryDirectory() as value:
      root=Path(value);source=root/"source";source.mkdir();
      for name,body in {"check.env":"CHECK_ADDRESS=10.80.1.203:7443\nCHECK_SERVER_NAME=collector.internal\nCHECK_CHANNEL=h66rogi\n","ca.pem":"ca","client.pem":"cert","client.key":"key"}.items():(source/name).write_text(body);(source/name).chmod(0o600)
      with patch.object(module,"validate_pair"):
        link=module.prepare(source,root/"run",os.getuid(),os.getgid(),"game-channel")
      self.assertIn("COLLECTOR_CONSUMER_ID=rogimarble",(link/"collector.env").read_text());self.assertIn("COLLECTOR_GAME_CHANNEL_ID=game-channel",(link/"collector.env").read_text());self.assertEqual((source/"client.key").read_text(),"key")
      self.assertEqual((link/"client.key").stat().st_mode&0o777,0o400)
  def test_symlink_unknown_duplicate_and_injection_are_rejected(self):
    with tempfile.TemporaryDirectory() as value:
      root=Path(value);source=root/"source";source.mkdir();target=root/"target";target.write_text("x");(source/"check.env").symlink_to(target)
      with self.assertRaises(ValueError):module.read_config(source/"check.env")
  def test_published_generation_does_not_delete_a_mounted_predecessor(self):
    with tempfile.TemporaryDirectory() as value:
      root=Path(value);source=root/"source";source.mkdir()
      for name,body in {"check.env":"CHECK_ADDRESS=10.80.1.203:7443\nCHECK_SERVER_NAME=collector.internal\nCHECK_CHANNEL=h66rogi\n","ca.pem":"ca","client.pem":"cert","client.key":"key"}.items():(source/name).write_text(body);(source/name).chmod(0o600)
      with patch.object(module,"validate_pair"):
        first=module.prepare(source,root/"run",os.getuid(),os.getgid(),"preview");old=first.resolve()
        module.prepare(source,root/"run",os.getuid(),os.getgid(),"preview")
      self.assertTrue(old.is_dir());self.assertTrue((old/"client.key").is_file())
      (source/"check.env").unlink();(source/"check.env").write_text("CHECK_ADDRESS=host:7443\nCHECK_SERVER_NAME=collector.internal\nCHECK_CHANNEL=h66rogi\nEVIL=x\n");(source/"check.env").chmod(0o600)
      with self.assertRaises(ValueError):module.read_config(source/"check.env")
if __name__=="__main__":unittest.main()
