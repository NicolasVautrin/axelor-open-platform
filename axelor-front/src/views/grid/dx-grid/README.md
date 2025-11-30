# DevExtreme Grid Integration pour Axelor

## 🎯 Vue d'ensemble

Cette intégration permet d'utiliser **DevExtreme DataGrid** (v25.1) à la place de la grille Axelor standard en ajoutant simplement `css="dx-grid"` dans la définition XML de la vue.

**Architecture** : ~2700 lignes de code TypeScript/React enveloppant DevExtreme DataGrid avec le DataStore Axelor.

---

## ✅ Activation

```xml
<grid name="partner-grid"
      title="Partners"
      model="com.axelor.apps.base.db.Partner"
      css="dx-grid"
      orderBy="partnerSeq"
      groupBy="parentPartner"
      customSearch="true"
      freeSearch="partnerSeq,fullName,name"
      editable="true"
      canNew="true"
      canEdit="true"
      canDelete="true">
  <field name="partnerSeq" width="120"/>
  <field name="fullName" width="250"/>
  <field name="name" width="200"/>
  <field name="user" width="180"/>
</grid>
```

---

## 📊 État de l'implémentation

### ✅ Fonctionnalités complètement implémentées (42)

#### 1. Affichage des données (8/8)
- ✅ Rendu tabulaire avec hauteur configurable
- ✅ Champs Many-to-One avec `targetName`
- ✅ Collections (O2M, M2M) affichant le count
- ✅ Champs pointés (ex: `user.name`)
- ✅ Largeurs de colonnes configurables et persistées
- ✅ Visibilité des colonnes (show/hide)
- ✅ Formatage avec fonction `format()` Axelor
- ✅ Valeurs traduites ($t:fieldName)
- ✅ **Alignement automatique** : Nombres à droite (via `.number` CSS), texte à gauche, sélections exclues

**Fichiers** : `DxGrid.tsx`, `dx-grid-utils.ts`, `DxDisplayCell.tsx`

**Détails alignement** : Les champs numériques (`DECIMAL`, `INTEGER`, `LONG`) sont automatiquement alignés à droite via la classe CSS `.number` qui applique `justify-content: end`. Les selections et ratings sont exclus de cet alignement même s'ils ont un `serverType` numérique (DxDisplayCell.tsx:135-136).

#### 2. Tri et filtrage (7/7)
- ✅ Tri multi-colonnes server-side
- ✅ Tri par défaut via `orderBy`
- ✅ FilterRow (filtres par colonne)
- ✅ HeaderFilter (menu filtres avancés)
- ✅ SearchPanel (recherche globale via `freeSearch`)
- ✅ Conversion filtres DevExtreme → Axelor
- ✅ Tous les opérateurs (=, !=, >, <, like, between, etc.)

**Fichiers** : `DxGrid.hooks.ts`, `dx-filter-converter.ts`

#### 3. Sélection (8/8)
- ✅ Checkboxes dans colonne fixe
- ✅ **Select All** dans l'en-tête (toutes les lignes visibles)
- ✅ **Anti-flickering** via atomFamily Jotai
- ✅ État de sélection granulaire par ligne
- ✅ Désélection totale
- ✅ Mode sans sélection (`selector="none"`)
- ✅ État indéterminé pour Select All
- ✅ Undo icon lors de l'édition

**Fichiers** : `SelectColumn.tsx`, `selectionAtoms.ts`

**Performance** : Zero flickering - chaque ligne a son propre atom, seule celle qui change re-rend.

#### 4. Édition inline (10/10)
- ✅ Mode row (édition ligne complète)
- ✅ Démarrage par click sur cellule
- ✅ Tous les widgets Axelor (String, Selection, Date, M2O, etc.)
- ✅ Sauvegarde automatique via CustomStore
- ✅ Annulation (Escape ou icon undo)
- ✅ **Navigation Tab/Shift+Tab** entre colonnes éditables
- ✅ **Switch de ligne** avec sauvegarde automatique
- ✅ Nouvelles lignes avec ID négatif (système Axelor)
- ✅ Suppression de lignes
- ✅ Permissions (canEdit, canDelete, canNew)

