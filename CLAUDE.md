# Bonnes Pratiques pour Claude

## Emplacement des sources

**Les sources du projet axelor-ui sont disponibles dans : `C:\Users\nicolasv\axelor-ui`**

Ce répertoire contient le code source de la bibliothèque de composants UI utilisée par axelor-front. Consulter ces sources quand :
- Besoin de comprendre le comportement d'un composant Axelor UI
- Recherche d'exemples d'utilisation internes
- Débogage de problèmes liés à @axelor/ui
- Compréhension de l'implémentation des grilles Axelor standard

## Modification des vues Axelor

**TOUJOURS passer par le front pour mettre à jour les vues XML.**

### ❌ À NE PAS FAIRE
Ne jamais modifier directement les fichiers XML des vues dans :
- `src/main/resources/views/*.xml`

### ✅ À FAIRE
Utiliser les fonctions DevTools disponibles dans le navigateur :

```javascript
// Mettre à jour une vue existante (grid, form, etc.)
updateView('nom-de-la-vue', `<grid>...</grid>`)

// Mettre à jour une action-view existante
updateAction('nom-de-l-action', `<action-view>...</action-view>`)

// Créer une nouvelle vue
addView('nom-de-la-vue', 'grid', 'Titre de la vue', 'com.axelor.model.Package', `<grid>...</grid>`)

// Créer une nouvelle action
addAction('nom-de-l-action', 'action-view', `<action-view>...</action-view>`)

// Créer un nouveau menu
addMenuItem('nom-du-menu', 'Titre du Menu', 'menu-parent', 'action-associee')
```

### Fonctionnalités disponibles
Les fonctions `updateView()`, `updateAction()`, `addView()`, `addAction()` et `addMenuItem()` sont automatiquement disponibles dans la console en mode développement grâce à `src/utils/dev-tools.ts`.

### Avantages
- Pas besoin de redémarrer le serveur
- Changements instantanés avec F5
- Modifications directement en base de données
- Garde la cohérence avec l'environnement de développement

### Exemples

#### Mettre à jour une vue (grid)

```javascript
// Ajouter le groupement par parentPartner
updateView('dx-test-partner-simple', `
  <grid name="dx-test-partner-simple"
        title="DevExtreme Grid - Partners"
        model="com.axelor.apps.base.db.Partner"
        css="dx-grid"
        orderBy="partnerSeq"
        groupBy="parentPartner"
        customSearch="true"
        freeSearch="partnerSeq,fullName,name,fixedPhone"
        x-selector="checkbox"
        canNew="true"
        canEdit="true"
        canDelete="true">
    <toolbar>
      <button name="btnExport" title="Export" onClick="save"/>
    </toolbar>
    <field name="partnerSeq" width="120"/>
    <field name="fullName" width="250"/>
    <field name="name" width="200"/>
    <field name="fixedPhone" width="150"/>
    <field name="user" width="180"/>
    <field name="parentPartner" width="200"/>
  </grid>
`)
```

#### Mettre à jour une action-view

```javascript
// Ajouter un domaine pour filtrer les Partners
updateAction('action-dx-test-partner-simple', `
  <action-view name="action-dx-test-partner-simple"
               title="DevExtreme Grid - Partners"
               model="com.axelor.apps.base.db.Partner">
    <view type="grid" name="dx-test-partner-simple" />
    <view type="form" name="partner-form" />
    <domain>self.user IS NOT NULL OR self.parentPartner IS NOT NULL</domain>
  </action-view>
`)
```

#### Créer une nouvelle vue complète avec action et menu

```javascript
// 1. Créer la vue grid
await addView(
  'dx-test-stock-move',
  'grid',
  'DevExtreme Grid - StockMove Hilites',
  'com.axelor.apps.stock.db.StockMove',
  `<grid name="dx-test-stock-move"
        title="DevExtreme Grid - StockMove Hilites"
        model="com.axelor.apps.stock.db.StockMove"
        css="dx-grid"
        orderBy="-id"
        customSearch="true"
        x-selector="checkbox">
    <hilite color="success" if="statusSelect == 2 &amp;&amp; $moment().diff(createdOn, 'days') &lt;= 2"/>
    <field name="stockMoveSeq" width="120"/>
    <field name="statusSelect" width="120"/>
    <field name="fromStockLocation" width="200"/>
  </grid>`
);

// 2. Créer l'action-view
await addAction(
  'action-dx-test-stock-move',
  'action-view',
  `<action-view name="action-dx-test-stock-move"
                title="DevExtreme Grid - StockMove Hilites"
                model="com.axelor.apps.stock.db.StockMove">
    <view type="grid" name="dx-test-stock-move" />
    <domain>self.typeSelect = 2</domain>
  </action-view>`
);

// 3. Créer le menu
await addMenuItem(
  'menu-dx-test-stock-move',
  'Test StockMove Hilites',
  'menu-dx-tests',
  'action-dx-test-stock-move'
);
```

**Important** : Utiliser les outils MCP chrome-devtools pour exécuter ces commandes via `evaluate_script` au lieu de demander à l'utilisateur de les copier-coller manuellement.

Après chaque appel, l'utilisateur doit rafraîchir la page (F5) pour voir les changements.

## Accès aux informations du navigateur

**TOUJOURS utiliser le MCP chrome-devtools pour accéder aux informations du navigateur.**

### ❌ À NE PAS FAIRE
Ne jamais demander à l'utilisateur d'ouvrir la console ou de copier-coller des informations manuellement.

### ✅ À FAIRE
Utiliser les outils MCP chrome-devtools disponibles :

