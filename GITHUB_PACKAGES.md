# Configuration GitHub Packages pour Axelor Open Platform

Ce document décrit la configuration de publication vers GitHub Packages pour ce fork d'Axelor Open Platform.

## Vue d'ensemble

GitHub Packages remplace JitPack comme solution de distribution pour ce fork. Cette solution résout les problèmes de compatibilité GLIBC rencontrés avec JitPack et Node.js 20+.

## Configuration effectuée

### 1. Configuration Gradle

**Fichier créé** : `gradle/github-publish.gradle`
- Ajoute le repository GitHub Packages aux publications Maven existantes
- Utilise les credentials via variables d'environnement (`GITHUB_ACTOR`, `GITHUB_TOKEN`)

**Fichier modifié** : `build.gradle`
- Ligne 64: Ajout de `apply from: "${rootDir}/gradle/github-publish.gradle"`

### 2. Workflow GitHub Actions

**Fichier créé** : `.github/workflows/publish.yml`

Le workflow se déclenche :
- Lors de la création d'une release GitHub
- Manuellement via l'onglet Actions

**Environnement de build** :
- Ubuntu latest (GLIBC moderne compatible Node.js 20+)
- JDK 11
- Node.js 20.x
- pnpm 9.14.4

## Publier une version

### Option 1 : Via GitHub Release (recommandé)

1. Créer un tag et une release sur GitHub
2. Le workflow se déclenche automatiquement
3. Les artefacts sont publiés sur GitHub Packages

### Option 2 : Déclenchement manuel

1. Aller dans l'onglet **Actions** du repository GitHub
2. Sélectionner le workflow **Publish to GitHub Packages**
3. Cliquer sur **Run workflow**
4. Choisir la branche (ex: `dev-dxgrid`)
5. Cliquer sur **Run workflow**

### Option 3 : Publication locale (pour test)

```bash
# Définir les variables d'environnement
export GITHUB_ACTOR="NicolasVautrin"
export GITHUB_TOKEN="ghp_votre_token_ici"

# Publier
./gradlew publish
```

**Note** : Vous aurez besoin d'un Personal Access Token (PAT) avec la permission `write:packages`.

## Consommer ce fork dans un autre projet

### Configuration dans `settings.gradle`

```gradle
pluginManagement {
  repositories {
    mavenCentral() {
      content {
        excludeGroup 'com.axelor'
      }
    }
    maven {
      name = "GitHubPackages"
      url = uri("https://maven.pkg.github.com/NicolasVautrin/axelor-open-platform")
      credentials {
        username = System.getenv("GITHUB_ACTOR") ?: project.findProperty("gpr.user")
        password = System.getenv("GITHUB_TOKEN") ?: project.findProperty("gpr.token")
      }
    }
    maven {
      url 'https://repository.axelor.com/nexus/repository/maven-public/'
    }
  }
  plugins {
    id 'com.axelor.app' version '7.4.0-SNAPSHOT'
  }
}

dependencyResolutionManagement {
  repositories {
    mavenCentral() {
      content {
        excludeGroup 'com.axelor'
      }
    }
    maven {
      name = "GitHubPackages"
      url = uri("https://maven.pkg.github.com/NicolasVautrin/axelor-open-platform")
      credentials {
        username = System.getenv("GITHUB_ACTOR") ?: project.findProperty("gpr.user")
        password = System.getenv("GITHUB_TOKEN") ?: project.findProperty("gpr.token")
      }
    }
    maven {
      url 'https://repository.axelor.com/nexus/repository/maven-public/'
    }
  }
}
```

### Configuration des credentials

#### Option 1 : Variables d'environnement (recommandé pour CI/CD)

```bash
export GITHUB_ACTOR="votre_username_github"
export GITHUB_TOKEN="ghp_votre_token"
```

#### Option 2 : gradle.properties (pour développement local)

Créer/modifier `~/.gradle/gradle.properties` :

```properties
gpr.user=votre_username_github
gpr.token=ghp_votre_token
```

### Créer un Personal Access Token (PAT)

1. Aller sur GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Cliquer sur **Generate new token (classic)**
3. Donner un nom descriptif (ex: "Gradle GitHub Packages")
4. Sélectionner les permissions :
   - `read:packages` - Pour télécharger les packages
   - `write:packages` - Pour publier des packages (seulement si nécessaire)
5. Générer et copier le token

**⚠️ Important** : Ne jamais commiter le token dans Git !

## Modules publiés

Les modules suivants sont publiés sur GitHub Packages :

- `com.axelor:axelor-common:7.4.0-SNAPSHOT`
- `com.axelor:axelor-core:7.4.0-SNAPSHOT`
- `com.axelor:axelor-gradle:7.4.0-SNAPSHOT`
- `com.axelor:axelor-test:7.4.0-SNAPSHOT`
- `com.axelor:axelor-tomcat:7.4.0-SNAPSHOT`
- `com.axelor:axelor-tools:7.4.0-SNAPSHOT`
- `com.axelor:axelor-web:7.4.0-SNAPSHOT`

Le module `axelor-front` n'est pas publié séparément car il est intégré dans `axelor-web`.

## Vérifier les packages publiés

Les packages publiés sont visibles sur :
`https://github.com/NicolasVautrin/axelor-open-platform/packages`

## Dépannage

### Erreur "Could not find com.axelor:axelor-gradle:7.4.0-SNAPSHOT"

**Cause** : Le package n'a pas encore été publié ou les credentials sont incorrects.

**Solution** :
1. Vérifier que le workflow GitHub Actions s'est bien exécuté
2. Vérifier les credentials (`GITHUB_ACTOR` et `GITHUB_TOKEN`)
3. Vérifier que le token a la permission `read:packages`

### Erreur "401 Unauthorized"

**Cause** : Credentials invalides ou manquants.

**Solution** :
1. Vérifier que `GITHUB_ACTOR` est votre username GitHub
2. Vérifier que `GITHUB_TOKEN` est un PAT valide
3. Régénérer un nouveau token si nécessaire

### Le workflow GitHub Actions échoue

**Solutions** :
1. Consulter les logs dans l'onglet Actions
2. Vérifier que les permissions `packages: write` sont actives dans le workflow
3. Vérifier qu'il n'y a pas d'erreurs de compilation

## Comparaison JitPack vs GitHub Packages

| Critère | JitPack | GitHub Packages |
|---------|---------|-----------------|
| Support Node.js 20+ | ❌ Non (GLIBC trop ancienne) | ✅ Oui (Ubuntu latest) |
| Configuration Docker | ❌ Impossible | ✅ Via GitHub Actions |
| Coût | ✅ Gratuit | ✅ Gratuit (dépôts publics) |
| Intégration GitHub | ⚠️ Externe | ✅ Native |
| Credentials requis | ❌ Non | ✅ Oui (PAT) |
| Build automatique | ✅ Sur commit/tag | ⚠️ Via workflow manuel |

## Références

- [GitHub Packages Documentation](https://docs.github.com/en/packages)
- [Gradle Publishing Guide](https://docs.gradle.org/current/userguide/publishing_maven.html)
- [Working with GitHub Packages - Gradle](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-gradle-registry)