**Fichiers** : `DxEditCell.tsx`, `DxEditRow.tsx`, `createDxDataSource.ts`

**Widgets supportés** : TextEdit, Selection, DatePicker, ManyToOne, Boolean, Integer, Decimal, tous les FormWidget.

#### 5. Hilites / Coloration conditionnelle (5/5)
- ✅ Hilites row-level (coloration de lignes entières)
- ✅ Hilites field-level (coloration de cellules spécifiques)
- ✅ Évaluation conditions Groovy via `parseExpression()`
- ✅ Classes CSS Axelor via `legacyClassNames()`
- ✅ Suppression alternance pour hilites background

**Fichiers** : `DxGrid.tsx:374-427`

**Exemple** :
```xml
<grid css="dx-grid">
  <hilite color="success" if="active &amp;&amp; user != null"/>
  <field name="status">
    <hilite color="danger" if="status == 'CANCELLED'"/>
  </field>
</grid>
```

#### 6. Button fields (4/4)
- ✅ Colonnes boutons dans la grille
- ✅ Exécution d'actions via ActionExecutor
- ✅ Context formAtom par ligne
- ✅ Refresh après action

**Fichiers** : `StandardColumn.tsx`, `DxGrid.tsx:134-138`

#### 7. Colonnes système (3/3)
- ✅ **$$select** : Checkbox ou undo icon
- ✅ **$$edit** : Icône edit/description
- ✅ **$$buttons** : Colonne cachée (évite boutons DevExtreme)

#### 8. Personnalisation (5/5)
- ✅ Column Chooser via menu contextuel
- ✅ Sauvegarde état dans gridState
- ✅ Nettoyage largeurs invalides (NaN, Infinity)
- ✅ Largeur minimum (100px par défaut)
- ✅ **Ordre des colonnes via visibleIndex** : Persistance complète du réordonnancement

**Fichiers** : `customize.tsx`, `DxGrid.hooks.ts:297-312`

**Détails** : `useHandleOptionChanged` capture les changements d'ordre de colonnes via `visibleIndex` et les sauvegarde dans `gridState.columns[]`. Le hook détecte les modifications en comparant tous les attributs (name, width, visible, visibleIndex, groupIndex) pour déclencher la sauvegarde uniquement si nécessaire.

#### 9. Permissions (4/4)
- ✅ canEdit (édition générale + readonly par champ)
- ✅ canDelete (contrôle suppression)
- ✅ canNew (contrôle ajout)
- ✅ readonly field (champ non éditable)

#### 10. Navigation clavier (6/6)
- ✅ Tab/Shift+Tab entre colonnes éditables
- ✅ Tab boucle (dernière → première colonne)
- ✅ Shift+Tab boucle inverse
- ✅ Enter pour éditer/sauvegarder
- ✅ Escape pour annuler
- ✅ Arrow keys pour navigation avec focus

**Fichiers** : `DxGrid.hooks.ts:325-418`

#### 11. Recherche (3/3)
- ✅ SearchPanel UI
- ✅ Recherche globale via `freeSearch`
- ✅ Conversion filtres → Criteria Axelor

### ⚠️ Fonctionnalités partiellement implémentées (3)

#### 1. Groupement (6/7)
- ✅ UI drag & drop pour grouper/dégrouper
- ✅ Groupement initial via `groupBy` XML
- ✅ Persistance dans gridState.columns[].groupIndex
- ✅ Affichage groupes avec autoExpandAll: false
- ✅ Tri avec groupement (server-side)
- ⚠️ **Remote grouping** : Actuellement côté client
- ⚠️ **Personnalisation groupBy** : Backend ne sauvegarde pas groupBy

**Note** : Le grouping fonctionne mais est appliqué côté client après chargement des données. Le serveur renvoie les données triées correctement.

