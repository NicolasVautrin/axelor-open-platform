// src/views/grid/dx-grid/selectionAtoms.ts
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

// Atom global qui contient l'ensemble des clés (rowKey) des lignes sélectionnées.
// Utilisation d'un Set pour des opérations d'ajout/suppression/vérification efficaces (O(1) en moyenne).
export const selectedRowKeysSetAtom = atom<Set<any>>(new Set());

// Atom family pour l'état de sélection individuel de chaque ligne.
// Chaque instance de cet atom family (paramétrée par rowKey) est un atom dérivé.
// Il lit son état à partir de 'selectedRowKeysSetAtom' et met à jour 'selectedRowKeysSetAtom' lors d'un changement.
export const rowSelectionAtomFamily = atomFamily((rowKey: any) =>
  atom(
    // Getter: Vérifie si cette rowKey spécifique est présente dans l'ensemble global des sélectionnées.
    (get) => get(selectedRowKeysSetAtom).has(rowKey),
    // Setter: Met à jour l'ensemble global des sélectionnées.
    (get, set, newValue?: boolean) => {
      const prevSelectedSet = get(selectedRowKeysSetAtom);
      const newSelectedSet = new Set(prevSelectedSet);

      const isCurrentlySelected = prevSelectedSet.has(rowKey);
      // Si newValue n'est pas fourni, on bascule l'état actuel.
      const resolvedNewValue = newValue !== undefined ? newValue : !isCurrentlySelected;

      if (resolvedNewValue && !isCurrentlySelected) {
        newSelectedSet.add(rowKey);
      } else if (!resolvedNewValue && isCurrentlySelected) {
        newSelectedSet.delete(rowKey);
      }
      set(selectedRowKeysSetAtom, newSelectedSet);
    }
  )
);

// Atom dérivé pour obtenir la liste des clés des lignes sélectionnées sous forme de tableau.
// Utile pour les consommateurs externes qui ont besoin de la liste complète (ex: actions de suppression/export).
export const selectedRowsListAtom = atom(
  (get) => Array.from(get(selectedRowKeysSetAtom))
);

// Atom dérivé pour désélectionner toutes les lignes.
export const clearAllSelectionsAtom = atom(
  null, // Atom setter-only, pas de valeur initiale
  (get, set) => {
    set(selectedRowKeysSetAtom, new Set());
  }
);

// Atom dérivé pour toggle la sélection d'une ligne spécifique de manière impérative.
// Utilisation: const toggle = useSetAtom(toggleRowSelectionAtom); toggle(rowKey);
export const toggleRowSelectionAtom = atom(
  null, // Atom setter-only, pas de valeur initiale
  (get, set, rowKey: any) => {
    const prevSelectedSet = get(selectedRowKeysSetAtom);
    const newSelectedSet = new Set(prevSelectedSet);

    if (prevSelectedSet.has(rowKey)) {
      newSelectedSet.delete(rowKey);
    } else {
      newSelectedSet.add(rowKey);
    }

    set(selectedRowKeysSetAtom, newSelectedSet);
  }
);
