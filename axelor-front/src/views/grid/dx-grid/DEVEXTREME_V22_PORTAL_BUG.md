# Bug DevExtreme v22.2.15 : Perte des modifications lors du ClickAway en mode O2M

## Contexte

Lors du downgrade de DevExtreme v25 vers v22.2.15, l'édition inline des grilles OneToMany (O2M) ne fonctionne plus correctement : **les modifications sont perdues lors du clic en dehors de la ligne**.

## Symptôme

1. Ouvrir un formulaire avec une grille O2M (ex: `action-dx-test-auction-fee`)
2. Cliquer sur une ligne pour l'éditer (mode édition inline)
3. Modifier un champ (ex: "Critère Acheteur/Vendeur")
4. Cliquer en dehors de la ligne pour déclencher l'auto-save
5. **Résultat** : La modification n'est pas sauvegardée, la valeur revient à l'original

## Cause racine identifiée

### DevExtreme v22 utilise `ReactDOM.createPortal()`

DevExtreme v22.2.15 utilise `ReactDOM.createPortal()` pour rendre les templates de lignes (`dataRowRender`). Cela casse la propagation du contexte React/Jotai :

```
┌─────────────────────────────────────────────────────────────┐
│ DxGrid (Provider store={defaultStore})                       │
│   │                                                          │
│   └── DataGrid                                               │
│         │                                                    │
│         └── dataRowRender (via createPortal) ─────────────┐  │
│                                                           │  │
│              ❌ CONTEXTE PERDU ICI                        │  │
│                                                           │  │
│         ┌─────────────────────────────────────────────────┘  │
│         ▼                                                    │
│    DxEditRow (dans un portal séparé)                         │
│      └── FormWidget                                          │
│            └── useAtomValue(formAtom) ← lit depuis un        │
│                                         AUTRE store !        │
└─────────────────────────────────────────────────────────────┘
```

### Conséquence : Mismatch de formAtom/store

- **DxEditCell** modifie `formAtom` dans **store A** (portal)
- **handleClickAway** lit `formAtom` depuis **store B** (default)
- Les modifications ne sont jamais vues par handleClickAway

## Solution implémentée

### 1. Store Jotai dédié par ligne d'édition

Dans `DxEditRow.tsx`, créer un store dédié et le passer au parent :

```typescript
// Créer un store DÉDIÉ pour cette ligne d'édition
const store = useMemo(() => existingStore || createStore(), [existingStore]);

// Notifier le parent avec le store ET le formAtom
useLayoutEffect(() => {
  onFormAtomReady?.({ formAtom, store });
}, [formAtom, store, onFormAtomReady]);
```

### 2. Passer le store local au handleClickAway

Dans `DxEditRow.tsx`, wrapper `onClickAway` pour passer le store/formAtom locaux :

```typescript
const handleClickAway = useMemo(() => {
  if (!onClickAway) return undefined;
  return (event: Event) => {
    onClickAway(event, store, formAtom);  // ← Passe les valeurs LOCALES
  };
}, [onClickAway, store, formAtom]);
```

### 3. Utiliser le store local dans saveEditingRowAndClose

Dans `DxGrid.hooks.ts`, utiliser le store passé en priorité :

```typescript
async function saveEditingRowAndClose(
  gridInstance: any,
  isLocalMode: boolean,
  formAtom: any,  // Valeur directe (pas une ref)
  store: any,     // Valeur directe (pas une ref)
  // ...
) {
  // Utiliser le store local en priorité
  const storeToUse = store || getDefaultStore();
  const formState = storeToUse.get(formAtom);
  const currentRecord = formState?.record;
  // ...
}
```

### 4. Réutiliser formAtom/store lors des remontages

DevExtreme peut remonter `DxEditRow` plusieurs fois pendant l'édition. Pour éviter de perdre l'état :

```typescript
// Dans DxGrid.tsx - stocker les refs
const editingRowFormAtomRef = useRef<any>(null);
const editingRowStoreRef = useRef<any>(null);

// Dans DxRow.tsx - passer les valeurs existantes
<DxEditRow
  existingFormAtom={editingRowFormAtomRef.current}
  existingStore={editingRowStoreRef.current}
  // ...
/>

// Dans DxEditRow.tsx - réutiliser si existant
const store = useMemo(() => existingStore || createStore(), [existingStore]);
```

## Problème actuel (en cours de debug)

Malgré ces corrections, les modifications sont toujours perdues. Les logs montrent :

1. `[DxEditCell] fieldValue changed for criterion` - La modification EST détectée
2. `[handleRowClickAway] saveEditingRowAndClose called` - Le save est appelé
3. `[handleRowClickAway] Comparing records` - Mais la comparaison montre les mêmes valeurs

### Hypothèses à vérifier

1. **Timing** : Le store.get(formAtom) est appelé AVANT que la valeur soit propagée
2. **Mauvais formAtom** : Le formAtom passé n'est pas celui qui a reçu les modifications
3. **Mauvais store** : Le store passé n'est pas celui utilisé par DxEditCell
4. **Multiple ClickAway** : Il y a 7 appels de handleClickAway (plusieurs grilles O2M sur la page ?)

### Logs à analyser

Les logs JSON stringifiés permettront de voir :
- `initialCriterion` vs `currentCriterion` - Sont-ils identiques ou différents ?
- `initial` vs `current` (full JSON) - Quelle est la différence exacte ?

## Fichiers concernés

- `axelor-front/src/views/grid/dx-grid/DxGrid.tsx` - Composant principal
- `axelor-front/src/views/grid/dx-grid/DxGrid.hooks.ts` - Hooks (saveEditingRowAndClose)
- `axelor-front/src/views/grid/dx-grid/widgets/DxEditRow.tsx` - Ligne en édition
- `axelor-front/src/views/grid/dx-grid/widgets/DxEditCell.tsx` - Cellule en édition
- `axelor-front/src/views/grid/dx-grid/widgets/DxRow.tsx` - Hook useDxRow

## Différences DevExtreme v25 vs v22.2.15

| Aspect | v25 | v22.2.15 |
|--------|-----|----------|
| Rendu templates | Contexte React préservé | `createPortal()` casse le contexte |
| API editing | `editing.editRowKey` stable | Peut changer pendant l'édition |
| Remontage composants | Rare | Fréquent (pendant l'édition) |

## Prochaines étapes

1. Analyser les logs JSON pour voir si `currentRecord.criterion` contient la modification
2. Si non : tracer où la valeur est perdue (DxEditCell → formAtom → store.get)
3. Si oui mais identique à initial : vérifier `initialRecordRef` (est-il mis à jour par erreur ?)
