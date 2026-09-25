#!/usr/bin/env python3
import json, shutil, subprocess, time
from pathlib import Path

from release import CORE_SERVICES, SLOTS, containers_healthy

def command(argv):
    result = subprocess.run(argv, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return {'ok': result.returncode == 0, 'output': result.stdout.strip()}

def receipt_matches(manifest, receipt):
    return bool(isinstance(manifest, dict) and isinstance(receipt, dict)
                and receipt.get('status') == 'deployed'
                and receipt.get('slot') in SLOTS
                and all(receipt.get(key) == manifest.get(key) and manifest.get(key)
                        for key in ('sourceSha', 'releaseId', 'images')))

def main():
    manifest = Path('/etc/rogimarble/release.json')
    receipt = Path('/etc/rogimarble/deployed-release.json')
    backup_root = Path('/srv/rogimarble/backups')
    latest = max(backup_root.glob('*.dump.gz'), key=lambda p: p.stat().st_mtime, default=None)
    slot_path = Path('/etc/rogimarble/active-slot')
    slot = slot_path.read_text(encoding='ascii').strip() if slot_path.is_file() else None
    slot_valid = slot in SLOTS
    status = {
        'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'manifest': json.loads(manifest.read_text()) if manifest.is_file() else None,
        'receipt': json.loads(receipt.read_text()) if receipt.is_file() else None,
        'appUnit': command(['systemctl', 'is-active', 'rogimarble-app.service']),
        'slot': slot,
        'slotUnit': command(['systemctl', 'is-active', f'rogimarble-slot@{slot}.service']) if slot_valid else {'ok': False, 'output': ''},
        'containers': command(['docker', 'compose', '--env-file', '/run/rogimarble/release.env', '-f', '/opt/rogimarble/app/deploy/compose.production.yaml', 'ps', '--format', 'json']),
        'readiness': command(['curl', '--fail', '--silent', '--show-error', '--max-time', '5', 'https://marble-api.rogi.chat/ready']),
        'dataDisk': shutil.disk_usage('/srv/rogimarble')._asdict(),
        'latestBackup': {'path': str(latest), 'ageSeconds': int(time.time()-latest.stat().st_mtime)} if latest else None,
    }
    status['containersHealthy'] = slot_valid and containers_healthy(status['containers'], CORE_SERVICES | {f'api-{slot}', f'web-{slot}'})
    status['receiptMatchesManifest'] = receipt_matches(status['manifest'], status['receipt']) and status['receipt']['slot'] == slot
    healthy = status['appUnit']['ok'] and status['slotUnit']['ok'] and status['containersHealthy'] and status['readiness']['ok'] and status['receiptMatchesManifest']
    status['containers']['output'] = status['containers']['output'][:8192]
    print(json.dumps(status, sort_keys=True, indent=2))
    return 0 if healthy else 1

if __name__ == '__main__':
    raise SystemExit(main())
