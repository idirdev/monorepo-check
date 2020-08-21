'use strict';

/**
 * @module monorepo-check
 * @description Validate monorepo structure and cross-dependencies.
 * @author idirdev
 */

const fs = require('fs');
const path = require('path');

/**
 * Read and parse a JSON file, returning null on failure.
 * @param {string} filePath
 * @returns {object|null}
 */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Read the root package.json workspaces field.
 * @param {string} rootDir
 * @returns {string[]|null} Workspace glob patterns or null
 */
function getWorkspaceConfig(rootDir) {
  const rootPkg = readJson(path.join(rootDir, 'package.json'));
  if (!rootPkg) return null;
  const ws = rootPkg.workspaces;
  if (!ws) return null;
  if (Array.isArray(ws)) return ws;
  if (ws.packages && Array.isArray(ws.packages)) return ws.packages;
  return null;
}

/**
 * Scan a directory recursively for package.json files (skipping node_modules).
 * @param {string} rootDir
 * @param {number} [maxDepth=4]
 * @returns {object[]} Array of package objects { name, version, dir, pkg }
 */
function findPackages(rootDir, maxDepth = 4) {
  const packages = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const sub = path.join(dir, entry.name);
      const pkgPath = path.join(sub, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgData = readJson(pkgPath);
        if (pkgData && pkgData.name) {
          packages.push({
            name: pkgData.name,
            version: pkgData.version || '0.0.0',
            dir: sub,
            pkg: pkgData
          });
        }
      }
      walk(sub, depth + 1);
    }
  }

  walk(rootDir, 0);
  return packages;
}

/**
 * Find cross-dependencies between workspace packages.
 * @param {object[]} packages
 * @returns {object[]} Array of { from, to, versionRequired }
 */
function findCrossDeps(packages) {
  const nameSet = new Set(packages.map(p => p.name));
  const crossDeps = [];

  for (const pkg of packages) {
    const allDeps = {
      ...pkg.pkg.dependencies,
      ...pkg.pkg.devDependencies,
      ...pkg.pkg.peerDependencies
    };
    for (const [dep, version] of Object.entries(allDeps)) {
      if (nameSet.has(dep)) {
        crossDeps.push({ from: pkg.name, to: dep, versionRequired: version });
      }
    }
  }

  return crossDeps;
}

/**
 * Find version conflicts: same dep declared with different versions across packages.
 * @param {object[]} packages
 * @returns {object[]} Array of { dep, versions: [{package, version}] }
 */
function findVersionConflicts(packages) {
  const depVersions = new Map();

  for (const pkg of packages) {
    const allDeps = {
      ...pkg.pkg.dependencies,
      ...pkg.pkg.devDependencies
    };
    for (const [dep, version] of Object.entries(allDeps)) {
      if (!depVersions.has(dep)) depVersions.set(dep, []);
      depVersions.get(dep).push({ package: pkg.name, version });
    }
  }

  const conflicts = [];
  for (const [dep, entries] of depVersions) {
    const versions = new Set(entries.map(e => e.version));
    if (versions.size > 1) {
      conflicts.push({ dep, versions: entries });
    }
  }

  return conflicts;
}

/**
 * Validate that all packages share consistent metadata fields.
 * @param {object[]} packages
 * @param {string[]} [fields] - Fields to check (default: license, author)
 * @returns {object[]} Array of inconsistency objects
 */
function checkConsistency(packages, fields = ['license', 'author']) {
  const issues = [];

  for (const field of fields) {
    const values = packages
      .filter(p => p.pkg[field] !== undefined)
      .map(p => ({ package: p.name, value: p.pkg[field] }));

    if (values.length === 0) continue;

    const uniqueValues = new Set(values.map(v =>
      typeof v.value === 'object' ? JSON.stringify(v.value) : v.value
    ));

    if (uniqueValues.size > 1) {
      issues.push({ field, inconsistencies: values });
    }

    const missing = packages.filter(p => p.pkg[field] === undefined);
    if (missing.length > 0) {
      issues.push({
        field,
        missing: missing.map(p => p.name)
      });
    }
  }

  return issues;
}

/**
 * Validate package names follow conventions (scoped or simple lowercase).
 * @param {object[]} packages
 * @returns {object[]} Array of { name, issue }
 */
