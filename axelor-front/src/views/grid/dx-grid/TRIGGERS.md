# DxGrid - Implémentation des Triggers

## Contexte

Ce document explique comment implémenter les triggers (onChange, onSelect, etc.) dans la DxGrid pour reproduire le comportement de la grille Axelor standard.

## Analyse de l'implémentation Axelor

### Types de triggers supportés

D'après la structure XML des vues Axelor, les triggers suivants peuvent être définis :

1. **onChange** : Déclenché quand la valeur d'un field change
2. **onSelect** : Déclenché lors de la sélection d'une valeur (pour les selects/many-to-one)
3. **onNew** : Déclenché lors de la création d'une nouvelle ligne
4. **onClick** : Déclenché au clic (pour les buttons)

### Définition dans le XML

```xml
<grid name="example-grid" model="com.example.Model">
  <field name="typeSelect" onChange="action-compute-fees"/>
  <field name="company" onSelect="action-load-company-data"/>
  <button name="btnCompute" onClick="action-compute-total"/>
</grid>
```

### Fichiers sources Axelor à lire

**IMPORTANT** : Voici les fichiers clés identifiés pour comprendre les triggers :

#### axelor-ui (composants UI de base)
- ✅ `C:\Users\nicolasv\axelor-ui\src\grid\types.ts` - Définition des types (GridColumn, GridProps, etc.)
- ✅ `C:\Users\nicolasv\axelor-ui\src\grid\grid.tsx` - Composant Grid principal (1549 lignes)
- ✅ `C:\Users\nicolasv\axelor-ui\src\grid\grid-body-row.tsx` - Ligne de la grille avec `onUpdate` callback
- ⏳ `C:\Users\nicolasv\axelor-ui\src\grid\grid-header-column.tsx` - En-tête de colonne (onChange?)
- ⏳ `C:\Users\nicolasv\axelor-ui\src\grid\grid-header-menu.tsx` - Menu de l'en-tête (onChange?)
- ⏳ `C:\Users\nicolasv\axelor-ui\src\grid\demos\editable.tsx` - Exemple de grille éditable

#### axelor-front (intégration avec le système)
- ⏳ `axelor-front\src\views\grid\grid.tsx` - Wrapper de la grille Axelor (intégration avec le système)
- ⏳ `axelor-front\src\views\grid\builder\` - Logique métier de la grille
- ⏳ `axelor-front\src\views\form\builder\scope.tsx` - `useActionExecutor` (exécution des actions)
- ⏳ `axelor-front\src\services\client\data.ts` - API pour exécuter les actions (`/ws/action`)

### Flux d'exécution (à documenter)

TODO : Analyser le flux complet dans les sources Axelor :
1. Événement UI (changement de valeur, sélection, etc.)
2. Détection du trigger associé au field
3. Exécution de l'action (action-record, action-script, action-method, etc.)
4. Mise à jour de l'UI avec les résultats de l'action

**Observations** :
- Le callback `onUpdate` dans `GridBodyRow` semble être le point d'entrée pour les changements de valeur
- Les actions sont exécutées via `useActionExecutor` (à trouver dans les sources)
- Les actions communiquent avec le backend via `/ws/action`

### Actions supportées

Les triggers peuvent déclencher différents types d'actions :
- **action-record** : Mise à jour de champs du record
- **action-script** : Exécution de code Groovy côté serveur
- **action-method** : Appel d'une méthode Java
- **action-attrs** : Modification d'attributs de fields (readonly, hidden, etc.)
- **action-validate** : Validation avec message d'erreur/warning

## État actuel de l'implémentation

### Trigger configuré dans le XML

```xml
<field name="calculationType" required="true" onChange="action-script-auction-fee-line-type-calcul-change"/>
```

**Action associée** : `action-script-auction-fee-line-type-calcul-change`
- Si type = "0" (Prix unitaire) → met `servicePercent` à 0
- Si type = "1" ou "2" (Commission) → met `unitPrice` à 0
- Affiche un message flash

### Problème identifié

❌ **Le trigger onChange n'est PAS exécuté lors du changement de valeur dans DxEditCell**

**Cause** : Dans `DxEditCell.tsx`, le composant utilise `useFormHandlers()` qui crée un `formAtom` et un `actionExecutor`, mais **aucun code ne déclenche l'exécution du trigger onChange** quand la valeur change.

### Architecture actuelle

```
DxEditCell.tsx
├── useFormHandlers() → crée formAtom, actionExecutor, actionHandler
├── useFieldSchema() → convertit Field → Schema
├── FormWidget → rend le widget approprié
└── useEffect() → synchronise formAtom ↔ cellData.setValue()
```

**Manque** : Un mécanisme pour détecter le changement de valeur et exécuter `field.onChange`

## Plan d'implémentation pour DxGrid

### Étape 1 : Détecter le changement de valeur dans DxEditCell ✅

**Fichier** : `axelor-front/src/views/grid/dx-grid/widgets/DxEditCell.tsx`

Ajouter un `useEffect` qui :
1. Écoute les changements de `fieldValue` (déjà disponible ligne 112-117)
2. Vérifie si `field.onChange` existe dans le schema
3. Si oui, appelle `actionExecutor.execute(field.onChange, context)`

```typescript
// Dans DxEditCell.tsx, après la ligne 133
const prevFieldValueRef = useRef(fieldValue);

