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
 * Génère les props pour la colonne d'édition ($$edit) DevExtreme
 *
 * Affiche :
 * - Icône "edit" (crayon) ou "description" (fiche) pour les lignes normales
 * - L'icône change selon le mode readonly du GridContext
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

      // Utiliser EditIconCell pour avoir accès à GridContext
      return <EditIconCell cellData={cellData} onEdit={onEdit} />;
    },
  };
}

/**
 * Composant interne pour afficher l'icône d'édition avec accès au GridContext
 */
function EditIconCell({ cellData, onEdit }: { cellData: any; onEdit?: (data: any, readonly?: boolean) => void }) {
  const { readonly } = useGridContext();

  // Debug: Log readonly state
  console.log('[EditIconCell] readonly:', readonly, 'icon:', readonly ? "description" : "edit");

  // Affichage normal : icône edit (crayon) ou description (fiche) selon readonly
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