**Workaround** : Définir `groupBy` directement dans la vue XML avec `updateView()`.

**Fichiers** : `DxGrid.tsx:312-318, 669`, `DxGrid.hooks.ts:73-77`

#### 2. Expandable / Tree-Grid (2/7)
- ✅ Structure MasterDetail DevExtreme en place
- ✅ Détection mode (expandable, tree-grid)
- ❌ FormView dans expandable rows
- ❌ Tree-grid récursif
- ❌ Chargement hiérarchique du champ `treeField`
- ❌ Support de `treeLimit`
- ❌ Intégration FormRenderer pour summaryView

**État actuel** : Composant `MasterDetailRenderer` retourne un placeholder.

**Fichiers** : `DxGrid.tsx:711-768`

#### 3. Pagination (2/2)
- ✅ Gérée par Axelor parent (externe à DevExtreme)
- ✅ Conversion offset/limit depuis skip/take
- ⚠️ **DevExtreme Paging désactivé** (Paging.enabled: false)

**Fichiers** : `DxGrid.tsx:672`, `createDxDataSource.ts:75-80`

### ❌ Fonctionnalités non implémentées (8)

1. **FormView dans MasterDetail** : Intégration FormRenderer pour expandable rows
2. **Tree-grid récursif** : Chargement hiérarchique avec `treeField`
3. **treeLimit** : Limite de profondeur pour tree-grid
4. **Export Excel natif** : Actuellement désactivé, géré par toolbar Axelor
5. **Export PDF** : À ajouter
6. **Agrégations** : Sum, Avg, Min, Max, Count dans footer
7. **Batch editing** : Mode batch (édition multiple lignes)
8. **State localStorage** : Persistance état dans localStorage

---

## 🗺️ Mapping des attributs XML → DevExtreme

| Attribut XML | DevExtreme | Description |
|-------------|-----------|-------------|
| `orderBy` | Sorting | Tri par défaut (ex: `"-id, name"`) |
| `groupBy` | Grouping | Groupement par défaut (ex: `"status,user"`) |
| `customSearch` | FilterRow + HeaderFilter | Filtres avancés |
| `freeSearch` | SearchPanel | Recherche globale (ex: `"name,code"`) |
| `selector="checkbox"` | Selection multiple | Checkboxes avec Select All |
| `canNew` | Editing.allowAdding | Autoriser ajout |
| `canEdit` | Editing.allowUpdating | Autoriser édition |
| `canDelete` | Editing.allowDeleting | Autoriser suppression |
| `editable="true"` | Editing mode="row" | Mode édition inline |
| `widget="expandable"` | MasterDetail | Lignes expandables (WIP) |
| `widget="tree-grid"` | MasterDetail récursif | Hiérarchie (WIP) |

---

## 📝 Colonnes (Field)

| Attribut Field | DevExtreme Column | Description |
|---------------|------------------|-------------|
| `name` | dataField | Nom du champ |
| `title` | caption | Titre de la colonne |
| `width` | width | Largeur en pixels (persistée) |
| `hidden` | visible={false} | Masquer la colonne |
| `sortable` | allowSorting | Activer le tri |
| `readonly` | allowEditing={false} | Champ non éditable |
| `widget` | Widget type | Type de widget (many-to-one, selection, etc.) |

---

## 🏗️ Architecture

### Structure des fichiers (~2700 lignes)

