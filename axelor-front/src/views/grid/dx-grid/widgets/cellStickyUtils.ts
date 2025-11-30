/**
 * Utilitaires pour gérer les colonnes et lignes sticky dans DevExtreme Grid.
 *
 * Quand on utilise dataRowRender, DevExtreme ne peut plus appliquer automatiquement
 * les styles pour les colonnes fixées. On doit calculer manuellement les offsets.
 */

/**
 * Vérifie si une colonne est une colonne expand (groupement)
 */
export function isExpandColumn(col: any): boolean {
  return col.command === "expand" || col.type === "groupExpand";
}

/**
 * Calcule les décalages (offsets) pour les colonnes fixées.
 *
 * Pour les colonnes fixées à gauche, l'offset est la somme des largeurs des colonnes précédentes.
 * Pour les colonnes fixées à droite, l'offset est la somme des largeurs des colonnes suivantes.
 *
 * L'ordre des colonnes sticky à gauche est :
 * 1. Colonnes expand (groupement) - générées par DevExtreme
 * 2. Colonnes stickyLeft ($$select, $$edit, colonnes utilisateur fixées)
 *
 * @param columns - Array de colonnes DevExtreme (rowInfo.columns)
 * @returns Object avec leftOffsets et rightOffsets (Map key → offset en pixels)
 */
export function calculateFixedOffsets(columns: any[]): {
  leftOffsets: Map<string, number>;
  rightOffsets: Map<string, number>;
} {
  const leftOffsets = new Map<string, number>();
  const rightOffsets = new Map<string, number>();

  let currentLeftOffset = 0;

  // Parcourir les colonnes dans l'ordre pour calculer les offsets cumulatifs
  columns.forEach((col, index) => {
    const isExpand = isExpandColumn(col);
    const isStickyLeft = col.stickyLeft || (col.fixed && col.fixedPosition === "left");

    if (isExpand || isStickyLeft) {
      const key = isExpand ? `expand_${index}` : (col.dataField || col.name || col.caption);
      leftOffsets.set(key, currentLeftOffset);
      const colWidth = typeof col.width === 'number' ? col.width : 30;
      currentLeftOffset += colWidth;
    }
  });

  // Colonnes fixées à droite (de droite à gauche)
  const fixedRightColumns = columns.filter(
    (c) => c.fixed && c.fixedPosition === "right"
  );
  let currentRightOffset = 0;
  for (let i = fixedRightColumns.length - 1; i >= 0; i--) {
    const col = fixedRightColumns[i];
    const key = col.dataField || col.name || col.caption;
    rightOffsets.set(key, currentRightOffset);
    currentRightOffset += col.width || 0;
  }

  return { leftOffsets, rightOffsets };
}

/**
 * Corrige les positions left des headers sticky quand il y a des colonnes expand.
 * Les colonnes expand sont à gauche, donc les colonnes select/edit doivent être décalées.
 *
 * @param gridElement - Element racine de la grille DevExtreme
 * @param visibleColumns - Colonnes visibles (gridInstance.getVisibleColumns())
 */
export function fixHeaderStickyPositions(gridElement: HTMLElement, visibleColumns: any[]): void {
  // Calculer la largeur totale des colonnes expand
  let expandColumnsWidth = 0;
  visibleColumns.forEach((col: any) => {
    if (isExpandColumn(col)) {
      expandColumnsWidth += typeof col.width === 'number' ? col.width : 30;
    }
  });

  if (expandColumnsWidth === 0) return;

  // Corriger les headers select/edit
  const headerRow = gridElement.querySelector('.dx-datagrid-headers .dx-header-row') as HTMLElement;
  const filterRow = gridElement.querySelector('.dx-datagrid-headers .dx-datagrid-filter-row') as HTMLElement;

  [headerRow, filterRow].forEach((row) => {
    if (!row) return;
    const cells = row.querySelectorAll('td') as NodeListOf<HTMLElement>;
    let currentOffset = expandColumnsWidth;

    cells.forEach((cell) => {
      // Ignorer les colonnes expand (déjà gérées par CSS)
      if (cell.classList.contains('dx-command-expand') || cell.classList.contains('dx-datagrid-group-space')) {
        return;
      }

      const style = window.getComputedStyle(cell);
      if (style.position === 'sticky') {
        cell.style.left = `${currentOffset}px`;
        currentOffset += cell.offsetWidth || 30;
      }
    });
  });
}

/**
 * Interface pour le cleanup du scroll listener
 */
export interface ScrollListenerCleanup {
  remove: () => void;
}

/**
 * Configure le scroll listener pour maintenir les group rows sticky.
 * Applique un transform translateX sur les cellules de groupe lors du scroll horizontal.
 *
 * @param gridElement - Element racine de la grille DevExtreme
 * @returns Objet avec méthode remove() pour cleanup, ou null si pas de scroll container
 */
export function setupGroupRowScrollListener(gridElement: HTMLElement): ScrollListenerCleanup | null {
  const scrollContainer = gridElement.querySelector('.dx-scrollable-container') as HTMLElement;
  if (!scrollContainer) return null;

  const handleScroll = () => {
    const scrollLeft = scrollContainer.scrollLeft;

    // Appliquer transform sur les .dx-group-cell
    const groupCells = gridElement.querySelectorAll('.dx-group-row .dx-group-cell') as NodeListOf<HTMLElement>;
    groupCells.forEach((cell) => {
      cell.style.transform = `translateX(${scrollLeft}px)`;
    });

    // Aussi sur la cellule expand des group rows
    const expandCells = gridElement.querySelectorAll('.dx-group-row td.dx-command-expand') as NodeListOf<HTMLElement>;
    expandCells.forEach((cell) => {
      cell.style.transform = `translateX(${scrollLeft}px)`;
    });
  };

  scrollContainer.addEventListener('scroll', handleScroll);

  // Appliquer immédiatement au cas où il y a déjà un scroll
  handleScroll();

  return {
    remove: () => scrollContainer.removeEventListener('scroll', handleScroll)
  };
}
