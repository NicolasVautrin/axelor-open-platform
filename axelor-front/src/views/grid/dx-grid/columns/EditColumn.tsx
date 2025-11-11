import React from "react";
import { Box } from "@axelor/ui";
import { MaterialIcon } from "@axelor/ui/icons/material-icon";
import type { GridView } from "@/services/client/meta.types";

interface EditColumnProps {
  view: GridView;
  onEdit?: (data: any, readonly?: boolean) => void;
}

/**
 * Génère les props pour la colonne d'édition ($$edit) DevExtreme
 *
 * Affiche :
 * - Icône "edit" (crayon) ou "description" (lecture seule) pour les lignes normales
 * - Rien pour les lignes en édition ou modifiées
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
    cellRender: (cellData: any) => {
      // Si la ligne est en édition, ne rien afficher
      if (cellData.row?.isEditing) {
        return null;
      }

      // Affichage normal : icône edit/description
      const icon = view.canEdit === false ? "description" : "edit";
      return (
        <Box
          d="inline-flex"
          onClick={() => onEdit?.(cellData.data, view.canEdit === false)}
          style={{ cursor: "pointer", justifyContent: "center", alignItems: "center", height: "100%" }}
        >
          <MaterialIcon icon={icon} />
        </Box>
      );
    },
  };
}
