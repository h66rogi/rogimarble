#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).with_name("validate-compose.py")
SPEC = importlib.util.spec_from_file_location("validate_compose", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ValidateComposeTest(unittest.TestCase):
    def test_accepts_absolute_tmpfs_targets(self):
        MODULE.validate_tmpfs(
            {"services": {"api": {"tmpfs": ["/tmp:rw,noexec,nosuid"]}}}
        )

    def test_rejects_flow_sequence_option_split_as_mount(self):
        with self.assertRaisesRegex(ValueError, "not an absolute container path"):
            MODULE.validate_tmpfs(
                {"services": {"api": {"tmpfs": ["/tmp:rw", "noexec", "nosuid"]}}}
            )

    def test_rejects_missing_tmpfs(self):
        with self.assertRaisesRegex(ValueError, "no tmpfs entries"):
            MODULE.validate_tmpfs({"services": {"api": {}}})


if __name__ == "__main__":
    unittest.main()
