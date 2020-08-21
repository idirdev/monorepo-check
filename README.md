# monorepo-check

> **[EN]** Analyze monorepo workspaces to find all packages, map cross-package dependencies, and detect version conflicts across shared third-party dependencies.
> **[FR]** Analysez les workspaces monorepo pour trouver tous les paquets, cartographier les dépendances inter-paquets et détecter les conflits de versions dans les dépendances tierces partagées.

---

## Features / Fonctionnalités

**[EN]**
- Recursively discovers all `package.json` files in a directory tree (skips `node_modules`, `.git`, `dist`, `build`, `coverage`)
- Reports each package name and version found in the workspace
- Detects cross-dependencies: packages that depend on other packages in the same monorepo
- Finds version conflicts: third-party packages required at different versions by different workspace packages
- Summary view: package count, total deps, cross-dep count, conflict count
- JSON output mode for CI integration with `--json`
- Compatible with Yarn workspaces, npm workspaces, pnpm, Nx, Turborepo layouts

**[FR]**
- Découvre récursivement tous les fichiers `package.json` dans un arbre de répertoires (ignore `node_modules`, `.git`, `dist`, `build`, `coverage`)
- Rapporte le nom et la version de chaque paquet trouvé dans le workspace
- Détecte les dépendances croisées : paquets qui dépendent d'autres paquets du même monorepo
- Trouve les conflits de versions : paquets tiers requis à des versions différentes par différents paquets du workspace
- Vue résumée : nombre de paquets, total des dépendances, nombre de dépendances croisées, nombre de conflits
- Mode sortie JSON pour intégration CI avec `--json`
- Compatible avec les layouts Yarn workspaces, npm workspaces, pnpm, Nx, Turborepo

---

## Installation

```bash
npm install -g @idirdev/monorepo-check
```

---

## CLI Usage / Utilisation CLI

```bash
# Scan current directory (scanner le répertoire courant)
monorepo-check

# Scan a specific monorepo root (scanner une racine monorepo spécifique)
monorepo-check ./my-monorepo

# Show cross-package dependencies (afficher les dépendances inter-paquets)
monorepo-check --deps

# Show version conflicts (afficher les conflits de versions)
monorepo-check --conflicts

# Full report in JSON (rapport complet en JSON)
monorepo-check --json

# Show help (afficher l'aide)
monorepo-check --help
```

### Example Output / Exemple de sortie

```
$ monorepo-check ./packages --deps --conflicts
5 packages found:
  @myapp/core@1.0.0
  @myapp/ui@1.0.0
  @myapp/api@1.0.0
  @myapp/utils@1.0.0
  @myapp/cli@1.0.0

Cross-dependencies:
  @myapp/api -> @myapp/core
  @myapp/ui -> @myapp/utils
  @myapp/cli -> @myapp/api

Version conflicts:
  typescript:
    @myapp/core: ^5.0.0
    @myapp/ui: ^4.9.5
  react:
    @myapp/ui: ^18.2.0
    @myapp/cli: ^17.0.2
```

---

## API (Programmatic) / API (Programmation)

```js
const { findPackages, findCrossDeps, findVersionConflicts, summary } = require('@idirdev/monorepo-check');

// Discover all packages in a monorepo (découvrir tous les paquets d'un monorepo)
const packages = findPackages('./packages');
packages.forEach(p => {
  console.log(p.name, p.version, p.path);
  console.log('  scripts:', p.scripts);
  console.log('  deps:', Object.keys(p.dependencies));
});

// Find cross-package dependencies (trouver les dépendances inter-paquets)
const crossDeps = findCrossDeps(packages);
crossDeps.forEach(dep => {
  console.log(`${dep.from} depends on ${dep.to} @ ${dep.version}`);
});

// Find version conflicts across the workspace (trouver les conflits de versions dans le workspace)
const conflicts = findVersionConflicts(packages);
conflicts.forEach(c => {
  console.log('Conflict:', c.dependency);
  c.versions.forEach(v => console.log(`  ${v.pkg}: ${v.version}`));
});

// Get a high-level summary (obtenir un résumé de haut niveau)
const s = summary(packages);
console.log(s.packageCount);  // 5
console.log(s.totalDeps);     // 47
console.log(s.crossDeps);     // 3
console.log(s.conflicts);     // 2
```

---

## License

MIT © idirdev
