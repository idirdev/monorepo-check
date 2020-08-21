'use strict';

/**
 * @file monorepo-check tests
 * @author idirdev
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  findPackages, findCrossDeps, findVersionConflicts,
  checkConsistency, getWorkspaceConfig, validatePackageNames,
  getDependencyGraph, summary, formatReport, checkMonorepo
} = require('../src/index.js');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monorepo-test-'));

  // root package.json with workspaces
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'my-monorepo',
    private: true,
    workspaces: ['packages/*'],
    license: 'MIT'
  }, null, 2));

  // packages/core
  const coreDir = path.join(tmpDir, 'packages', 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  fs.writeFileSync(path.join(coreDir, 'package.json'), JSON.stringify({
    name: '@mono/core',
    version: '1.0.0',
    license: 'MIT',
    author: 'idirdev',
    dependencies: { lodash: '^4.17.0' }
  }, null, 2));

  // packages/utils
  const utilsDir = path.join(tmpDir, 'packages', 'utils');
  fs.mkdirSync(utilsDir, { recursive: true });
  fs.writeFileSync(path.join(utilsDir, 'package.json'), JSON.stringify({
    name: '@mono/utils',
    version: '1.0.0',
    license: 'MIT',
    author: 'idirdev',
    dependencies: { '@mono/core': '^1.0.0', lodash: '^4.16.0' }
  }, null, 2));

  // packages/app
  const appDir = path.join(tmpDir, 'packages', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: '@mono/app',
    version: '2.0.0',
    license: 'Apache-2.0',
    dependencies: { '@mono/core': '^1.0.0', '@mono/utils': '^1.0.0', express: '^4.0.0' }
  }, null, 2));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('monorepo-check', () => {
  describe('findPackages', () => {
    it('finds all packages in subdirectories', () => {
      const packages = findPackages(tmpDir);
      assert.ok(packages.length >= 3);
    });

    it('each package has name, version, dir, pkg', () => {
      const packages = findPackages(tmpDir);
      for (const p of packages) {
        assert.ok(p.name);
        assert.ok(p.version);
        assert.ok(p.dir);
        assert.ok(p.pkg);
      }
    });

    it('does not include root package.json', () => {
      const packages = findPackages(tmpDir);
      const names = packages.map(p => p.name);
      assert.ok(!names.includes('my-monorepo'));
    });
  });

  describe('findCrossDeps', () => {
    it('finds cross-dependencies between packages', () => {
      const packages = findPackages(tmpDir);
      const cross = findCrossDeps(packages);
      assert.ok(cross.length > 0);
      const hasCoreToUtils = cross.some(d => d.from === '@mono/utils' && d.to === '@mono/core');
      assert.ok(hasCoreToUtils);
    });

    it('returns empty for packages with no cross-deps', () => {
      const pkgs = [
        { name: 'a', pkg: { dependencies: { lodash: '^4' } } },
        { name: 'b', pkg: { dependencies: { express: '^4' } } }
      ];
      assert.deepEqual(findCrossDeps(pkgs), []);
    });
  });

  describe('findVersionConflicts', () => {
    it('detects version conflicts for lodash', () => {
      const packages = findPackages(tmpDir);
      const conflicts = findVersionConflicts(packages);
      const lodashConflict = conflicts.find(c => c.dep === 'lodash');
      assert.ok(lodashConflict, 'lodash version conflict should be detected');
    });

    it('returns empty for no conflicts', () => {
      const pkgs = [
        { name: 'a', pkg: { dependencies: { lodash: '^4' } } },
        { name: 'b', pkg: { dependencies: { lodash: '^4' } } }
      ];
      assert.deepEqual(findVersionConflicts(pkgs), []);
    });
  });

  describe('checkConsistency', () => {
    it('detects license inconsistency', () => {
      const packages = findPackages(tmpDir);
      const issues = checkConsistency(packages, ['license']);
      assert.ok(issues.length > 0);
    });

    it('passes for consistent fields', () => {
      const pkgs = [
        { name: 'a', pkg: { license: 'MIT' } },
        { name: 'b', pkg: { license: 'MIT' } }
      ];
      const issues = checkConsistency(pkgs, ['license']);
      assert.equal(issues.length, 0);
    });
  });

  describe('getWorkspaceConfig', () => {
    it('reads workspaces from root package.json', () => {
      const ws = getWorkspaceConfig(tmpDir);
      assert.ok(Array.isArray(ws));
      assert.ok(ws.includes('packages/*'));
    });

    it('returns null for non-monorepo dirs', () => {
      const ws = getWorkspaceConfig(os.tmpdir());
      assert.equal(ws, null);
    });
  });

  describe('validatePackageNames', () => {
    it('accepts valid scoped names', () => {
      const pkgs = [{ name: '@mono/core' }, { name: '@mono/utils' }];
      const issues = validatePackageNames(pkgs);
      assert.equal(issues.length, 0);
    });

    it('rejects invalid names', () => {
      const pkgs = [{ name: 'UPPERCASE' }, { name: '_bad-start' }];
      const issues = validatePackageNames(pkgs);
      assert.ok(issues.length > 0);
    });
  });

  describe('getDependencyGraph', () => {
    it('builds adjacency list for cross-deps', () => {
      const packages = findPackages(tmpDir);
      const graph = getDependencyGraph(packages);
      const appDeps = graph['@mono/app'] || [];
      assert.ok(appDeps.includes('@mono/core'));
    });
  });

  describe('summary', () => {
    it('returns package count', () => {
      const pkgs = [{ name: 'a' }, { name: 'b' }];
      const s = summary(pkgs);
      assert.ok(s.includes('2 package'));
    });
  });

  describe('formatReport', () => {
    it('returns a non-empty string with package names', () => {
      const packages = findPackages(tmpDir);
      const report = formatReport({ packages, crossDeps: [], conflicts: [], consistency: [] });
      assert.ok(typeof report === 'string');
      assert.ok(report.length > 0);
    });
  });

  describe('checkMonorepo', () => {
    it('returns full results object', () => {
      const result = checkMonorepo(tmpDir);
      assert.ok(Array.isArray(result.packages));
      assert.ok(Array.isArray(result.crossDeps));
      assert.ok(Array.isArray(result.conflicts));
      assert.ok(typeof result.report === 'string');
    });
  });
});
