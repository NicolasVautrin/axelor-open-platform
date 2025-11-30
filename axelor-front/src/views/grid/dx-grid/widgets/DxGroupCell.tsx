import React, { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { i18n } from "@/services/client/i18n";

interface DxGroupCellProps {
  /** Données du groupe passées par DevExtreme */
  data: {
    key: any;
    items: any[] | null;
    count?: number;
    summary?: any[];
    collapsedItems?: any[];
    aggregates?: any[];
    isContinuationOnNextPage?: boolean;
    isContinuation?: boolean;
  };
  /** Colonne groupée */
  column: {
    caption?: string;
    dataField?: string;
    groupIndex?: number;
  };
  /** Valeur formatée du groupe */
  text?: string;
  /** Résumés du groupe */
  summaryItems?: any[];
  /** Callback pour dégrouper une colonne */
  onUngroup?: (dataField: string) => void;
  /** Élément DOM de la ligne (pour corriger les largeurs des cellules expand) */
  rowElement?: HTMLElement;
}

/**
 * Composant pour rendre une cellule de groupe DevExtreme avec menu contextuel.
 *
 * Affiche le label du groupe (ex: "Catégorie: Books") et propose
 * un menu contextuel (clic droit) avec l'option de dégrouper.
 */
export const DxGroupCell = React.memo(function DxGroupCell({
  data,
  column,
  text,
  summaryItems,
  onUngroup,
  rowElement,
}: DxGroupCellProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Fix: Corriger la largeur des cellules expand dans la ligne de groupe
  // Les cellules expand (command-expand) prennent trop de largeur car elles "mangent"
  // l'espace des colonnes système (select/edit) qui n'existent pas dans les group rows.
  // On force chaque cellule expand à 30px.
  useEffect(() => {
    if (!rowElement) return;

    // Trouver toutes les cellules expand dans la ligne (multi-groupement = plusieurs cellules)
    const expandCells = rowElement.querySelectorAll('td.dx-command-expand, td.dx-datagrid-group-space');
    expandCells.forEach((cell: Element) => {
      const td = cell as HTMLTableCellElement;
      td.style.width = '30px';
      td.style.minWidth = '30px';
      td.style.maxWidth = '30px';
    });
  }, [rowElement]);

  // Construire le texte du groupe comme DevExtreme le fait
  // Utiliser || pour gérer les chaînes vides (pas seulement null/undefined)
  const groupText = `${column?.caption || column?.dataField || ''}: ${text || ''}`;

  // Ajouter les résumés si présents
  let fullText = groupText;
  if (summaryItems && summaryItems.length > 0) {
    const summaryText = summaryItems
      .map((item: any) => `${item.columnCaption}: ${item.value}`)
      .join(', ');
    fullText += ` (${summaryText})`;
  }

  // Gérer le clic droit pour afficher le menu contextuel
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  // Dégrouper la colonne
  const handleUngroup = useCallback(() => {
    if (onUngroup && column?.dataField) {
      onUngroup(column.dataField);
    }
    setMenuPosition(null);
  }, [onUngroup, column?.dataField]);

  // Fermer le menu si on clique ailleurs
  React.useEffect(() => {
    if (menuPosition) {
      const handleClick = () => setMenuPosition(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuPosition]);

  // Menu contextuel rendu via Portal pour éviter les problèmes de DOM nesting
  const contextMenu = menuPosition && createPortal(
    <div
      className="dx-group-context-menu"
      style={{ top: menuPosition.y, left: menuPosition.x }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="dx-group-context-menu-item"
        onClick={handleUngroup}
        role="menuitem"
      >
        {i18n.get("Ungroup")}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <span
        onContextMenu={handleContextMenu}
        style={{ cursor: 'context-menu' }}
      >
        {fullText}
      </span>
      {contextMenu}
    </>
  );
});

/**
 * Factory pour créer un groupCellRender avec accès au callback onUngroup
 */
export function createGroupCellRender(onUngroup: (dataField: string) => void) {
  return function groupCellRender(cellData: any) {
    return (
      <DxGroupCell
        data={cellData.data}
        column={cellData.column}
        text={cellData.text || cellData.displayValue || String(cellData.value ?? '')}
        summaryItems={cellData.summaryItems}
        onUngroup={onUngroup}
      />
    );
  };
}
