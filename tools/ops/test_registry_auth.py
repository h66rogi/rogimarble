from __future__ import annotations
import base64,importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("registry",Path(__file__).with_name("load-registry-auth.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Client:
  def get_secret_value(self,**kwargs):return{"SecretString":json.dumps({"username":"github-actions","token":"x"*32})}
class RegistryAuthTest(unittest.TestCase):
  def test_writes_only_root_scoped_docker_config(self):
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);metadata=root/"registry.json";metadata.write_text(json.dumps({"region":"ap-northeast-2","secretArn":"arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:registry-AbCd"}))
    output=module.load(metadata,root/"auth",Client());config=output/"config.json";self.assertEqual(output.stat().st_mode&0o777,0o700);self.assertEqual(config.stat().st_mode&0o777,0o600)
    encoded=json.loads(config.read_text())["auths"]["ghcr.io"]["auth"];self.assertEqual(base64.b64decode(encoded).decode(),"github-actions:"+"x"*32)
  def test_rejects_extra_secret_fields(self):
    class Bad(Client):
      def get_secret_value(self,**kwargs):return{"SecretString":json.dumps({"username":"x","token":"x"*32,"extra":"no"})}
    temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup);root=Path(temporary.name);metadata=root/"m";metadata.write_text(json.dumps({"region":"ap-northeast-2","secretArn":"arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:registry-AbCd"}))
    with self.assertRaises(ValueError):module.load(metadata,root/"auth",Bad())
if __name__=="__main__":unittest.main()
