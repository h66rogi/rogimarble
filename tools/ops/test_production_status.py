import importlib.util,json,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('status',Path(__file__).with_name('production-status.py'))
status=importlib.util.module_from_spec(spec);spec.loader.exec_module(status)
class HealthTest(unittest.TestCase):
    def test_empty_missing_failed_and_unhealthy_containers_fail(self):
        rows=[{'Service':name,'State':'running','Health':'healthy'} for name in status.CORE_SERVICES]
        result=lambda value:{'ok':True,'output':'\n'.join(json.dumps(row) for row in value)}
        self.assertTrue(status.containers_healthy(result(rows)))
        self.assertFalse(status.containers_healthy(result([])))
        self.assertFalse(status.containers_healthy(result(rows[:-1])))
        rows[0]['State']='exited';self.assertFalse(status.containers_healthy(result(rows)))
        rows[0]['State']='running';rows[0]['Health']='unhealthy';self.assertFalse(status.containers_healthy(result(rows)))
    def test_receipt_must_match_active_release_and_images(self):
        manifest={'sourceSha':'a'*40,'releaseId':'test','images':{'api':'sha256:'+'b'*64}}
        receipt={**manifest,'status':'deployed','slot':'green'}
        self.assertTrue(status.receipt_matches(manifest,receipt))
        self.assertFalse(status.receipt_matches(manifest,None))
        self.assertFalse(status.receipt_matches(manifest,{**receipt,'sourceSha':'c'*40}))
        self.assertFalse(status.receipt_matches(manifest,{**receipt,'images':{}}))
if __name__=='__main__':unittest.main()
