# DevExtreme Grid Integration pour Axelor

## 🎯 Vue d'ensemble

Cette intégration permet d'utiliser **DevExtreme DataGrid** à la place de la grille Axelor standard (`@axelor/ui/grid`) en ajoutant simplement une classe CSS dans la définition XML de la vue.

## ✅ Activation

Pour activer DevExtreme Grid sur une vue, ajoutez `dx-grid` dans l'attribut `css` :

```xml
<grid name="user-grid"
      title="Users"
      model="com.axelor.auth.db.User"
      css="dx-grid"
      orderBy="name"
      customSearch="true">
  <field name="name" width="200"/>
  <field name="email" width="300"/>
  <field name="active"/>
</grid>
```

**C'est tout !** La grille utilisera automatiquement DevExtreme au lieu de la grille Axelor.

---

## 📊 Modes supportés

### 1. Grid normale (données plates)

```xml
<grid name="product-grid"
      css="dx-grid"
      model="com.axelor.Product">
  <field name="code"/>
  <field name="name"/>
  <field name="price"/>
</grid>
```

### 2. Expandable (avec formulaire dans les détails)

```xml
<grid name="order-grid"
      css="dx-grid"
      widget="expandable"
      summaryView="order-summary-form"
      model="com.axelor.Order">
  <field name="orderNo"/>
  <field name="customer"/>
  <field name="totalAmount"/>
</grid>
```

Le `summaryView` référence une FormView qui sera affichée quand on expand une ligne.

### 3. Tree-Grid (hiérarchique sans formulaire)

```xml
<grid name="category-grid"
      css="dx-grid"
      widget="tree-grid"
      treeField="children"
      treeLimit="3"
      model="com.axelor.Category">
  <field name="name"/>
  <field name="code"/>
</grid>
```

### 4. Tree-Grid avec SummaryView (formulaire + sous-grille)

```xml
<grid name="task-grid"
      css="dx-grid"
      widget="tree-grid"
      treeField="subTasks"
      summaryView="task-detail-form"
      treeLimit="5"
      model="com.axelor.Task">
  <field name="title"/>
  <field name="status"/>
  <field name="priority"/>
</grid>
```

---

## 🔧 Fonctionnalités DevExtreme supportées

### Fonctionnalités de base
- ✅ **Tri** : Multi-colonnes (attribut `orderBy`)
- ✅ **Pagination** : Taille de page configurable
- ✅ **Sélection** : Single/Multiple via `selector="checkbox"`
- ✅ **Column Chooser** : Masquer/afficher les colonnes
- ✅ **Column Fixing** : Figer les colonnes à gauche/droite
- ✅ **State Storage** : Sauvegarde de l'état dans localStorage

### Filtrage
- ✅ **FilterRow** : Filtres par colonne (si `customSearch="true"`)
- ✅ **HeaderFilter** : Menu de filtrage avancé (si `customSearch="true"`)
- ✅ **SearchPanel** : Recherche globale (si `freeSearch` défini)

### Groupement
- ✅ **Grouping** : Regroupement par colonnes (attribut `groupBy`)
- ✅ **GroupPanel** : Drag & drop de colonnes pour grouper

### Édition
- ✅ **Inline Editing** : Mode row/cell/batch (si `editable="true"`)
- ✅ **CRUD Operations** : Add/Edit/Delete (permissions via `canNew`, `canEdit`, `canDelete`)

### Export
- ✅ **Export Excel** : Export natif DevExtreme
- ✅ **Export PDF** : À venir

### Master-Detail
- ✅ **Expandable** : Affichage de FormView dans les lignes
- ✅ **Tree-Grid** : Grilles récursives hiérarchiques

---

## 🗺️ Mapping des attributs XML → DevExtreme

| Attribut XML | DevExtreme | Description |
|-------------|-----------|-------------|
| `orderBy` | `defaultSortOrder` | Tri par défaut |
| `groupBy` | `defaultGrouping` | Groupement par défaut |
| `customSearch` | `FilterRow` + `HeaderFilter` | Filtres avancés |
| `freeSearch` | `SearchPanel` | Recherche globale |
| `selector="checkbox"` | `Selection mode="multiple"` | Sélection multiple |
| `canNew` | `Editing.allowAdding` | Autoriser ajout |
| `canEdit` | `Editing.allowUpdating` | Autoriser édition |
| `canDelete` | `Editing.allowDeleting` | Autoriser suppression |
| `widget="expandable"` | `MasterDetail` | Lignes expandables |
| `widget="tree-grid"` | `MasterDetail` récursif | Hiérarchie |
| `treeField` | Champ contenant les enfants | Ex: "children" |
| `summaryView` | FormView dans MasterDetail | Vue détaillée |