function validatePackageNames(packages) {
  const issues = [];
  const nameRe = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

  for (const pkg of packages) {
    if (!nameRe.test(pkg.name)) {
      issues.push({ name: pkg.name, issue: 'Name does not follow npm naming conventions' });
    }
    if (pkg.name.startsWith('_') || pkg.name.startsWith('.')) {
      issues.push({ name: pkg.name, issue: 'Name starts with _ or .' });
    }
  }

  return issues;
}

/**
 * Build an adjacency list dependency graph from packages.
 * @param {object[]} packages
 * @returns {object} { [packageName]: string[] }
 */
function getDependencyGraph(packages) {
  const nameSet = new Set(packages.map(p => p.name));
  const graph = {};

  for (const pkg of packages) {
    graph[pkg.name] = [];
    const allDeps = {
      ...pkg.pkg.dependencies,
      ...pkg.pkg.devDependencies
    };
    for (const dep of Object.keys(allDeps)) {
      if (nameSet.has(dep)) {
        graph[pkg.name].push(dep);
      }
    }
  }

  return graph;
}

/**
 * Generate a one-line summary of monorepo state.
 * @param {object[]} packages
 * @returns {string}
 */
function summary(packages) {
  return `Summary: ${packages.length} package(s) found in monorepo`;
}

/**
 * Format a full human-readable report.
 * @param {object} results
 * @returns {string}
 */
function formatReport(results) {
  const lines = [
    '='.repeat(50),
    '  Monorepo Check Report',
    '='.repeat(50),
    `  Packages: ${results.packages.length}`,
    ''
  ];

  lines.push('Packages:');
  results.packages.forEach(p => lines.push(`  - ${p.name}@${p.version} (${path.basename(p.dir)})`));
  lines.push('');

  if (results.crossDeps && results.crossDeps.length > 0) {
    lines.push(`Cross-dependencies (${results.crossDeps.length}):`);
    results.crossDeps.forEach(d => lines.push(`  ${d.from} → ${d.to} (${d.versionRequired})`));
  } else {
    lines.push('[OK] No cross-dependencies found');
  }
  lines.push('');

  if (results.conflicts && results.conflicts.length > 0) {
    lines.push(`[WARN] Version conflicts (${results.conflicts.length}):`);
    results.conflicts.forEach(c => {
      lines.push(`  ${c.dep}:`);
      c.versions.forEach(v => lines.push(`    ${v.package}: ${v.version}`));
    });
  } else {
    lines.push('[OK] No version conflicts found');
  }
  lines.push('');

  if (results.consistency && results.consistency.length > 0) {
    lines.push(`[WARN] Consistency issues (${results.consistency.length}):`);
    results.consistency.forEach(i => {
      if (i.missing) {
        lines.push(`  Field "${i.field}" missing in: ${i.missing.join(', ')}`);
      } else {
        lines.push(`  Field "${i.field}" has inconsistent values`);
      }
    });
  } else {
    lines.push('[OK] Package fields are consistent');
  }

  lines.push('');
  lines.push(summary(results.packages));
  return lines.join('\n');
}

/**
 * Run full monorepo validation.
 * @param {string} rootDir - Monorepo root directory
 * @param {object} [opts]
 * @param {boolean} [opts.crossDeps] - Check cross-deps (default: true)
 * @param {boolean} [opts.conflicts] - Check version conflicts (default: true)
 * @param {boolean} [opts.consistency] - Check field consistency (default: true)
 * @returns {object} Full results report
 */
function checkMonorepo(rootDir, opts = {}) {
  const {
    crossDeps: doCrossDeps = true,
    conflicts: doConflicts = true,
    consistency: doConsistency = true
  } = opts;

  const packages = findPackages(rootDir);
  const workspaceConfig = getWorkspaceConfig(rootDir);

  const results = {
    packages,
    workspaceConfig,
    crossDeps: doCrossDeps ? findCrossDeps(packages) : [],
    conflicts: doConflicts ? findVersionConflicts(packages) : [],
    consistency: doConsistency ? checkConsistency(packages) : [],
    nameIssues: validatePackageNames(packages),
    graph: getDependencyGraph(packages)
  };

  return {
    ...results,
    summary: summary(packages),
    report: formatReport(results)
  };
}

module.exports = {
  checkMonorepo, findPackages, findCrossDeps, findVersionConflicts,
  checkConsistency, getWorkspaceConfig, validatePackageNames,
  getDependencyGraph, summary, formatReport
};
