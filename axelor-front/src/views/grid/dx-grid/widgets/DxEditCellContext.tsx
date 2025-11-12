import React, { createContext, useContext, useRef } from "react";
import type { PrimitiveAtom } from "jotai";

/**
 * Cache des formAtom par rowKey pour éviter de recréer le formAtom à chaque render.
 *
 * PROBLÈME RÉSOLU : Boucle infinie causée par la recréation du formAtom.
 *
 * Sans cache :
 * 1. DxEditCell render → useFormHandlers() crée nouveau formAtom
 * 2. selectAtom(formAtom, ...) change → fieldValue recalculé
 * 3. useEffect détecte changement → setValue()
 * 4. DevExtreme re-render → retour à 1 → BOUCLE INFINIE
 *
 * Avec cache :
 * 1. DxEditCell render → récupère formAtom du cache (même instance)
 * 2. selectAtom(formAtom, ...) stable → fieldValue stable
 * 3. useEffect ne se déclenche que si vraie modification
 *
 * @see DxEditCell.tsx
 */

interface FormAtomCache {
  get: (rowKey: any) => PrimitiveAtom<any> | undefined;
  set: (rowKey: any, formAtom: PrimitiveAtom<any>) => void;
  clear: () => void;
}

const DxEditCellContext = createContext<FormAtomCache | null>(null);

export function DxEditCellProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef(new Map<any, PrimitiveAtom<any>>());

  const cache: FormAtomCache = {
    get: (rowKey: any) => cacheRef.current.get(rowKey),
    set: (rowKey: any, formAtom: PrimitiveAtom<any>) => {
      cacheRef.current.set(rowKey, formAtom);
    },
    clear: () => {
      cacheRef.current.clear();
    },
  };

  return (
    <DxEditCellContext.Provider value={cache}>
      {children}
    </DxEditCellContext.Provider>
  );
}

export function useDxEditCellCache(): FormAtomCache {
  const cache = useContext(DxEditCellContext);
  if (!cache) {
    throw new Error("useDxEditCellCache must be used within DxEditCellProvider");
  }
  return cache;
}