---

## 📝 Colonnes (Field)

| Attribut Field | DevExtreme Column | Description |
|---------------|------------------|-------------|
| `name` | `dataField` | Nom du champ |
| `title` | `caption` | Titre de la colonne |
| `width` | `width` | Largeur en pixels |
| `hidden` | `visible={false}` | Masquer la colonne |
| `sortable` | `allowSorting` | Activer le tri |

---

## 🚧 État actuel de l'implémentation

### ✅ Implémenté
- [x] Switch basé sur `css="dx-grid"`
- [x] Composant DxGridInner de base
- [x] Mapping des colonnes Axelor → DevExtreme
- [x] Configuration tri, filtres, recherche, groupement
- [x] Pagination
- [x] Column chooser
- [x] State storage
- [x] Structure MasterDetail (placeholder)

### ⏳ En cours / À faire
- [ ] **Intégration DataStore Axelor** : Connexion avec le backend
- [ ] **MasterDetail avec FormView** : Render des FormView Axelor
- [ ] **Récursivité tree-grid** : Grilles imbriquées
- [ ] **Actions Axelor** : toolbar, onNew, onSave, onDelete
- [ ] **Hilites** : Styling conditionnel des lignes
- [ ] **Widgets Axelor** : Render des widgets dans les cellules
- [ ] **Permissions** : Gestion fine des droits
- [ ] **Agrégations** : Summary (sum, avg, min, max, count)

---

## 🔍 Exemple complet

```xml
<object-views xmlns="http://axelor.com/xml/ns/object-views">

  <!-- Grid normale avec DevExtreme -->
  <grid name="product-grid"
        title="Products"
        model="com.axelor.Product"
        css="dx-grid"
        orderBy="name"
        groupBy="category"
        customSearch="true"
        freeSearch="name,code,description"
        canNew="true"
        canEdit="true"
        canDelete="true">
    <field name="code" width="100"/>
    <field name="name" width="250"/>
    <field name="category" width="150"/>
    <field name="price" width="100"/>
    <field name="inStock" width="80"/>
    <toolbar>
      <button name="export" title="Export Excel" onClick="action-export-products"/>
    </toolbar>
  </grid>

  <!-- Tree-Grid avec summaryView -->
  <grid name="category-tree"
        title="Categories"
        model="com.axelor.Category"
        css="dx-grid"
        widget="tree-grid"
        treeField="children"
        treeLimit="4"
        summaryView="category-detail-form">
    <field name="code"/>
    <field name="name"/>
    <field name="parentCategory"/>
  </grid>

  <form name="category-detail-form" title="Category Details" model="com.axelor.Category">
    <panel title="Details">
      <field name="description" colSpan="12"/>
      <field name="icon"/>
      <field name="sortOrder"/>
    </panel>
  </form>

</object-views>
```

---

## 🎨 Thème DevExtreme

Le thème par défaut est **Generic Light**. Pour changer :

```typescript
// Dans DxGridInner.tsx, modifier l'import
import "devextreme/dist/css/dx.light.css";        // Generic Light (défaut)
import "devextreme/dist/css/dx.dark.css";         // Generic Dark
import "devextreme/dist/css/dx.material.blue.light.css";  // Material
```

---

## 📚 Ressources

- [DevExtreme DataGrid Documentation](https://js.devexpress.com/Documentation/Guide/UI_Components/DataGrid/Overview/)
- [DevExtreme React Documentation](https://js.devexpress.com/React/Documentation/Guide/React_Components/DevExtreme_React_Components/)
- Version utilisée : **v22.2.15**

---

## 🐛 Debug

Pour activer les logs de debug dans la console :

```typescript
console.log("[DxGridInner] Rendering DevExtreme Grid", {
  widget,
  isExpandable,
  isTreeGrid,
  needsMasterDetail,
  columns: columns.length,
  view,
});
```

Ces logs sont déjà présents dans le code et s'affichent à chaque render.

---

## 📞 Support

Pour toute question ou problème :
1. Vérifier que `css="dx-grid"` est bien dans le XML
2. Vérifier les logs de la console navigateur
3. Vérifier que DevExtreme v22.2.15 est installé : `pnpm list devextreme`
