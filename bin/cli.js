#!/usr/bin/env node
'use strict';

/**
 * @file monorepo-check CLI
 * @description CLI for validating monorepo structure and cross-dependencies.
 * @author idirdev
 */

const path = require('path');
const { checkMonorepo } = require('../src/index.js');

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const json = args.includes('--json');
const crossDeps = args.includes('--cross-deps');
const conflicts = args.includes('--conflicts');
const consistency = args.includes('--consistency');
const runAll = !crossDeps && !conflicts && !consistency;

if (help) {
  console.log(`
Usage: monorepo-check [dir] [options]

Arguments:
  dir              Monorepo root directory (default: current directory)

Options:
  --cross-deps     Check cross-dependencies between packages
  --conflicts      Check for version conflicts
  --consistency    Check field consistency across packages
  --json           Output JSON
  -h, --help       Show help

Examples:
  monorepo-check
  monorepo-check ./my-monorepo --conflicts
  monorepo-check --cross-deps --json
`);
  process.exit(0);
}

const dir = args.find(a => !a.startsWith('--') && !a.startsWith('-')) || process.cwd();
const resolvedDir = path.resolve(dir);

try {
  const result = checkMonorepo(resolvedDir, {
    crossDeps: runAll || crossDeps,
    conflicts: runAll || conflicts,
    consistency: runAll || consistency
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.report);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
