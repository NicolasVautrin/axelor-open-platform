import { useCallback } from "react";
import { GridView } from "@/services/client/meta.types";
import { DataRecord } from "@/services/client/data.types";
import { getGridInstance } from "../dx-grid-utils";
import { DxEditRow } from "./DxEditRow";
import { DxDisplayRow } from "./DxDisplayRow";

interface UseDxRowParams {
  /** ✅ FIX MULTI-GRID: ID unique par grille pour filtrer les clickAway events */
  gridId: string;
  view: GridView;
  fields: Record<string, any>;
  context: any;
  columnPropsMap: Map<string, any>;
  handleCellClick: (e: any) => void;
  dataGridRef: React.RefObject<any>;
  handleRowClickAway: (event: Event) => void | Promise<void>;
  onUpdate?: (record: DataRecord) => Promise<DataRecord>;
  actionExecutor?: any;
  parentFormAtom?: any;
  onEditRowFormAtomReady?: (formAtom: any) => void;
  /** Ref pour tracker si on crée une NOUVELLE ligne (handleInitNewRow) vs édite une existante */
  isNewRowRef?: React.MutableRefObject<boolean>;
  /** ✅ FIX: Ref pour stocker le formAtom de la ligne en édition (évite perte lors remontage) */
  editingRowFormAtomRef?: React.MutableRefObject<any>;
  editingRowStoreRef?: React.MutableRefObject<any>;
  /** ✅ FIX STORE UNIQUE: Store partagé créé au niveau DxGrid, passé à tous les DxEditRow */
  editingRowStore?: any;
}

/**
 * Hook pour rendre les lignes de la grille DevExtreme
 * Utilisé comme dataRowRender pour rendre un FormRenderer complet quand la ligne est en édition
 * IMPORTANT: dataRowRender reçoit rowInfo comme prop (voir DevExtreme docs)
 */
export function useDxRow({
  gridId,
  view,
  fields,
  context,
  columnPropsMap,
  handleCellClick,
  dataGridRef,
  handleRowClickAway,
  onUpdate,
  actionExecutor,
  parentFormAtom,
  onEditRowFormAtomReady,
  isNewRowRef,
  editingRowFormAtomRef,
  editingRowStoreRef,
  editingRowStore,  // ✅ FIX STORE UNIQUE: Store partagé créé au niveau DxGrid
}: UseDxRowParams) {
  const DxRow = useCallback((rowInfo: any) => {
    // Si pas de data, ne rien rendre (peut arriver pour des lignes virtuelles ou group rows)
    if (!rowInfo || !rowInfo.data) {
      console.warn('[DxRow] No data provided, returning null');
      return null;
    }

    // Vérifier si cette ligne est en mode édition via le gridInstance
    const gridInstance = getGridInstance(dataGridRef);
    const editRowKey = gridInstance?.option('editing.editRowKey');
    const data = rowInfo.data;
    // ⚠️ rowInfo.key est undefined avec CustomStore/DataSource (keyExpr not applied warning)
    // Utiliser data.id à la place
    const rowKey = data.id;
    const isEditing = editRowKey !== undefined && editRowKey === rowKey;

    // Si la ligne est en mode édition, rendre avec DxEditRow (formulaire)
    if (isEditing) {
      // ✅ FIX RACE CONDITION: Passer le REF lui-même (pas sa valeur) pour mise à jour synchrone
      // DevExtreme monte plusieurs DxEditRow en parallèle, et chacun doit voir les updates des autres
      return (
        <DxEditRow
          key={rowKey}  // ✅ Clé stable pour éviter démontage/remontage lors des re-renders DevExtreme
          gridId={gridId}  // ✅ FIX MULTI-GRID: ID unique pour filtrer les clickAway events
          rowData={data}
          rowKey={rowKey}
          columns={rowInfo.columns}  // Utiliser rowInfo.columns (inclut les colonnes système)
          columnPropsMap={columnPropsMap}  // Map de props de colonnes pour lookup O(1)
          view={view}
          fields={fields}
          viewContext={context}
          onUpdate={onUpdate}
          onClickAway={handleRowClickAway}  // ClickAwayListener pour auto-save (comme Axelor)
          parentFormAtom={parentFormAtom}  // Parent formAtom pour triggers O2M (onChange/onNew)
          onFormAtomReady={onEditRowFormAtomReady}  // Callback pour récupérer le formAtom
          isNewRowRef={isNewRowRef}  // ✅ FIX DOUBLE TRIGGER: Passer le REF pour pouvoir le reset après exécution de onNew
          editingRowFormAtomRef={editingRowFormAtomRef}  // ✅ FIX RACE CONDITION: Passer le ref pour lecture/écriture synchrone
          existingStore={editingRowStore}  // ✅ FIX STORE UNIQUE: Utiliser le store partagé créé au niveau DxGrid
        />
      );
    }

    // Sinon, rendre avec DxDisplayRow (affichage normal)
    return (
      <DxDisplayRow
        row={{ data, key: rowKey }}
        columns={rowInfo.columns}  // Colonnes DevExtreme (inclut les colonnes système)
        columnPropsMap={columnPropsMap}  // Map de props de colonnes pour lookup O(1)
        view={view}
        fields={fields}
        viewContext={context}
        actionExecutor={actionExecutor}
        onUpdate={onUpdate}
        onCellClick={handleCellClick}  // Passer handleCellClick pour gérer le click
        dataGridRef={dataGridRef}  // Passer la ref pour construire l'objet event
      />
    );
  }, [gridId, view, fields, context, columnPropsMap, handleCellClick, dataGridRef, handleRowClickAway, onUpdate, actionExecutor, parentFormAtom, onEditRowFormAtomReady, isNewRowRef, editingRowFormAtomRef, editingRowStoreRef, editingRowStore]);

  return DxRow;
}