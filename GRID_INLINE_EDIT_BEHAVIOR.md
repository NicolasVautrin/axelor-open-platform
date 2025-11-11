# Comportement d'édition inline/batch - Grille Axelor Standard

## Vue d'ensemble

La grille Axelor standard gère l'édition inline avec un modèle **batch/accumulatif**.

## Architecture d'édition

### 1. État d'édition

- `editRow: [rowIndex, cellIndex]` ou `null`
- Défini dans `GridState` (types.ts)

### 2. Flux quand on clique sur une ligne

**Étape 1:** Utilisateur clique sur une ligne sans Ctrl/Shift
**Étape 2:** handleRowClick est appelé (grid.tsx:343-391)
**Étape 3:** Si editable=true, appel `onRecordEdit(row, rowIndex, cell, cellIndex)`

- Si retour === null → annule transition, juste sélectionne
- Sinon → Permet transition

**Étape 4:** Lance édition:
```
setState((draft) => {
  draft.editRow = [rowIndex, cellIndex];
})
```

### 3. Rendu en mode édition

Dans grid-body.tsx (lignes 152-164):
- Si editRow correspond à la ligne: 
  - Utilise `editRowRenderer` (formulaire personnalisé)
  - Utilise `editRowColumnRenderer` (champs)
  - Passe `onSave` et `onCancel`

### 4. Sauvegarde au changement de ligne

**CLEF:** Quand utilisateur clique sur AUTRE ligne:
1. handleRowClick est appelé MAIS editRow est déjà actif
2. `onRecordEdit` est appelé AVANT changement
3. Dans onRecordEdit, on peut appeler `onRecordSave`
4. Si sauvegarde OK → permet changement de ligne
5. Si sauvegarde KO → refuse changement (retour null)

### 5. Événements de cycle de vie

#### `onRecordEdit(row, rowIndex, cell, cellIndex)`
- Appelé AVANT d'éditer une ligne
- Appelé AUSSI quand on change de ligne (editable=true)
- Retour null = refuse, autre = accepte

#### `onRecordSave(record, recordIndex, columnIndex, dirty?, saveFromEdit?)`
- Appelé quand dirty=true et on quitte ligne
- saveFromEdit=true = changement de ligne
- Retour record = OK, null = erreur

#### `onRecordDiscard(record, recordIndex, columnIndex)`
- Appelé quand on appuie Escape
- Ou si dirty=false et on quitte

#### `onRecordAdd()`
- Appelé quand clic "Add new line"
- Ou après sauvegarde dernière ligne

## Code clés à référencer

| Fichier | Lignes | Description |
|---------|--------|-------------|
| grid.tsx | 365-391 | onRecordEdit appelé, editRow changé |
| grid.tsx | 858-900 | handleRecordSave - logique |
| grid-body.tsx | 152-164 | Rendu avec editRowRenderer |
| editable.tsx | 170-178 | Exemple handleRecordEdit |
| editable.tsx | 180-198 | Exemple handleRecordSave |

## Points critiques pour DxGrid

1. Appeler `onRecordEdit` au changement de ligne si editRow existe
2. Permettre au callback de refuser (retour null)
3. Appeler `onRecordSave` avec saveFromEdit=true
4. Respecter le retour de onRecordSave pour autoriser/refuser changement
