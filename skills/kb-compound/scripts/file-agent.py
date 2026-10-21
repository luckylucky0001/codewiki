#!/usr/bin/env python3
"""Vendor-neutral stdin prompt / file completion bridge for an IDE agent.

The bridge never runs model commands. The host IDE reads request.json, writes
only the prompt's write set in cwd, then atomically creates response.json.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--exchange-dir', required=True)
    parser.add_argument('--timeout', type=float, default=540)
    args = parser.parse_args()
    exchange = Path(args.exchange_dir).expanduser()
    if not exchange.is_absolute() or args.timeout <= 0:
        parser.error('exchange-dir must be absolute and timeout must be positive')
    task = exchange / str(uuid.uuid4())
    task.mkdir(parents=True, mode=0o700)
    request = {'version': 1, 'id': task.name, 'cwd': os.getcwd(),
               'prompt': sys.stdin.read(), 'response': str(task / 'response.json')}
    pending = task / 'request.tmp'
    pending.write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding='utf-8')
    pending.replace(task / 'request.json')
    deadline = time.monotonic() + args.timeout
    try:
        while time.monotonic() < deadline:
            response = task / 'response.json'
            if response.exists():
                try:
                    result = json.loads(response.read_text(encoding='utf-8'))
                except (ValueError, OSError) as exc:
                    raise RuntimeError('invalid completion response') from exc
                if not isinstance(result, dict) or result.get('status') != 'ok':
                    raise RuntimeError('IDE agent reported failure: ' + str(result))
                print('IDE agent completed task ' + task.name)
                return 0
            time.sleep(0.2)
        raise RuntimeError('IDE agent completion timed out')
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        (task / 'closed.json').write_text(json.dumps({'closed': True}), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
