/**
 * Utilitaires pour calculer les décalages (offsets) des colonnes fixées.
 *
 * Quand on utilise dataRowRender, DevExtreme ne peut plus appliquer automatiquement
 * les styles pour les colonnes fixées. On doit calculer manuellement les offsets.
 */

/**
 * Calcule les décalages (offsets) pour les colonnes fixées.
 *
 * Pour les colonnes fixées à gauche, l'offset est la somme des largeurs des colonnes précédentes.
 * Pour les colonnes fixées à droite, l'offset est la somme des largeurs des colonnes suivantes.
 *
 * @param columns - Array de colonnes DevExtreme (rowInfo.columns)
 * @returns Object avec leftOffsets et rightOffsets (Map dataField → offset en pixels)
 */
export function calculateFixedOffsets(columns: any[]): {
  leftOffsets: Map<string, number>;
  rightOffsets: Map<string, number>;
} {
  const leftOffsets = new Map<string, number>();
  const rightOffsets = new Map<string, number>();

  // Colonnes fixées à gauche (de gauche à droite)
  const fixedLeftColumns = columns.filter(
    (c) => c.fixed && c.fixedPosition === "left"
  );
  let currentLeftOffset = 0;
  fixedLeftColumns.forEach((col) => {
    const key = col.dataField || col.name || col.caption;
    leftOffsets.set(key, currentLeftOffset);
    currentLeftOffset += col.width || 0;
  });

  // Colonnes fixées à droite (de droite à gauche)
  const fixedRightColumns = columns.filter(
    (c) => c.fixed && c.fixedPosition === "right"
  );
  let currentRightOffset = 0;
  // Itérer en sens inverse pour calculer l'offset depuis le bord droit
  for (let i = fixedRightColumns.length - 1; i >= 0; i--) {
    const col = fixedRightColumns[i];
    const key = col.dataField || col.name || col.caption;
    rightOffsets.set(key, currentRightOffset);
    currentRightOffset += col.width || 0;
  }

  return { leftOffsets, rightOffsets };
}