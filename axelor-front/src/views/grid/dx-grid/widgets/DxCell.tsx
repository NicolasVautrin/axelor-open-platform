import React, { useMemo, CSSProperties } from "react";

interface DxCellProps {
  /** Configuration de la colonne DevExtreme */
  col: any;
  /** Contenu de la cellule */
  children?: React.ReactNode;
  /** Décalage pour les colonnes fixées à gauche (calculé par le parent) */
  leftOffset?: number;
  /** Décalage pour les colonnes fixées à droite (calculé par le parent) */
  rightOffset?: number;
  /** Classes CSS supplémentaires */
  className?: string;
  /** Styles supplémentaires */
  style?: CSSProperties;
}

/**
 * Composant pour rendre une cellule <td> dans une ligne DevExtreme avec support du column fixing.
 *
 * Gère automatiquement :
 * - Classes CSS pour les colonnes fixées (dx-col-fixed, dx-col-fixed-left/right)
 * - Styles inline pour position: sticky et left/right offset
 * - Largeur et padding de la cellule
 *
 * Utilisé par DxEditRow et DxDisplayRow pour avoir un rendu cohérent.
 */
export const DxCell = React.memo<DxCellProps>(
  function DxCell({ col, children, leftOffset, rightOffset, className: extraClassName, style: extraStyle }) {
    // Calculer les classes CSS
    const className = useMemo(() => {
      const classes = ["dx-cell"];

      if (col.fixed) {
        classes.push("dx-col-fixed");
        if (col.fixedPosition === "left") {
          classes.push("dx-col-fixed-left");
        } else if (col.fixedPosition === "right") {
          classes.push("dx-col-fixed-right");
        }
      }

      if (extraClassName) {
        classes.push(extraClassName);
      }

      return classes.join(" ");
    }, [col.fixed, col.fixedPosition, extraClassName]);

    // Calculer les styles inline
    const style = useMemo(() => {
      const baseStyle: CSSProperties = {
        width: col.width || "auto",
        minWidth: col.minWidth || "50px",
        maxWidth: col.width || "none",
        padding: "4px 8px",
        overflow: "hidden",
        ...extraStyle,
      };

      if (col.fixed) {
        baseStyle.position = "sticky";
        baseStyle.zIndex = 100;
        baseStyle.backgroundColor = "inherit"; // Éviter la transparence lors du scroll

        if (col.fixedPosition === "left" && leftOffset !== undefined) {
          baseStyle.left = leftOffset;
        } else if (col.fixedPosition === "right" && rightOffset !== undefined) {
          baseStyle.right = rightOffset;
        }
      }

      return baseStyle;
    }, [col.width, col.minWidth, col.fixed, col.fixedPosition, leftOffset, rightOffset, extraStyle]);

    return (
      <td className={className} style={style}>
        {children}
      </td>
    );
  },
  // Comparaison personnalisée pour éviter re-renders inutiles
  (prev, next) => {
    return (
      prev.col === next.col &&
      prev.children === next.children &&
      prev.leftOffset === next.leftOffset &&
      prev.rightOffset === next.rightOffset &&
      prev.className === next.className &&
      prev.style === next.style
    );
  }
);