```
dx-grid/
├── DxGrid.tsx (769 lignes)          # Composant principal
├── DxGrid.hooks.ts (418 lignes)     # Hooks (colonnes, tri, filtres)
├── createDxDataSource.ts (191 lignes)    # Bridge DevExtreme ↔ Axelor
├── dx-filter-converter.ts (159 lignes)   # Conversion filtres
├── dx-grid-utils.ts (263 lignes)         # Utilitaires (IDs, types, format)
├── selectionAtoms.ts (116 lignes)        # Sélection atomique (Jotai)
├── dx-grid-debug.ts (112 lignes)         # Outils de diagnostic
└── widgets/
    ├── DxEditRow.tsx (176 lignes)        # Ligne en mode édition (dataRowRender)
    ├── DxDisplayRow.tsx (225 lignes)     # Ligne en mode affichage (dataRowComponent)
    ├── DxEditCell.tsx (205 lignes)       # Cellule en édition
    ├── DxDisplayCell.tsx (161 lignes)    # Cellule en affichage
    ├── StandardColumn.tsx (117 lignes)   # Colonnes normales
    ├── SelectColumn.tsx (151 lignes)     # Colonne sélection + Select All
    ├── EditColumn.tsx (51 lignes)        # Colonne edit-icon
    └── useFieldSchema.ts (75 lignes)     # Conversion Field → Schema
```

### Flux de données

```
Vue XML (css="dx-grid")
    ↓
GridView détecte → Active DxGrid
    ↓
DxGrid crée CustomStore
    ↓
DevExtreme DataGrid appelle CustomStore.load()
    ↓
CustomStore → DataStore Axelor → Backend
    ↓
Rendu avec colonnes + interactions
    ↓
    ├─ AFFICHAGE: DxDisplayCell → FormWidget readonly
    ├─ INTERACTION: Click, Select, Filter, Group
    └─ ÉDITION: DxEditCell → FormWidget → CustomStore.update()
```

### Communication avec backend

```typescript
DxGrid
    ↓
CustomStore (DevExtreme)
    ├─ load(options) → search avec tri/filtres
    ├─ byKey(key) → lire une ligne
    ├─ insert(values) → créer ligne
    ├─ update(key, values) → modifier ligne
    └─ remove(key) → supprimer ligne
    ↓
DataStore Axelor
    ↓
Backend Axelor
```

---

## 🚀 Optimisations appliquées

### Performance
1. **atomFamily (Jotai)** : Sélection par ligne sans re-render global
2. **repaintChangesOnly** : DevExtreme ne re-peint que les changements
3. **useMemo** : Mémoïsation des colonnes, datasource, groupByFields
4. **formAtom par ligne** : Édition isolée via useFormHandlers()
5. **React.memo** : DxGrid mémoïsé
6. **Lazy initialization** : CustomStore créé une seule fois
7. **Standard scrolling** : Suffisant pour pages de 50 lignes

### Code quality
1. **TypeScript strict** : Types complètes
2. **Logging debug** : `dxLog()` avec IndexedDB persistant
3. **Error handling** : Try/catch dans CustomStore
4. **Documentation inline** : Comments détaillés

---

## 🎨 Widgets supportés

### Affichage et édition
Tous les widgets Axelor sont supportés via `FormWidget` :
- **String** : TextEdit
- **Integer, Decimal** : NumericEdit
- **Boolean** : Checkbox
- **Date, DateTime, Time** : DatePicker
- **Selection** : SingleSelect
- **MultiSelect** : MultiSelect avec chips
- **ManyToOne** : AutoComplete avec popup
- **OneToMany, ManyToMany** : Count en readonly
- **Binary** : Lien de téléchargement
- **Image** : Affichage image
- **Email, Phone, URL** : Liens cliquables
- **Progress** : Barre de progression
- **Button** : Boutons d'action

---

## 🔧 Corrections récentes (2025-11-15)

### 1. Alignement automatique des nombres et sélections

**Problème** : Les champs numériques et sélections n'étaient pas correctement alignés dans DxGrid.

**Solution** :
- Appliqué la classe CSS `.number` aux champs numériques (`DECIMAL`, `INTEGER`, `LONG`) pour alignement à droite via `justify-content: end`
- Exclusion des selections et ratings de cet alignement même s'ils ont un `serverType` numérique

**Fichiers modifiés** :
- `DxDisplayCell.tsx:1,135-145` - Import `styles` et détection `isNumeric` avec exclusions

