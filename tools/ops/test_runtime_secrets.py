from __future__ import annotations
import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("runtime_secrets",Path(__file__).with_name("fetch-runtime-secrets.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Client:
  def __init__(self,value):self.value=value;self.call=None
  def get_secret_value(self,**kwargs):self.call=kwargs;return{"SecretString":json.dumps(self.value)}
class RuntimeSecretsTest(unittest.TestCase):
  def test_exact_six_keys_are_written_to_atomic_tmpfs_source(self):
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);config=root/"metadata.json";config.write_text(json.dumps({"region":"ap-northeast-2","runtimeSecretArn":"arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:runtime-AbCd"}))
    values={key:f"value-{key}" for key in module.KEYS};client=Client(values);link=module.fetch(config,root/"run",client)
    self.assertEqual(client.call["VersionStage"],"AWSCURRENT");self.assertTrue(link.is_symlink())
    for key,value in values.items():self.assertEqual((link/key).read_text(),value);self.assertEqual((link/key).stat().st_mode&0o777,0o400)
  def test_missing_or_extra_key_fails_without_publishing_source(self):
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);config=root/"metadata.json";config.write_text(json.dumps({"region":"ap-northeast-2","runtimeSecretArn":"arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:runtime-AbCd"}))
    with self.assertRaises(ValueError):module.fetch(config,root/"run",Client({"session_secret":"only"}))
    self.assertFalse((root/"run/source-secrets").exists())
if __name__=="__main__":unittest.main()
