# Intégration des widgets Axelor dans DevExtreme Grid

## 📖 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Architecture actuelle](#architecture-actuelle)
- [Architecture cible](#architecture-cible)
- [Système de widgets Axelor](#système-de-widgets-axelor)
- [Plan d'implémentation](#plan-dimplémentation)
- [Phase 1 : Architecture de base](#phase-1--architecture-de-base)
- [Phase 2 : Intégration DevExtreme](#phase-2--intégration-devextreme)
- [Phase 3 : Tests et validation](#phase-3--tests-et-validation)
- [Phase 4 : Optimisations](#phase-4--optimisations)
- [Exemples de code](#exemples-de-code)
- [FAQ](#faq)

---

## Vue d'ensemble

### Objectif

Remplacer les éditeurs natifs DevExtreme par les widgets Axelor pour garantir :
- **Cohérence** : Même comportement entre formulaires et grilles
- **Support complet** : Tous les types de champs Axelor (M2O, Selection, Date, etc.)
- **Validation** : Règles métier et conditions automatiques (readonly, required, etc.)
- **Widgets spécialisés** : Versions grid optimisées (ex: TextEdit avec popup)

### État actuel

```typescript
// StandardColumn.tsx (ligne 77)
// TODO: Ajouter editCellRender avec FormWidget pour être iso Axelor
// Pour l'instant, DevExtreme utilisera ses éditeurs natifs
```

DevExtreme utilise ses propres éditeurs :
- ❌ Input texte simple pour STRING
- ❌ Select natif pour SELECTION
- ❌ Pas de support M2O avec autocompletion
- ❌ Pas de validation Axelor
- ❌ Pas de conditions dynamiques (readonly, required)

### Architecture cible

**⚡ DÉCOUVERTE IMPORTANTE** : Axelor dispose déjà d'un wrapper `FormWidget` qui gère automatiquement :
- ✅ Création des atoms (widgetAtom, valueAtom)
- ✅ Sélection du widget approprié (String, ManyToOne, etc.)
- ✅ Support des widgets inGridEditor (TextEdit popup)
- ✅ Validation et conditions dynamiques

**Solution simplifiée** : Utiliser directement `FormWidget` dans `editCellRender`

```typescript
// StandardColumn.tsx
editCellRender: (cellData) => (
  <FormWidget
    schema={mapFieldToSchema(col.field, col.fieldMeta)}
    formAtom={getFormAtom(cellData.data)}
    readonly={false}
  />
)
```

Avantages :
- ✅ Pas besoin de créer un EditCellWidget custom
- ✅ FormWidget gère déjà widgetAtom et valueAtom
- ✅ Support complet de tous les widgets Axelor
- ✅ Architecture cohérente avec la grid Axelor standard

---

## Architecture actuelle

### Flux d'édition DevExtreme

```
User clique sur cellule
  ↓
DevExtreme active mode édition (editing.editRowKey = rowKey)
  ↓
DevExtreme affiche éditeur natif (input, select, etc.)
  ↓
User édite la valeur
  ↓
DevExtreme met à jour cellData.value
  ↓
User clique ailleurs ou Tab
  ↓
DevExtreme appelle CustomStore.update(key, values)
  ↓
dataStore.save(record) sauvegarde en base
```

### Problèmes

1. **Éditeurs natifs limités** : Pas de support pour M2O avec autocompletion
2. **Pas de validation** : Validation Axelor non appliquée
3. **Pas de conditions** : readonly/required non dynamiques
4. **Incohérence UI** : Widgets différents entre form et grid

---

## Architecture cible

### Flux d'édition avec widgets Axelor

```
User clique sur cellule
  ↓
DevExtreme active mode édition
  ↓
editCellRender appelé par DevExtreme
  ↓
EditCellWidget créé avec atoms (formAtom, widgetAtom, valueAtom)
  ↓
FormWidget affiché avec le bon widget (String, ManyToOne, etc.)
  ↓
User édite dans le widget Axelor
  ↓
onChange déclenché → valueAtom mis à jour
  ↓
Effect détecte changement → cellData.setValue(newValue)
  ↓
User Tab/Blur/Click ailleurs
  ↓
DevExtreme appelle CustomStore.update(key, values)
  ↓
dataStore.save(record) sauvegarde en base
```

### Nouveaux composants

```
axelor-front/src/views/grid/dx-grid/widgets/
├── EditCellWidget.tsx          # Wrapper principal pour FormWidget
├── useGridCellAtoms.ts         # Hook pour créer formAtom, widgetAtom, valueAtom
└── mapFieldToSchema.ts         # Convertir Field + FieldMeta → Schema Axelor
```

---

## Système de widgets Axelor

### Composant FormWidget

**Fichier** : `axelor-front/src/views/form/builder/form-widget.tsx`

**Rôle** : Orchestrateur qui sélectionne et affiche le bon widget

**Props** :
```typescript
interface WidgetProps {
  schema: Schema;          // Définition du champ
  formAtom: FormAtom;      // État du formulaire parent
  widgetAtom: WidgetAtom;  // État du widget (attrs, errors)
  readonly?: boolean;      // Mode lecture seule
}

// Pour les champs uniquement
interface FieldProps<T> extends WidgetProps {
  valueAtom: ValueAtom<T>; // Atom pour la valeur
  invalid?: boolean;       // État de validation
}
```

**Logique de sélection** :
```typescript
function useWidget(schema: Schema) {
  const name = toCamelCase(schema.widget);
  const editName = `${name}Edit`;  // Version inGridEditor
  const type = toCamelCase(schema.serverType);

  // Ordre de priorité :
  return (
    (schema.inGridEditor && WIDGETS[editName]) ||  // 1. Version grid
    WIDGETS[name] ||                                // 2. Widget explicite
    WIDGETS[type]                                   // 3. Fallback serverType
  );
}
```

### Atoms nécessaires

#### 1. FormAtom

**Type** : `PrimitiveAtom<FormState>`

**Contenu** :
```typescript
{
  model: "com.axelor.apps.base.db.Partner",
  record: {
    id: 123,
    name: "John Doe",
    // ... autres champs
  },
  fields: {
    name: { type: "STRING", title: "Name", ... },
    // ... métadonnées des champs
  },
  dirty: false,
  // ... autres propriétés
}
```

**Rôle** : Contient l'état global du formulaire (record en édition)

#### 2. WidgetAtom

**Type** : `PrimitiveAtom<WidgetState>`

**Contenu** :
```typescript
{
  attrs: {
    readonly: false,
    required: true,
    hidden: false,
    title: "Name",
    placeholder: "Enter name...",
    // ... autres attributs dynamiques
  },
  errors: [],
  // ... autres propriétés
}
```

**Rôle** : Contient les attributs dynamiques du widget (conditions évaluées)

#### 3. ValueAtom

**Type** : `WritableAtom<T, [value, fireOnChange?, markDirty?], void>`

**Signature spéciale** :
```typescript
// Lecture
const value = get(valueAtom);

// Écriture
set(valueAtom, newValue, fireOnChange = true, markDirty = true);
```

**Rôle** : Gère la valeur du champ avec propagation onChange

### Widgets disponibles

**Fichier** : `axelor-front/src/views/form/widgets/index.ts`

| Type Axelor | Widget par défaut | Widget alternatif |
|-------------|-------------------|-------------------|
| STRING | String | text (multiline) |
| INTEGER | Integer | - |
| DECIMAL | Decimal | - |
| BOOLEAN | Boolean | checkbox |
| DATE | Date | - |
| DATETIME | DateTime | - |
| MANY_TO_ONE | ManyToOne | - |
| ONE_TO_MANY | OneToMany | - |
| MANY_TO_MANY | ManyToMany | - |
| SELECTION | Selection | radio |
| TEXT | Text | - |
| BINARY | Binary | - |

### Widgets inGridEditor

Certains widgets ont une version spécialisée pour les grilles :

**TextEdit** : Input inline + popup textarea au focus
```typescript
// Affichage inline dans la grille
<String {...props} inputProps={{ onFocus: handleFocus }} />

// Popup overlay pour édition complète
{popup && (
  <Box style={popup.style}>
    <Text {...props} inputProps={{ autoFocus: true, onBlur: handleBlur }} />
  </Box>
)}
```

**OneToManyEdit** : Badge count + dialog au clic
```typescript
<Badge count={items.length} onClick={handleOpen} />
{dialog && <OneToManyDialog items={items} ... />}
```

---

## Plan d'implémentation

### Phase 1 : Architecture de base

**Objectif** : Créer les composants de base pour wrapper FormWidget

**Fichiers à créer** :
1. `EditCellWidget.tsx` - Wrapper principal
2. `useGridCellAtoms.ts` - Hook pour gérer les atoms
3. `mapFieldToSchema.ts` - Mapper Field → Schema

**Durée estimée** : 2-3 heures

### Phase 2 : Intégration DevExtreme

**Objectif** : Intégrer EditCellWidget dans StandardColumn

**Fichiers à modifier** :
1. `StandardColumn.tsx` - Ajouter editCellRender
2. `DxGridInner.hooks.ts` - Passer field et fieldMeta dans columns

**Durée estimée** : 1-2 heures

### Phase 3 : Tests et validation

**Objectif** : Tester tous les types de widgets

**Tests** :
1. Widgets basiques (String, Integer, Decimal, Boolean, Date)
2. Widgets relationnels (ManyToOne, Selection)
3. Widgets inGridEditor (TextEdit popup)

**Durée estimée** : 3-4 heures

### Phase 4 : Optimisations

**Objectif** : Améliorer performance et gérer edge cases

**Optimisations** :
1. Mémoïsation des atoms
2. React.memo sur EditCellWidget
3. Gestion des depends et contextes

**Durée estimée** : 2-3 heures

---

## Phase 1 : Architecture de base

### Étape 1.1 : Créer EditCellWidget.tsx

**Fichier** : `axelor-front/src/views/grid/dx-grid/widgets/EditCellWidget.tsx`

**Responsabilité** :
- Créer les atoms nécessaires (formAtom, widgetAtom, valueAtom)
- Construire le schema Axelor depuis field + fieldMeta
- Rendre FormWidget avec ces atoms
- Propager les changements vers DevExtreme

**Interface** :
```typescript
interface EditCellWidgetProps {
  cellData: any;          // Données DevExtreme (row, column, value)
  field: Field;           // Définition Axelor du champ
  fieldMeta: any;         // Métadonnées du champ
  view: GridView;         // Vue de la grille
  onValueChange: (newValue: any) => void; // Callback pour DevExtreme
}

export function EditCellWidget(props: EditCellWidgetProps) {
  const { cellData, field, fieldMeta, view, onValueChange } = props;

  // 1. Créer les atoms (via hook)
  const { formAtom, widgetAtom, valueAtom } = useGridCellAtoms({
    record: cellData.data,
    field,
    fieldMeta,
    initialValue: cellData.value,
    onValueChange,
  });

  // 2. Construire le schema
  const schema = useMemo(
    () => mapFieldToSchema(field, fieldMeta),
    [field, fieldMeta]
  );

  // 3. Propager les changements de valueAtom vers DevExtreme
  const [value] = useAtom(valueAtom);
  useEffect(() => {
    onValueChange(value);
  }, [value, onValueChange]);

  // 4. Rendre FormWidget
  return (
    <FormWidget
      schema={schema}
      formAtom={formAtom}
      widgetAtom={widgetAtom}
      valueAtom={valueAtom}
      readonly={false}
    />
  );
}
```

**Challenges** :
- Chaque cellule a son propre état → Utiliser clé unique `cellData.key + column.dataField`
- Éviter les re-renders inutiles → Mémoïser schema et atoms
- Synchroniser bidirectionnellement valueAtom ↔ DevExtreme

### Étape 1.2 : Créer useGridCellAtoms.ts

**Fichier** : `axelor-front/src/views/grid/dx-grid/widgets/useGridCellAtoms.ts`

**Responsabilité** :
- Créer formAtom minimal pour la cellule
- Créer widgetAtom avec attrs (readonly, required, etc.)
- Créer valueAtom avec signature spéciale Axelor

**Interface** :
```typescript
interface UseGridCellAtomsParams {
  record: DataRecord;     // Ligne en édition
  field: Field;           // Définition du champ
  fieldMeta: any;         // Métadonnées
  initialValue: any;      // Valeur initiale de la cellule
  onValueChange: (value: any) => void; // Callback de changement
}

export function useGridCellAtoms(params: UseGridCellAtomsParams) {
  const { record, field, fieldMeta, initialValue, onValueChange } = params;

  // 1. Créer formAtom minimal
  const formAtom = useMemo(() => atom({
    model: fieldMeta.model || "",
    record: { ...record },
    fields: { [field.name]: fieldMeta },
    dirty: false,
  }), [record, field.name, fieldMeta]);

  // 2. Créer widgetAtom avec attrs
  const widgetAtom = useMemo(() => atom({
    attrs: {
      readonly: field.readonly || fieldMeta.readonly || false,
      required: field.required || fieldMeta.required || false,
      hidden: field.hidden || false,
      title: field.title || fieldMeta.title,
      placeholder: field.placeholder,
      focus: false,
    },
    errors: [],
  }), [field, fieldMeta]);

  // 3. Créer valueAtom avec signature Axelor
  const valueAtom = useMemo(() => atom(
    // Getter
    (get) => get(formAtom).record[field.name] ?? initialValue,

    // Setter avec signature (value, fireOnChange, markDirty)
    (get, set, newValue: any, fireOnChange = true, markDirty = true) => {
      // Mettre à jour le record dans formAtom
      set(formAtom, (prev) => ({
        ...prev,
        record: { ...prev.record, [field.name]: newValue },
        dirty: markDirty ? true : prev.dirty,
      }));

      // Propager vers DevExtreme si nécessaire
      if (fireOnChange) {
        onValueChange(newValue);
      }
    }
  ), [formAtom, field.name, initialValue, onValueChange]);

  return { formAtom, widgetAtom, valueAtom };
}
```

**Points clés** :
- FormAtom minimal : Seulement les champs nécessaires
- WidgetAtom : Évalue les conditions (readonly, required) depuis field + fieldMeta
- ValueAtom : Signature spéciale avec 3 paramètres (value, fireOnChange, markDirty)

### Étape 1.3 : Créer mapFieldToSchema.ts

**Fichier** : `axelor-front/src/views/grid/dx-grid/widgets/mapFieldToSchema.ts`

**Responsabilité** :
- Convertir Field (vue XML) + FieldMeta (métadonnées) → Schema (FormWidget)
- Gérer les overrides de widget
- Activer inGridEditor pour les widgets spécialisés

**Interface** :
```typescript
export function mapFieldToSchema(field: Field, fieldMeta: any): Schema {
  // Types de base
  const baseSchema: Schema = {
    name: field.name,
    type: "field",
    serverType: fieldMeta.type,           // "STRING", "MANY_TO_ONE", etc.
    title: field.title || fieldMeta.title,
    placeholder: field.placeholder,

    // Conditions
    readonly: field.readonly || fieldMeta.readonly,
    required: field.required || fieldMeta.required,
    hidden: field.hidden,

    // Activation des widgets spécialisés grid
    inGridEditor: true,
  };

  // Override widget si spécifié dans XML
  if (field.widget) {
    baseSchema.widget = field.widget;
  }

  // Propriétés spécifiques par type
  switch (fieldMeta.type) {
    case "MANY_TO_ONE":
    case "ONE_TO_ONE":
      return {
        ...baseSchema,
        target: fieldMeta.target,
        targetName: fieldMeta.targetName,
        targetSearch: fieldMeta.targetSearch,
      };

    case "SELECTION":
      return {
        ...baseSchema,
        selectionList: fieldMeta.selectionList,
      };

    case "DECIMAL":
      return {
        ...baseSchema,
        precision: fieldMeta.precision,
        scale: fieldMeta.scale,
      };

    case "STRING":
      // Si multiline, utiliser widget "text"
      if (field.widget === "text" || fieldMeta.large) {
        return {
          ...baseSchema,
          widget: "text",
          multiline: true,
        };
      }
      return baseSchema;

    default:
      return baseSchema;
  }
}
```

**Mapping des types** :

| serverType | Widget par défaut | inGridEditor | Widget grid |
|------------|-------------------|--------------|-------------|
| STRING | String | true | String |
| STRING (large) | Text | true | TextEdit (popup) |
| INTEGER | Integer | true | Integer |
| DECIMAL | Decimal | true | Decimal |
| BOOLEAN | Boolean | true | Boolean |
| DATE | Date | true | Date |
| DATETIME | DateTime | true | DateTime |
| MANY_TO_ONE | ManyToOne | true | ManyToOne |
| SELECTION | Selection | true | Selection |

---

## Phase 2 : Intégration DevExtreme

### Étape 2.1 : Modifier StandardColumn.tsx

**Fichier** : `axelor-front/src/views/grid/dx-grid/columns/StandardColumn.tsx`

**Changements** :
```typescript
import { EditCellWidget } from "../widgets/EditCellWidget";

export function getStandardColumnProps({
  col,
  idx,
  view,
  viewContext,
  actionExecutor,
  onUpdate
}: StandardColumnProps) {
  return {
    // ... props existants (dataField, caption, width, etc.)

    // Rendu en mode affichage (inchangé)
    cellRender: !col.isButton ? (cellData: any) => {
      return (
        <Cell
          view={view}
          viewContext={viewContext}
          data={col.field}
          index={idx}
          value={cellData.value}
          rawValue={cellData.value}
          record={cellData.data}
          actionExecutor={actionExecutor}
          onUpdate={onUpdate}
        />
      );
    } : (cellData: any) => {
      // Boutons : utiliser Cell avec col.button
      return (
        <Cell
          view={view}
          viewContext={viewContext}
          data={col.button}
          index={idx}
          value={cellData.value}
          rawValue={cellData.value}
          record={cellData.data}
          actionExecutor={actionExecutor}
          onUpdate={onUpdate}
        />
      );
    },

    // NOUVEAU : Rendu en mode édition avec widgets Axelor
    editCellRender: !col.isButton && col.field && col.fieldMeta ? (cellData: any) => {
      return (
        <EditCellWidget
          cellData={cellData}
          field={col.field}
          fieldMeta={col.fieldMeta}
          view={view}
          onValueChange={(newValue) => {
            // Propager la valeur à DevExtreme
            cellData.setValue(newValue);
          }}
        />
      );
    } : undefined,
  };
}
```

**API DevExtreme editCellRender** :

Le callback `editCellRender` reçoit un objet `cellData` avec :
- `cellData.value` : Valeur actuelle de la cellule
- `cellData.data` : Record complet (ligne entière)
- `cellData.row` : Informations sur la ligne
- `cellData.column` : Informations sur la colonne
- `cellData.setValue(value)` : Méthode pour mettre à jour la valeur

**Flow complet** :
```
DevExtreme entre en mode édition
  ↓
editCellRender appelé avec cellData
  ↓
EditCellWidget créé
  ↓
useGridCellAtoms crée formAtom, widgetAtom, valueAtom
  ↓
FormWidget affiché avec le bon widget
  ↓
User édite → onChange → valueAtom mis à jour
  ↓
Effect détecte changement → onValueChange appelé
  ↓
cellData.setValue(newValue) met à jour DevExtreme
  ↓
User Tab/Blur → DevExtreme sort du mode édition
  ↓
CustomStore.update() appelé → dataStore.save()
```

### Étape 2.2 : S'assurer que field et fieldMeta sont passés

**Fichier** : `axelor-front/src/views/grid/dx-grid/DxGridInner.hooks.ts`

**Vérification** :

Dans le hook `useDxColumns`, vérifier que `field` et `fieldMeta` sont bien retournés :

```typescript
// Ligne 98-146 dans DxGridInner.hooks.ts
return {
  isButton: false,
  field,              // ✓ Déjà présent
  fieldMeta,          // ✓ Déjà présent
  dataField: field.name,
  caption: field.title || fieldMeta?.title || field.name,
  // ... autres propriétés
};
```

Ces propriétés sont déjà présentes et passées correctement. Aucune modification nécessaire.

---

## Phase 3 : Tests et validation

### Étape 3.1 : Tester widgets basiques

**Widgets** : String, Integer, Decimal, Boolean, Date

**Checklist de tests** :

#### String
- [ ] Input texte affiché en édition
- [ ] Valeur initiale chargée correctement
- [ ] onChange met à jour la valeur
- [ ] Placeholder affiché si défini
- [ ] MaxLength respecté si défini
- [ ] Pattern/validation appliqué
- [ ] Required indiqué visuellement
- [ ] Readonly désactive l'input

#### Integer
- [ ] Input numérique affiché
- [ ] Valeur initiale correcte
- [ ] Accepte uniquement les entiers
- [ ] Min/max respectés si définis
- [ ] Validation des nombres invalides

#### Decimal
- [ ] Input numérique avec décimales
- [ ] Precision/scale respectés
- [ ] Séparateur décimal correct (locale)
- [ ] Validation des nombres invalides

#### Boolean
- [ ] Checkbox affiché
- [ ] État initial correct (checked/unchecked)
- [ ] Toggle fonctionne
- [ ] Readonly désactive le toggle

#### Date / DateTime
- [ ] DatePicker affiché
- [ ] Date initiale correcte
- [ ] Sélection de date fonctionne
- [ ] Format de date correct (locale)
- [ ] Validation de dates invalides

### Étape 3.2 : Tester widgets relationnels

**Widgets** : ManyToOne, Selection

**Checklist de tests** :

#### ManyToOne
- [ ] Select avec autocompletion affiché
- [ ] Valeur initiale affichée (targetName)
- [ ] Recherche fonctionne (fetchOptions)
- [ ] Sélection met à jour la valeur
- [ ] targetSearch respecté si défini
- [ ] Icons (view, edit, add) présents
- [ ] Click sur view ouvre le formulaire
- [ ] Click sur edit ouvre l'édition
- [ ] Click sur add ouvre création
- [ ] Readonly désactive la sélection

#### Selection
- [ ] Select avec options affiché
- [ ] selectionList chargé correctement
- [ ] Valeur initiale sélectionnée
- [ ] Changement de sélection fonctionne
- [ ] Option vide disponible si non required
- [ ] Readonly désactive le select

### Étape 3.3 : Tester widgets inGridEditor

**Widgets** : TextEdit (popup textarea)

**Checklist de tests** :

#### TextEdit
- [ ] Input simple affiché inline
- [ ] Focus sur input ouvre popup
- [ ] Popup positionné correctement
- [ ] Textarea dans popup a focus automatique
- [ ] Contenu initial chargé dans textarea
- [ ] Édition dans textarea fonctionne
- [ ] Blur sur textarea ferme popup et sauvegarde
- [ ] ESC ferme popup sans sauvegarder
- [ ] Un seul popup ouvert à la fois
- [ ] Popup suit le scroll de la grille
- [ ] Tab/Shift+Tab ferme popup et navigue

### Étape 3.4 : Tester navigation et validation

**Navigation** :
- [ ] Tab navigue vers cellule éditable suivante
- [ ] Shift+Tab navigue vers cellule précédente
- [ ] Enter sauvegarde et descend d'une ligne
- [ ] Escape annule l'édition
- [ ] Clic ailleurs sauvegarde automatiquement

**Validation** :
- [ ] Champ required bloque la sauvegarde si vide
- [ ] Message d'erreur affiché si validation échoue
- [ ] Pattern validé avant sauvegarde
- [ ] Min/max validés pour nombres
- [ ] Dates invalides rejetées

---

## Phase 4 : Optimisations

### Étape 4.1 : Performance

#### Mémoïsation des atoms

**Problème** : Les atoms sont recréés à chaque render de `EditCellWidget`

**Solution** : Utiliser une clé stable pour mémoïser

```typescript
// Dans EditCellWidget.tsx
const atomKey = useMemo(
  () => `${cellData.key}_${field.name}`,
  [cellData.key, field.name]
);

const atoms = useMemo(
  () => useGridCellAtoms({ ... }),
  [atomKey, ...]
);
```

#### React.memo sur EditCellWidget

```typescript
export const EditCellWidget = React.memo(
  function EditCellWidget(props: EditCellWidgetProps) {
    // ... implémentation
  },
  (prev, next) => {
    // Comparer uniquement les props critiques
    return (
      prev.cellData.value === next.cellData.value &&
      prev.field === next.field &&
      prev.fieldMeta === next.fieldMeta
    );
  }
);
```

### Étape 4.2 : Edge cases

#### Champs calculés (readonly computed)

**Problème** : Les champs calculés doivent être readonly et recalculés

**Solution** : Détecter `computed: true` dans fieldMeta et forcer readonly

```typescript
const widgetAtom = useMemo(() => atom({
  attrs: {
    readonly: field.readonly || fieldMeta.readonly || fieldMeta.computed,
    // ... autres attrs
  },
}), [field, fieldMeta]);
```

#### Depends (re-render si champ dépendant change)

**Problème** : Un champ peut dépendre d'un autre (ex: `depends="country"`)

**Solution** : Subscribe aux changements des champs depends

```typescript
// Dans EditCellWidget
const dependsFields = field.depends?.split(',').map(f => f.trim()) || [];

useEffect(() => {
  if (dependsFields.length === 0) return;

  // Subscribe aux changements des champs depends
  const unsubscribe = dependsFields.map(depField => {
    return formAtom.subscribe((state) => {
      const depValue = state.record[depField];
      // Re-évaluer les conditions du widget
      // Mettre à jour widgetAtom si nécessaire
    });
  });

  return () => unsubscribe.forEach(fn => fn());
}, [dependsFields, formAtom]);
```

#### Contexte d'expressions (accès à _parent, _self)

**Problème** : Les expressions peuvent référencer `_parent`, `_self`, etc.

**Solution** : Construire un contexte d'évaluation complet

```typescript
const evalContext = useMemo(() => ({
  _self: cellData.data,      // Record courant
  _parent: viewContext,      // Contexte parent (vue)
  _value: cellData.value,    // Valeur courante
  // ... autres variables contextuelles
}), [cellData, viewContext]);
```

### Étape 4.3 : Gestion des hilites

**Problème** : Les hilites doivent être appliquées même en édition

**Solution** : Wrapper EditCellWidget dans un Box avec classes hilite

```typescript
editCellRender: (cellData: any) => {
  // Évaluer les hilites
  const hilites = evaluateHilites(field, cellData.data, viewContext);
  const hiliteClasses = hilites.map(h => legacyClassNames(h.css)).join(' ');

  return (
    <Box className={hiliteClasses}>
      <EditCellWidget
        cellData={cellData}
        field={col.field}
        fieldMeta={col.fieldMeta}
        view={view}
        onValueChange={(newValue) => cellData.setValue(newValue)}
      />
    </Box>
  );
}
```

---

## Exemples de code

### Exemple complet : EditCellWidget

```typescript
// axelor-front/src/views/grid/dx-grid/widgets/EditCellWidget.tsx

import React, { useMemo, useEffect } from "react";
import { useAtom } from "jotai";
import { FormWidget } from "@/views/form/builder/form-widget";
import { useGridCellAtoms } from "./useGridCellAtoms";
import { mapFieldToSchema } from "./mapFieldToSchema";
import type { Field, GridView } from "@/services/client/meta.types";

interface EditCellWidgetProps {
  cellData: any;
  field: Field;
  fieldMeta: any;
  view: GridView;
  onValueChange: (newValue: any) => void;
}

export const EditCellWidget = React.memo(
  function EditCellWidget(props: EditCellWidgetProps) {
    const { cellData, field, fieldMeta, view, onValueChange } = props;

    // 1. Créer les atoms (formAtom, widgetAtom, valueAtom)
    const { formAtom, widgetAtom, valueAtom } = useGridCellAtoms({
      record: cellData.data,
      field,
      fieldMeta,
      initialValue: cellData.value,
      onValueChange,
    });

    // 2. Construire le schema Axelor
    const schema = useMemo(
      () => mapFieldToSchema(field, fieldMeta),
      [field, fieldMeta]
    );

    // 3. Propager les changements de valueAtom vers DevExtreme
    const [value] = useAtom(valueAtom);
    useEffect(() => {
      onValueChange(value);
    }, [value, onValueChange]);

    // 4. Rendre FormWidget avec le widget approprié
    return (
      <FormWidget
        schema={schema}
        formAtom={formAtom}
        widgetAtom={widgetAtom}
        valueAtom={valueAtom}
        readonly={false}
      />
    );
  },
  // Comparaison custom pour éviter re-renders inutiles
  (prev, next) => {
    return (
      prev.cellData.value === next.cellData.value &&
      prev.field === next.field &&
      prev.fieldMeta === next.fieldMeta
    );
  }
);
```

### Exemple complet : useGridCellAtoms

```typescript
// axelor-front/src/views/grid/dx-grid/widgets/useGridCellAtoms.ts

import { useMemo } from "react";
import { atom } from "jotai";
import type { Field } from "@/services/client/meta.types";
import type { DataRecord } from "@/services/client/data.types";

interface UseGridCellAtomsParams {
  record: DataRecord;
  field: Field;
  fieldMeta: any;
  initialValue: any;
  onValueChange: (value: any) => void;
}

export function useGridCellAtoms(params: UseGridCellAtomsParams) {
  const { record, field, fieldMeta, initialValue, onValueChange } = params;

  // 1. FormAtom : État minimal du formulaire
  const formAtom = useMemo(
    () =>
      atom({
        model: fieldMeta.model || "",
        record: { ...record },
        fields: { [field.name]: fieldMeta },
        dirty: false,
      }),
    [record, field.name, fieldMeta]
  );

  // 2. WidgetAtom : Attributs dynamiques du widget
  const widgetAtom = useMemo(
    () =>
      atom({
        attrs: {
          readonly: field.readonly || fieldMeta.readonly || false,
          required: field.required || fieldMeta.required || false,
          hidden: field.hidden || false,
          title: field.title || fieldMeta.title,
          placeholder: field.placeholder,
          focus: false,
        },
        errors: [],
      }),
    [field, fieldMeta]
  );

  // 3. ValueAtom : Valeur du champ avec signature spéciale
  const valueAtom = useMemo(
    () =>
      atom(
        // Getter : Lire la valeur depuis formAtom.record[fieldName]
        (get) => get(formAtom).record[field.name] ?? initialValue,

        // Setter : Écrire avec signature (value, fireOnChange, markDirty)
        (get, set, newValue: any, fireOnChange = true, markDirty = true) => {
          // Mettre à jour le record dans formAtom
          set(formAtom, (prev) => ({
            ...prev,
            record: { ...prev.record, [field.name]: newValue },
            dirty: markDirty ? true : prev.dirty,
          }));

          // Propager vers DevExtreme si fireOnChange = true
          if (fireOnChange) {
            onValueChange(newValue);
          }
        }
      ),
    [formAtom, field.name, initialValue, onValueChange]
  );

  return { formAtom, widgetAtom, valueAtom };
}
```

### Exemple complet : mapFieldToSchema

```typescript
// axelor-front/src/views/grid/dx-grid/widgets/mapFieldToSchema.ts

import type { Field } from "@/services/client/meta.types";
import type { Schema } from "@/views/form/builder";

export function mapFieldToSchema(field: Field, fieldMeta: any): Schema {
  // Schema de base
  const baseSchema: Schema = {
    name: field.name,
    type: "field",
    serverType: fieldMeta.type,
    title: field.title || fieldMeta.title,
    placeholder: field.placeholder,
    readonly: field.readonly || fieldMeta.readonly,
    required: field.required || fieldMeta.required,
    hidden: field.hidden,
    inGridEditor: true, // Active les widgets spécialisés grid
  };

  // Override widget si spécifié dans XML
  if (field.widget) {
    baseSchema.widget = field.widget;
  }

  // Propriétés spécifiques par type
  switch (fieldMeta.type) {
    case "MANY_TO_ONE":
    case "ONE_TO_ONE":
      return {
        ...baseSchema,
        target: fieldMeta.target,
        targetName: fieldMeta.targetName,
        targetSearch: fieldMeta.targetSearch,
      };

    case "SELECTION":
      return {
        ...baseSchema,
        selectionList: fieldMeta.selectionList,
      };

    case "DECIMAL":
      return {
        ...baseSchema,
        precision: fieldMeta.precision,
        scale: fieldMeta.scale,
      };

    case "STRING":
      // Si multiline, utiliser widget "text"
      if (field.widget === "text" || fieldMeta.large) {
        return {
          ...baseSchema,
          widget: "text",
          multiline: true,
        };
      }
      return baseSchema;

    case "INTEGER":
      return {
        ...baseSchema,
        min: fieldMeta.min,
        max: fieldMeta.max,
      };

    case "DATE":
    case "DATETIME":
      return {
        ...baseSchema,
        format: fieldMeta.format,
      };

    default:
      return baseSchema;
  }
}
```

---

## FAQ

### Q1 : Pourquoi créer un formAtom par cellule au lieu d'un global ?

**R** : Chaque cellule en édition a son propre état isolé :
- Évite les conflits entre cellules
- Simplifie la gestion du dirty state
- Permet d'annuler l'édition d'une cellule sans affecter les autres

### Q2 : Comment gérer les widgets qui ouvrent des dialogs (M2O, O2M) ?

**R** : Les widgets Axelor gèrent déjà les dialogs en interne. FormWidget affiche automatiquement les icons (view, edit, add) et ouvre les dialogs appropriés.

### Q3 : Que se passe-t-il si l'utilisateur quitte la cellule sans sauvegarder ?

**R** : DevExtreme appelle automatiquement `saveEditData()` lors du blur/tab. Le CustomStore.update() est appelé et la valeur est persistée via `dataStore.save()`.

### Q4 : Comment gérer les validations asynchrones (ex: unicité) ?

**R** : Les widgets Axelor supportent la validation asynchrone via le hook `useInput`. La validation est déclenchée au blur et peut bloquer la sauvegarde si elle échoue.

### Q5 : Les widgets inGridEditor (TextEdit) fonctionnent-ils avec DevExtreme ?

**R** : Oui, TextEdit affiche un input inline et ouvre un popup au focus. Le popup est positionné au-dessus de la grille via un overlay et fonctionne normalement.

### Q6 : Comment tester l'intégration sans tout casser ?

**R** : Implémenter progressivement :
1. Commencer par String (le plus simple)
2. Ajouter Integer, Decimal, Boolean, Date
3. Ajouter ManyToOne et Selection
4. Finir par TextEdit et autres widgets complexes

Activer widget par widget via un flag de configuration si nécessaire.

### Q7 : Quelle est la performance avec des grilles de 1000+ lignes ?

**R** : DevExtreme n'affiche que les lignes visibles (virtualisation). Seulement les cellules en édition créent des atoms. Performance comparable à la grille Axelor standard.

### Q8 : Comment déboguer les problèmes de widgets ?

**R** : Utiliser les DevTools React + Jotai DevTools :
- Inspecter les atoms (formAtom, widgetAtom, valueAtom)
- Vérifier le schema généré par `mapFieldToSchema`
- Logger les événements onChange dans `useGridCellAtoms`
- Activer `DX_GRID_DEBUG_ENABLED` dans `dx-grid-debug.ts`

---

## Diagramme de flux complet

```
┌─────────────────────────────────────────────────────────────────┐
│                    User clique sur cellule                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         DevExtreme active mode édition (editRowKey)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           editCellRender appelé avec cellData                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  EditCellWidget créé                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  useGridCellAtoms({ record, field, fieldMeta, ... })      │ │
│  │    ├─ formAtom: { model, record, fields }                 │ │
│  │    ├─ widgetAtom: { attrs: {readonly, required, ...} }    │ │
│  │    └─ valueAtom: atom(getter, setter)                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  schema = mapFieldToSchema(field, fieldMeta)              │ │
│  │    → { name, serverType, widget, target, ... }            │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│       FormWidget affiché avec le bon widget                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  useWidget(schema)                                         │ │
│  │    ├─ inGridEditor ? TextEdit : Text                       │ │
│  │    ├─ widget override ? Selection : serverType            │ │
│  │    └─ Comp = WIDGETS[name] || WIDGETS[type]               │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Widget rendered (ex: ManyToOne, String, etc.)            │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                User édite dans le widget                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              onChange déclenché par le widget                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  useInput({ valueAtom, schema, ... })                     │ │
│  │    ├─ onChange(e) → setText(e.target.value)               │ │
│  │    └─ onBlur() → setValue(parse(text), true, true)        │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          valueAtom mis à jour (setter appelé)                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  set(valueAtom, newValue, fireOnChange=true, markDirty)   │ │
│  │    ├─ Mettre à jour formAtom.record[fieldName]            │ │
│  │    └─ Appeler onValueChange(newValue) si fireOnChange     │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│      Effect détecte changement de valueAtom                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  useEffect(() => {                                         │ │
│  │    onValueChange(value);                                   │ │
│  │  }, [value, onValueChange]);                               │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         cellData.setValue(newValue) appelé                      │
│         → DevExtreme met à jour sa cellule interne              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│     User Tab / Blur / Click ailleurs / Enter                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│        DevExtreme sort du mode édition (editRowKey = null)      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           DevExtreme appelle saveEditData()                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│      CustomStore.update(key, values) appelé                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  update: async (key, values) => {                         │ │
│  │    const original = await dataStore.read(key);            │ │
│  │    const merged = { ...original, ...values };             │ │
│  │    return await dataStore.save(merged);                   │ │
│  │  }                                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              dataStore.save(record) persiste en base            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Édition terminée ✓                             │
└─────────────────────────────────────────────────────────────────┘
```

---

**Date de création** : 2025-01-12
**Auteur** : Claude Code + Nicolas Vautrin
**Version** : 1.0