useEffect(() => {
  // Détecter le changement de valeur (pas le premier render)
  if (prevFieldValueRef.current !== undefined && prevFieldValueRef.current !== fieldValue) {
    // Vérifier si le field a un trigger onChange
    if (schema.onChange) {
      // Exécuter l'action onChange
      actionExecutor.execute(schema.onChange, {
        context: cellData.data, // Record complet de la ligne
      }).then((result) => {
        // Traiter la réponse (setValue, setFlash, etc.)
        if (result) {
          // Mettre à jour le formAtom avec les nouvelles valeurs
          // Mettre à jour cellData.data avec les résultats
        }
      });
    }
  }
  prevFieldValueRef.current = fieldValue;
}, [fieldValue, schema.onChange, actionExecutor, cellData.data]);
```

### Étape 2 : Gérer la réponse de l'action

Quand l'action retourne, elle peut contenir :
- `setValue(field, value)` → mettre à jour d'autres champs de la ligne
- `setFlash(message)` → afficher un message toast
- `setError(field, message)` → afficher une erreur
- `setAttrs(field, {readonly, hidden, ...})` → modifier les attributs du field

**TODO** : Implémenter la gestion de ces réponses dans DxEditCell

### Étape 3 : Tester avec le trigger existant

1. Ouvrir la grille DxGrid
2. Éditer une ligne
3. Changer le champ "Type de calcul"
4. Vérifier que :
   - L'action est bien exécutée
   - Les champs sont mis à jour (servicePercent ou unitPrice à 0)
   - Le message flash s'affiche

### Étape 4 : Gérer les cas limites

- Triggers en cascade (onChange qui déclenche un autre onChange)
- Annulation (Escape) : ne pas exécuter le trigger
- Erreurs réseau : gérer les timeouts
- Performance : éviter les exécutions multiples

## Questions à résoudre

1. Comment Axelor gère les triggers dans la grille inline edit ?
2. Les triggers sont-ils exécutés à chaque changement ou seulement au save ?
3. Comment gérer les triggers en cascade (un trigger qui en déclenche un autre) ?
4. Comment gérer les triggers asynchrones (latence réseau) ?

## Références

- Sources Axelor : `axelor-front/src/views/grid/`
- Sources Axelor UI : `C:\Users\nicolasv\axelor-ui\src\grid\`
- DevExtreme Editing API : https://js.devexpress.com/react/documentation/api-reference/ui-widgets/dxDataGrid/configuration/editing/