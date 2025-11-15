# Documentation : Création du FormAtom dans Axelor Grid

## Table des matières
1. [Vue d'ensemble](#vue-densemble)
2. [Comment Axelor Grid crée le FormRenderer](#comment-axelor-grid-crée-le-formrenderer)
3. [Flux complet d'édition inline](#flux-complet-dédition-inline)
4. [Création du formAtom](#création-du-formatom)
5. [Différences DxGrid vs Axelor Standard](#différences-dxgrid-vs-axelor-standard)
6. [Problème actuel avec les triggers onChange](#problème-actuel-avec-les-triggers-onchange)
7. [Solution recommandée](#solution-recommandée)

---

## Vue d'ensemble

La grid Axelor standard utilise un système d'édition inline basé sur **FormRenderer**, un composant React qui crée un formulaire complet pour éditer une ligne de la grille. Ce système repose sur :

- **formAtom** : Un Jotai atom contenant l'état du formulaire (record, metadata, validation, etc.)
- **useFormHandlers** : Un hook qui crée le formAtom ET les handlers (actionExecutor, actionHandler, recordHandler)
- **FormWidget** : Les widgets de champs qui lisent/écrivent dans le formAtom
- **Triggers automatiques** : Les valueAtoms créés par useFormHandlers déclenchent automatiquement onChange/onSelect

---

## Comment Axelor Grid crée le FormRenderer

### 1. Localisation du code

Le FormRenderer est créé en **deux endroits** :

#### A) Dans `builder/grid.tsx` (lignes 555-582)

Un `useMemo` crée une fonction wrapper `CustomFormRenderer` :

```typescript
const CustomFormRenderer = useMemo(() => {
  // Préparer les items de la vue pour le formulaire
  const items = view.items?.map(item => {
    // Transformer les champs grid en champs form
    // ...
  });

  const gridView = { ...view, items } as GridView;

  // Retourner une fonction React qui sera appelée par la grid
  return (props: GridRowProps) => (
    <FormRenderer
      ref={formRef}
      {...props}
      view={gridView}
      viewContext={viewContext}
      fields={fields}
      isLastRow={(state?.rows?.length ?? 0) - 1 === props.index}
      onAddSubLine={onAddSubLine}
      onInit={onFormInit}
    />
  );
}, [view, fields, viewContext, state?.rows?.length, onAddSubLine, onFormInit]);

// Puis passé au Grid :
<AxGrid
  editRowRenderer={CustomFormRenderer}
  {...otherProps}
/>
```

**Points clés** :
- `CustomFormRenderer` est une **fonction React**, pas un composant classe
- Elle est **mémoïsée** pour éviter de la recréer à chaque render
- Elle est **appelée automatiquement** par la grid quand une ligne entre en édition
- Le `ref={formRef}` permet d'accéder au formAtom depuis l'extérieur

#### B) Dans `renderers/form/form.tsx` (ligne 263)

Le composant réel `FormRenderer` (exporté comme `Form`) :

```typescript
export const Form = forwardRef<GridFormHandler, GridFormRendererProps>(
  function Form(props, ref) {
    const { view, data: gridRow, editCell: cellIndex, columns, ... } = props;

    // Créer le formAtom via useFormHandlers
    const { formAtom, actionHandler, recordHandler, actionExecutor } =
      useFormHandlers(meta as unknown as ViewData<FormView>, record, {
        ...(parent !== fallbackFormAtom && { parent }),
        context: viewContext,
        states: initFormFieldsStates,  // Focus sur le champ édité
      });

    // Exposer via ref pour accès externe
    useImperativeHandle(ref, () => ({
      formAtom,
      invalid: checkInvalid,
      onSave: handleSave,
      onCancel: handleCancel,
    }), [formAtom, checkInvalid, handleSave, handleCancel]);

    return (
      <FocusTrap initialFocus={false}>
        <Box ref={containerRef}>
          <ClickAwayListener onClickAway={handleClickOutside}>
            <FormComponent
              schema={view}
              fields={fields!}
              layout={CustomLayout}
              formAtom={formAtom}
            />
          </ClickAwayListener>
        </Box>
      </FocusTrap>
    );
  }
);
```

**Points clés** :
- C'est un **composant React** qui peut utiliser des hooks
- `useFormHandlers()` crée le formAtom avec tous les valueAtoms et triggers
- `useImperativeHandle()` expose le formAtom via ref
- `FormComponent` rend les widgets avec le formAtom partagé

---

## Flux complet d'édition inline

```
┌──────────────────────────────────────────────────────────────┐
│ 1. USER ACTION : Clic sur ligne de grid                      │
└────────────────────────┬─────────────────────────────────────┘
                         ↓
         ┌───────────────────────────────────────┐
         │ 2. Grid détecte clic & appelle        │
         │ handleRowClick() → setState({         │
         │   editRow: [rowIndex, cellIndex]      │
         │ })                                    │
         └───────────────┬───────────────────────┘
                         ↓
        ┌────────────────────────────────────────────┐
        │ 3. Grid.re-render() → GridBody.re-render() │
        │ GridBody détecte editRow && utilise        │
        │ renderer = editRowRenderer                 │
        │ (qui est CustomFormRenderer)               │
        └────────────┬──────────────────────────────┘
                     ↓
      ┌──────────────────────────────────────────────────┐
      │ 4. GridBodyRow appelle CustomFormRenderer({      │
      │   data: gridRow,                                 │
      │   editCell: cellIndex,                          │
      │   columns: [...],                               │
      │   onSave: handleRecordSave,                     │
      │   onCancel: handleRecordDiscard,                │
      │   ...                                            │
      │ })                                               │
      └──────────────┬───────────────────────────────────┘
                     ↓
    ┌─────────────────────────────────────────────────────────┐
    │ 5. CustomFormRenderer retourne :                        │
    │   <FormRenderer ref={formRef} {...props} view={...} /> │
    └──────────────┬────────────────────────────────────────────┘
                   ↓
  ┌────────────────────────────────────────────────────────────┐
  │ 6. FormRenderer (Form component) :                         │
  │ a) Extrait props: data, editCell, columns, onSave, ...    │
  │ b) Appelle useFormHandlers(meta, record, {                │
  │      states: initFormFieldsStates (focus sur editCell)     │
  │    })                                                       │
  │ c) Obtient : { formAtom, actionHandler, ... }             │
  │ d) Expose via forwardRef : { formAtom, onSave, ...}       │
  └──────────────┬──────────────────────────────────────────────┘
                 ↓
    ┌─────────────────────────────────────────────────────┐
    │ 7. useFormHandlers crée formAtom :                   │
    │ createFormAtom({                                     │
    │   meta: { view, fields, model },                    │
    │   record: gridRow.record,                           │
    │   statesByName: initFormFieldsStates,               │
    │ })                                                   │
    │                                                      │
    │ formAtom = Jotai atom avec l'état du formulaire    │
    └──────────────┬───────────────────────────────────────┘
                   ↓
      ┌─────────────────────────────────────────────────────┐
      │ 8. FormRenderer rend FormComponent avec formAtom    │
      │ <FormComponent                                       │
      │   schema={view}                                      │
      │   layout={CustomLayout}  ← FormLayoutComponent      │
      │   formAtom={formAtom}    ← Jotai atom              │
      │   ...                                               │
      │ />                                                  │
      └──────────────┬───────────────────────────────────────┘
                     ↓
   ┌──────────────────────────────────────────────────────────┐
   │ 9. CustomLayout (FormLayoutComponent) :                  │
   │ - Affiche colonnes en flex layout (inline)              │
   │ - Pour chaque colonne : <FormWidget                     │
   │     schema={item}                                        │
   │     formAtom={formAtom}  ← Même atom pour tous         │
   │     ...                                                  │
   │   />                                                     │
   │ - FormWidget utilise formAtom pour lire/écrire values  │
   └──────────────┬──────────────────────────────────────────┘
                  ↓
          ┌────────────────────────────────┐
          │ 10. AFFICHAGE FINAL            │
          │ Ligne affiche des inputs       │
          │ éditables côte à côte          │
          └────────────────────────────────┘
```

---

## Création du formAtom

### useFormHandlers - Le hook qui crée tout

**Fichier** : `form/builder/form.tsx` (lignes 34-87)

```typescript
export function useFormHandlers(
  meta: ViewData<FormView>,
  record: DataRecord,
  options?: {
    parent?: FormAtom;
    states?: Record<string, WidgetState>;
    context?: DataContext;
    ...
  }
) {
  // 1. Créer le formAtom (ou utiliser celui fourni)
  const formAtom = useMemo(
    () =>
      givenFormAtom ??
      createFormAtom({
        meta,
        record,
        parent,
        context,
        statesByName,
      }),
    [givenFormAtom, meta, record, context, parent, statesByName],
  );

  // 2. Créer les handlers
  const recordHandler = useRecordHandler(formAtom, meta);
  const actionHandler = useActionHandler(formAtom, meta, options);
  const actionExecutor = useActionExecutor(meta.view, {
    formAtom,
    getContext: options?.getContext,
    onRefresh: options?.onRefresh,
    onSave: options?.onSave,
  });

  return { formAtom, recordHandler, actionHandler, actionExecutor };
}
```

### Structure du formAtom

Le formAtom est un **Jotai atom** avec cette structure :

```typescript
interface FormAtomType {
  meta: {
    view: FormView;
    fields: Record<string, Property>;
    model: string;
  };
  record: DataRecord;        // Données actuelles
  original: DataRecord;      // Données originales (pour dirty check)
  dirty: boolean;            // Y a-t-il des modifications ?
  statesByName: Record<string, WidgetState>;  // État par champ
  parent?: FormAtom;         // FormAtom parent (grilles imbriquées)
  // ...
}
```

### ValueAtoms et triggers automatiques

**C'est ICI que la magie se produit** : Quand on utilise `useFormHandlers()`, les valueAtoms sont créés automatiquement avec les triggers onChange/onSelect.

**Fichier** : `form/builder/atoms.ts` (lignes 150-200 environ)

```typescript
export function createValueAtom(
  formAtom: PrimitiveAtom<FormAtomType>,
  name: string,
  options: { trigger?: boolean } = {}
): ValueAtom {
  return atom(
    // Getter : lire la valeur depuis formAtom.record[name]
    (get) => get(formAtom).record[name],

    // Setter : écrire la valeur dans formAtom.record[name]
    async (get, set, value, callOnChange = true, markDirty = true) => {
      const form = get(formAtom);

      // Mettre à jour le record
      set(formAtom, {
        ...form,
        record: { ...form.record, [name]: value },
        dirty: markDirty ? true : form.dirty,
      });

      // ⚠️ IMPORTANT : Si callOnChange === true, déclencher le trigger
      if (callOnChange && options.trigger) {
        await triggerOnChange(formAtom, name, value, get, set);
      }
    }
  );
}
```

**Fonction `triggerOnChange`** :

```typescript
async function triggerOnChange(
  formAtom: PrimitiveAtom<FormAtomType>,
  fieldName: string,
  newValue: any,
  get: Getter,
  set: Setter
) {
  const form = get(formAtom);
  const field = form.meta.fields[fieldName];

  // Récupérer le trigger onChange depuis le field
  const onChangeAction = field?.onChange;

  if (onChangeAction) {
    // Exécuter l'action onChange
    const actionExecutor = get(actionExecutorAtom);
    const result = await actionExecutor.execute(onChangeAction, {
      context: form.record,
    });

    // Traiter le résultat (setValue, setAttrs, setFlash, etc.)
    if (result?.values) {
      set(formAtom, {
        ...form,
        record: { ...form.record, ...result.values },
      });
    }
    // ... autres traitements (attrs, flash, errors)
  }
}
```

---

## Différences DxGrid vs Axelor Standard

| Aspect | Axelor Standard | DxGrid Actuel |
|--------|----------------|---------------|
| **Renderer** | FormRenderer (composant React) | DxEditCell (par cellule) |
| **FormAtom créé où ?** | Dans FormRenderer via useFormHandlers() | Dans handleEditingStart via createFormAtom() ❌ |
| **FormAtom créé comment ?** | useFormHandlers() → valueAtoms avec triggers | createFormAtom() → atom simple SANS valueAtoms ❌ |
| **Triggers onChange** | ✅ Automatiques via valueAtom | ❌ Manuels via useEffect |
| **Partage formAtom** | Un seul FormRenderer pour toute la ligne | DxEditRowContext + cache |
| **Cycle de vie** | FormRenderer monte/unmount | handleEditingStart/handleSaved |

---

## Problème actuel avec les triggers onChange

### Symptôme

Les triggers onChange **ne se déclenchent PAS** dans DxGrid.

### Cause racine

Dans `DxGridInner.tsx` ligne 690, on appelle **directement** `createFormAtom()` :

```typescript
// ❌ PROBLÈME : createFormAtom() ne crée PAS les valueAtoms avec triggers
const rowFormAtom = createFormAtom({
  meta: {
    view,
    fields,
    model: view.model,
  } as any,
  record: rowData,
});
```

**Pourquoi c'est un problème ?**

1. `createFormAtom()` crée **seulement** l'atom de base avec `{meta, record, dirty, ...}`
2. Il ne crée **PAS** les valueAtoms pour chaque champ
3. Sans valueAtoms, pas de `triggerOnChange()` automatique
4. Les widgets écrivent directement dans `formAtom.record[name]` sans passer par `setValue(value, true)`

### Pourquoi on ne peut pas juste appeler useFormHandlers() ?

**On est dans un callback**, pas dans un composant React :

```typescript
const handleEditingStart = useCallback((e: any) => {
  // ❌ Erreur : useFormHandlers est un hook, on ne peut pas l'appeler ici !
  const handlers = useFormHandlers(meta, record);
}, []);
```

**Les hooks React ne peuvent être appelés QUE dans** :
- Le corps d'un composant fonction
- Un autre hook personnalisé

---

## Solution recommandée

### Option 1 : Revenir à l'approche DxEditCell avec cache (RECOMMANDÉE)

Au lieu de créer le formAtom dans `handleEditingStart`, **laisser DxEditCell créer le formAtom** via `useFormHandlers()` comme avant, mais **utiliser le cache** pour partager entre cellules.

**Avantages** :
- ✅ useFormHandlers() crée les valueAtoms avec triggers automatiques
- ✅ Le cache garantit qu'on réutilise le même formAtom pour toute la ligne
- ✅ Pas besoin de modifier DxEditRowContext

**Code** :

```typescript
// Dans DxEditCell.tsx
export const DxEditCell = React.memo(
  function DxEditCell(props: DxEditCellProps) {
    const { cellData, field, allFields, view, viewContext } = props;
    const cache = useDxEditCellCache();
    const rowKey = cellData.key;

    // 1. Créer formAtom via useFormHandlers (avec triggers automatiques)
    const formHandlers = useFormHandlers(
      { view, fields: allFields, model: view.model } as any,
      cellData.data,
      { context: viewContext }
    );

    // 2. Utiliser le cache pour partager entre cellules de la même ligne
    let cachedFormAtom = cache.get(rowKey);
    if (!cachedFormAtom) {
      cachedFormAtom = formHandlers.formAtom;
      cache.set(rowKey, cachedFormAtom);
    }

    const formAtom = cachedFormAtom;
    const { actionExecutor } = formHandlers;

    // 3. Convertir Field → Schema
    const schema = useFieldSchema(field, fieldMeta, allFields);

    // 4. Rendre FormWidget
    return <FormWidget schema={schema} formAtom={formAtom} readonly={false} />;
  }
);
```

**Supprimer** :
- Le code manuel de déclenchement onChange dans useEffect
- La logique de création de formAtom dans handleEditingStart
- DxEditRowContext (optionnel, on peut garder pour d'autres usages)

---

### Option 2 : Créer un composant FormAtomProvider

Créer un composant React qui encapsule `useFormHandlers()` et fournit le formAtom via contexte.

**Avantages** :
- ✅ useFormHandlers() dans un composant (hooks OK)
- ✅ FormAtom créé une seule fois pour la ligne

**Inconvénients** :
- ❌ Plus complexe
- ❌ Nécessite de restructurer DxGridInner

**Code (exemple)** :

```typescript
// DxFormAtomProvider.tsx
function DxFormAtomProvider({ rowKey, rowData, meta, children }) {
  const { formAtom, actionExecutor } = useFormHandlers(
    meta,
    rowData,
    { context: viewContext }
  );

  return (
    <DxEditRowContext.Provider value={{ rowKey, formAtom, actionExecutor }}>
      {children}
    </DxEditRowContext.Provider>
  );
}

// Dans DxGridInner, wrapper les cellules en édition
{isEditing && (
  <DxFormAtomProvider rowKey={key} rowData={data} meta={meta}>
    {cells.map(cell => <DxEditCell {...cell} />)}
  </DxFormAtomProvider>
)}
```

---

## Conclusion

**Le problème principal** : On appelle `createFormAtom()` au lieu de `useFormHandlers()`, ce qui ne crée pas les valueAtoms avec triggers automatiques.

**La solution la plus simple** : Revenir à l'approche originale de DxEditCell qui utilise `useFormHandlers()`, mais garder le système de cache pour partager le formAtom entre toutes les cellules d'une même ligne.

**Prochaine étape** : Implémenter l'Option 1 (recommandée).