```
- mcp__chrome-devtools__take_snapshot : Prendre un snapshot de la page (structure a11y)
- mcp__chrome-devtools__list_console_messages : Lire les messages de la console
- mcp__chrome-devtools__evaluate_script : Exécuter du JavaScript et récupérer le résultat
- mcp__chrome-devtools__list_network_requests : Voir les requêtes réseau
- mcp__chrome-devtools__get_network_request : Détails d'une requête spécifique
```

### Exemples

#### Lire les logs de la console

```typescript
// Récupérer les derniers messages de console
mcp__chrome-devtools__list_console_messages({
  pageSize: 20,
  types: ["log", "error", "warn"]
})
```

#### Exécuter du code JavaScript

```typescript
// Inspecter l'état de la vue dans le navigateur
mcp__chrome-devtools__evaluate_script({
  function: `() => {
    // Récupérer des informations depuis le DOM ou window
    return {
      viewName: document.querySelector('[data-view-name]')?.dataset.viewName,
      groupByFields: window.someGlobalState?.groupByFields
    };
  }`
})
```

#### Analyser les requêtes réseau

```typescript
// Voir les requêtes API récentes
mcp__chrome-devtools__list_network_requests({
  resourceTypes: ["fetch", "xhr"],
  pageSize: 10
})
```

### Avantages
- Accès automatique aux informations sans intervention manuelle de l'utilisateur
- Récupération précise des logs, erreurs et états de l'application
- Analyse des requêtes réseau pour déboguer les problèmes d'API
- Inspection du DOM et de l'état JavaScript en temps réel

## Consultation de la documentation officielle

**TOUJOURS consulter la documentation officielle avant d'implémenter des fonctionnalités avec des bibliothèques tierces.**

### ❌ À NE PAS FAIRE
- Ne jamais deviner ou supposer comment une API fonctionne
- Ne pas se baser uniquement sur des connaissances générales ou des patterns courants
- Ne pas faire des essais/erreurs sans avoir lu la doc
- Ne pas perdre du temps avec des solutions qui ne marchent pas

### ✅ À FAIRE
Utiliser `WebFetch` ou `WebSearch` pour consulter la documentation officielle :

```typescript
// Consulter la documentation officielle
WebFetch({
  url: "https://js.devexpress.com/react/documentation/...",
  prompt: "Comment fonctionne la propriété X du composant Y ?"
})

// Ou rechercher dans la documentation
WebSearch({
  query: "DevExtreme React DataGrid GroupPanel visible documentation"
})
```

### Exemples de documentation à consulter

- **DevExtreme** : https://js.devexpress.com/react/documentation/
- **React** : https://react.dev/
- **Axelor** : https://docs.axelor.com/
- **Vite** : https://vitejs.dev/
- Toute autre bibliothèque tierce utilisée dans le projet

### Processus recommandé

1. **Identifier la bibliothèque** utilisée (ex: DevExtreme DataGrid)
2. **Vérifier la VERSION exacte** dans package.json
3. **Rechercher la documentation officielle pour cette version** avec WebFetch ou WebSearch
4. **Lire l'API** du composant/fonction à implémenter
5. **Comprendre les propriétés** disponibles et leur comportement
6. **Implémenter** avec les bonnes propriétés dès le premier coup

### Important : Vérifier la version
Toujours vérifier la version de la bibliothèque dans `package.json` avant de consulter la documentation. Les APIs peuvent changer entre les versions et utiliser la mauvaise version de la doc peut conduire à des erreurs.

Exemple : DevExtreme 22.2.15 vs DevExtreme 24.x peuvent avoir des APIs différentes.

### Avantages
- Gain de temps en utilisant la bonne API dès le début
- Évite les essais/erreurs inutiles
- Code plus fiable et maintenable
- Respect des bonnes pratiques de la bibliothèque

## Assistance pour questions techniques complexes

**Pour les problèmes techniques complexes, utiliser l'outil MCP zen pour obtenir de l'aide.**

### ❌ À NE PAS FAIRE
- Ne pas deviner ou faire des essais/erreurs sur des problèmes techniques complexes
- Ne pas chercher indéfiniment dans la documentation sans aide
- Ne pas bloquer sur des bugs difficiles à résoudre

### ✅ À FAIRE
Utiliser l'outil `mcp__zen__chat` pour obtenir de l'aide d'un modèle expert :

```typescript
// Demander de l'aide sur un problème technique
mcp__zen__chat({
  prompt: "J'utilise DevExtreme React DataGrid v22.2.15. Le composant <GroupPanel visible={true} /> n'apparaît pas dans le DOM même si le groupement fonctionne (je vois les groupes dans la grille). Que peut-il manquer ?",
  working_directory_absolute_path: "/chemin/absolu/vers/projet",
  model: "gemini-2.5-pro", // ou autre modèle disponible
  absolute_file_paths: [
    "/chemin/vers/DxGridInner.tsx",
    "/chemin/vers/package.json"
  ]
})
```

### Quand utiliser zen

- **Bugs complexes** : Comportements inexpliqués malgré la lecture de la doc
- **Problèmes d'intégration** : Difficultés avec des bibliothèques tierces
- **Questions architecturales** : Meilleure façon d'implémenter une fonctionnalité
- **Débogage avancé** : Problèmes qui nécessitent une analyse approfondie
- **Validation d'approche** : Obtenir un second avis sur une solution technique

### Avantages
- Accès à un modèle expert qui peut analyser le contexte complet
- Gain de temps sur des problèmes complexes
- Validation des approches techniques
- Explications détaillées et solutions alternatives
