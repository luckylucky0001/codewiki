#!/usr/bin/env node
// npm bin entry: `kb` (dist/cli.js).
import { run } from './cli/cli.js';

run(process.argv.slice(2)).then((code) => process.exit(code));
