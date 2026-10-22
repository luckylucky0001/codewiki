#!/usr/bin/env node
// npm bin entry: `kb` (dist/cli.js).
import { run } from './cli/cli.js';

// stdout to a pipe is asynchronous: exit only after pending writes are flushed (large --json output
// used to be cut at 64 KiB when piped)
run(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
  process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
});