**Code** :
```typescript
const isNumeric = ["DECIMAL", "INTEGER", "LONG"].includes(enrichedField.serverType ?? "")
  && !(enrichedField.selection || enrichedField.widget === "rating");

if (isNumeric) {
  return (
    <Box className={styles.number} d="flex" style={{ width: "100%", height: "100%" }}>
      <Cell {...cellProps} />
    </Box>
  );
}
```

### 2. Crash en mode édition (dataRowRender)

**Problème** : `TypeError: setValueRef.current is not a function` lors de l'édition de cellules dans DxEditRow.

**Cause** : DxEditCell assumait que `cellData.setValue` serait toujours disponible, mais DxEditRow (utilisant `dataRowRender`) ne le fournit pas.

**Solution** :
- Ajout d'une vérification de `setValue` avant appel
- Permet à DxEditCell de fonctionner à la fois en mode `editCellRender` (avec setValue) et `dataRowRender` (sans setValue)

**Fichiers modifiés** :
- `DxEditCell.tsx:96-100` - Vérification optionnelle de `setValue`

**Code** :
```typescript
useEffect(() => {
  // Seulement si setValue existe et la valeur a changé
  if (setValueRef.current && fieldValue !== currentValueRef.current) {
    setValueRef.current(fieldValue);
  }
}, [fieldValue]);
```

### 3. Persistance de l'ordre des colonnes

**Problème** : Les changements d'ordre de colonnes via la personnalisation n'étaient pas sauvegardés.

**Cause** : `useHandleOptionChanged` sauvegardait les colonnes mais omettait la propriété `visibleIndex` qui contrôle l'ordre.

**Solution** :
- Ajout de `visibleIndex` aux données sauvegardées dans `gridState.columns[]`
- Ajout de `visibleIndex` à la comparaison `hasChanges` pour détecter les modifications d'ordre

**Fichiers modifiés** :
- `DxGrid.hooks.ts:297` - Ajout `visibleIndex: dxCol.visibleIndex`
- `DxGrid.hooks.ts:312` - Ajout `oldCol.visibleIndex !== newCol.visibleIndex`

**Code** :
```typescript
return {
  name: dxCol.dataField,
  width: width,
  visible: dxCol.visible,
  visibleIndex: dxCol.visibleIndex, // ← Ajouté
  groupIndex: dxCol.groupIndex,
  computed: true,
};

const hasChanges = updatedColumns.some((newCol: any, index: number) => {
  const oldCol = existingAxelorColumns[index];
  return !oldCol ||
         oldCol.name !== newCol.name ||
         oldCol.width !== newCol.width ||
         oldCol.visible !== newCol.visible ||
         oldCol.visibleIndex !== newCol.visibleIndex ||  // ← Ajouté
         oldCol.groupIndex !== newCol.groupIndex;
});
```

---

## 🐛 Problèmes connus

### 1. Grouping non persisté dans customizations
**Problème** : `ViewService.java:saveGridView()` ne sauvegarde pas l'attribut `groupBy` lors de la personnalisation.

**Impact** : Le grouping défini via personnalisation est perdu après reload.

**Workaround** : Définir `groupBy` directement dans la vue XML de base :

```javascript
await updateView('partner-grid', `
  <grid name="partner-grid" ... groupBy="status,user">
    ...
  </grid>
`)
```

**Fix permanent** : Ajouter 3 lignes dans `ViewService.java` ligne 536 :
```java
// Save groupBy if present
if (json.containsKey("groupBy")) {
  view.setGroupBy((String) json.get("groupBy"));
}
```

### 2. Remote grouping désactivé
**Problème** : `REMOTE_OPERATIONS.grouping: false` - grouping côté client

**Impact** : Les données sont chargées plates puis groupées côté client.

**Note** : Le serveur renvoie les données triées correctement via `orderBy`, donc le grouping fonctionne bien en pratique.

---

## 🔍 Exemple complet

