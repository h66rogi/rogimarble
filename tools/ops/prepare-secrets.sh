#!/bin/sh
set -eu
python3 /usr/local/lib/rogimarble/fetch-runtime-secrets.py
if [ -f /etc/rogimarble/release.json ];then
  exec python3 /usr/local/lib/rogimarble/release.py --manifest /etc/rogimarble/release.json --prepare-active
fi
