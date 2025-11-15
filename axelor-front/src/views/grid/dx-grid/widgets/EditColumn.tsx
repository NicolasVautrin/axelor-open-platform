import React from "react";
import { Box } from "@axelor/ui";
import { MaterialIcon } from "@axelor/ui/icons/material-icon";
import type { GridView } from "@/services/client/meta.types";
import { useGridContext } from "@/views/grid/builder/scope";

interface EditColumnProps {
  view: GridView;
  onEdit?: (data: any, readonly?: boolean) => void;
}

/**
 * Composant pour afficher l'icône d'édition en mode affichage
 * Affiche icône "edit" (crayon) ou "description" (fiche) selon readonly
 */
function EditDisplayCell({ cellData, onEdit }: { cellData: any; onEdit?: (data: any, readonly?: boolean) => void }) {
  const { readonly } = useGridContext();

  // Icône selon le mode readonly
  const icon = readonly ? "description" : "edit";

  return (
    <Box
      d="inline-flex"
      onClick={() => onEdit?.(cellData.data, readonly)}
      style={{ cursor: "pointer", justifyContent: "center", alignItems: "center", height: "100%" }}
    >
      <MaterialIcon icon={icon} />
    </Box>
  );
}

/**
 * Composant pour la cellule d'édition en mode édition (vide)
 */
function EditEditCell() {
  return null;
}

/**
 * Génère les props pour la colonne d'édition ($$edit) DevExtreme
 *
 * Architecture harmonisée :
 * - cellRender : mode affichage (icône edit/description)
 * - editCellRender : mode édition (rien)
 */
export function getEditColumnProps({ view, onEdit }: EditColumnProps) {
  return {
    dataField: "$$edit",
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
    // Mode affichage : icône edit/description
    cellRender: (cellData: any) => (
      <EditDisplayCell cellData={cellData} onEdit={onEdit} />
    ),
    // Mode édition : rien
    editCellRender: (cellData: any) => (
      <EditEditCell />
    ),
  };
}