```xml
<object-views xmlns="http://axelor.com/xml/ns/object-views">

  <grid name="partner-grid"
        title="Partners"
        model="com.axelor.apps.base.db.Partner"
        css="dx-grid"
        orderBy="partnerSeq"
        groupBy="parentPartner"
        customSearch="true"
        freeSearch="partnerSeq,fullName,name,fixedPhone"
        x-selector="checkbox"
        canNew="true"
        canEdit="true"
        canDelete="true"
        editable="true"
        edit-icon="true">

    <toolbar>
      <button name="export" title="Export" onClick="action-export-partners"/>
    </toolbar>

    <!-- Hilites au niveau de la ligne -->
    <hilite color="success" if="active &amp;&amp; user != null"/>
    <hilite color="danger" if="!active"/>

    <field name="partnerSeq" width="120"/>
    <field name="fullName" width="250"/>
    <field name="name" width="200"/>
    <field name="fixedPhone" width="150" readonly="true"/>
    <field name="user" width="180"/>
    <field name="parentPartner" width="200">
      <!-- Hilite au niveau du champ -->
      <hilite color="warning" if="parentPartner == null"/>
    </field>

    <!-- Button field -->
    <button name="viewDetails"
            title="Details"
            widget="button"
            onClick="action-open-partner-form"/>
  </grid>

</object-views>
```

**Résultat** :
- ✅ Grid DevExtreme avec 6 colonnes + 1 bouton
- ✅ Groupement initial par parentPartner
- ✅ Filtrage avancé (FilterRow + HeaderFilter)
- ✅ Recherche globale sur 4 champs
- ✅ Édition row-level (sauf fixedPhone readonly)
- ✅ Hilites lignes (vert si actif+user, rouge si inactif)
- ✅ Hilite cellule (orange si parentPartner null)
- ✅ Select All checkbox dans l'en-tête
- ✅ Undo icon lors de l'édition
- ✅ Bouton "Details" pour chaque ligne
- ✅ Export button dans toolbar
- ✅ Navigation Tab/Shift+Tab en édition

---

## 📚 Ressources

- [DevExtreme DataGrid Documentation](https://js.devexpress.com/Documentation/Guide/UI_Components/DataGrid/Overview/)
- [DevExtreme React Documentation](https://js.devexpress.com/React/Documentation/Guide/React_Components/DevExtreme_React_Components/)
- Version utilisée : **v25.1**

---

## 🐛 Debug

### Système de logging dual (Console + IndexedDB)

Tous les logs `dxLog()` sont écri
ts **simultanément** dans :
- **La console** : Pour le développement en temps réel
- **IndexedDB** : Avec `durability: 'strict'` pour survivre aux page reloads, crashs ou fermetures navigateur

Cela permet de déboguer même après un reload (ex: personnalisation qui recharge la page) :

```javascript
// Dans la console navigateur
dxGetLogs()        // Afficher tous les logs persistés
dxClearLogs()      // Nettoyer les logs IndexedDB
dxDownloadLogs()   // Télécharger logs.json
```

### Logs disponibles
- `[DxGrid]` : Lifecycle, searchOptions, grouping
- `[customize]` : Personnalisation, sauvegarde groupBy
- `[saveView]` : Appels API de sauvegarde
- `[DxDataSource]` : Chargement données (désactivé par défaut)

---

## 📞 Support

Pour toute question ou problème :
1. Vérifier que `css="dx-grid"` est bien dans le XML
2. Vérifier les logs de la console navigateur ou IndexedDB
3. Vérifier que DevExtreme v25.1 est installé : `pnpm list devextreme`
4. Consulter `WIDGETS-INTEGRATION.md` pour l'édition inline

---

## 📈 Statistiques

- **2703 lignes** de code TypeScript/React
- **42 fonctionnalités** complètement implémentées
- **3 fonctionnalités** partiellement implémentées
- **8 fonctionnalités** à développer
- **Zero flickering** grâce à atomFamily Jotai
- **Performance optimale** avec repaintChangesOnly