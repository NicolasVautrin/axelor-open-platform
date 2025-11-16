import { useCallback } from "react";
import { GridView } from "@/services/client/meta.types";
import { DataRecord } from "@/services/client/data.types";
import { getGridInstance } from "../dx-grid-utils";
import { DxEditRow } from "./DxEditRow";
import { DxDisplayRow } from "./DxDisplayRow";

interface UseDxRowParams {
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
}

/**
 * Hook pour rendre les lignes de la grille DevExtreme
 * Utilisé comme dataRowRender pour rendre un FormRenderer complet quand la ligne est en édition
 * IMPORTANT: dataRowRender reçoit rowInfo comme prop (voir DevExtreme docs)
 */
export function useDxRow({
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
      // Le formAtom est maintenant créé par DxEditRow via useFormHandlers()
      return (
        <DxEditRow
          key={rowKey}  // ✅ Clé stable pour éviter démontage/remontage lors des re-renders DevExtreme
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
  }, [view, fields, context, columnPropsMap, handleCellClick, dataGridRef, handleRowClickAway, onUpdate, actionExecutor, parentFormAtom, onEditRowFormAtomReady]);

  return DxRow;
}