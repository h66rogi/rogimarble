#!/bin/sh
set -eu

exec python3 /usr/local/lib/rogimarble/release.py --manifest /etc/rogimarble/release.json --prepare-active
