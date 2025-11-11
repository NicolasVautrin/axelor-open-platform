import React from "react";
import { Box, Input } from "@axelor/ui";
import { MaterialIcon } from "@axelor/ui/icons/material-icon";
import { useAtomValue } from "jotai";

interface SelectCellProps {
  rowIndex: number;
  rowKey: any;
  isEditing: boolean;
  rowSelectionAtomFamily: typeof import('./selectionAtoms').rowSelectionAtomFamily;
  onToggleSelection: (rowKey: any) => void;
  onRevert: (e: any, rowKey: any) => void;
}

/**
 * Composant pour la cellule de sélection avec checkbox ou icône undo
 * Lit l'état de sélection depuis l'atom granulaire (atomFamily)
 * Seule cette cellule re-render quand son état de sélection change
 */
const SelectCell: React.FC<SelectCellProps> = ({
  rowIndex,
  rowKey,
  isEditing,
  rowSelectionAtomFamily,
  onToggleSelection,
  onRevert
}) => {
  // Lit l'état de sélection spécifique à cette ligne
  const isSelected = useAtomValue(rowSelectionAtomFamily(rowKey));

  // Si la ligne est en édition, afficher l'icône "undo"
  if (isEditing) {
    return (
      <Box
        d="inline-flex"
        onClick={(e: any) => onRevert(e, rowKey)}
        style={{ cursor: "pointer", justifyContent: "center", alignItems: "center", height: "100%" }}
      >
        <MaterialIcon icon="undo" />
      </Box>
    );
  }

  return (
    <Box d="inline-flex" style={{ justifyContent: "center", alignItems: "center", height: "100%" }}>
      <Input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelection(rowKey)}
        m={0}
        tabIndex={-1}
      />
    </Box>
  );
};

/**
 * Génère les props pour la colonne de sélection ($$select) DevExtreme
 *
 * Anti-flickering : Les callbacks sont passés via closure (référence stable)
 * et l'état granulaire est géré par atomFamily
 */
export function getSelectColumnProps(params: {
  rowSelectionAtomFamily: typeof import('./selectionAtoms').rowSelectionAtomFamily;
  onToggleSelection: (rowKey: any) => void;
  onRevert: (e: any, rowKey: any) => void;
}) {
  const { rowSelectionAtomFamily, onToggleSelection, onRevert } = params;

  return {
    dataField: "$$select",
    caption: "",
    width: 40,
    minWidth: 40,
    fixed: true,
    fixedPosition: "left" as const,
    alignment: "center" as const,
    allowSorting: false,
    allowFiltering: false,
    allowGrouping: false,
    allowHiding: false,
    allowEditing: false,
    cellRender: (cellData: any) => (
      <SelectCell
        rowIndex={cellData.rowIndex}
        rowKey={cellData.row?.key}
        isEditing={cellData.row?.isEditing ?? false}
        rowSelectionAtomFamily={rowSelectionAtomFamily}
        onToggleSelection={onToggleSelection}
        onRevert={onRevert}
      />
    ),
  };
}
