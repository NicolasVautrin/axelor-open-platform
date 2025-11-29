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
 * Note: On utilise stickyLeft/stickyRight (propriétés custom) au lieu de fixed (DevExtreme natif)
 * car fixed crée des tables séparées qui cassent l'alignement avec dataRowRender.
 *
 * Utilisé par DxEditRow et DxDisplayRow pour avoir un rendu cohérent.
 */
export const DxCell = React.memo<DxCellProps>(
  function DxCell({ col, children, leftOffset, rightOffset, className: extraClassName, style: extraStyle }) {
    // Détecter si la colonne est sticky (custom) ou fixed (DevExtreme natif)
    const isSticky = col.stickyLeft || col.stickyRight || col.fixed;
    const isStickyLeft = col.stickyLeft || (col.fixed && col.fixedPosition === "left");
    const isStickyRight = col.stickyRight || (col.fixed && col.fixedPosition === "right");

    // Calculer les classes CSS
    const className = useMemo(() => {
      const classes = ["dx-cell"];

      if (isSticky) {
        classes.push("dx-col-fixed");
        if (isStickyLeft) {
          classes.push("dx-col-fixed-left");
        } else if (isStickyRight) {
          classes.push("dx-col-fixed-right");
        }
      }

      if (extraClassName) {
        classes.push(extraClassName);
      }

      return classes.join(" ");
    }, [isSticky, isStickyLeft, isStickyRight, extraClassName]);

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

      if (isSticky) {
        baseStyle.position = "sticky";
        baseStyle.zIndex = 100;
        // Utiliser une couleur de fond opaque pour éviter la transparence lors du scroll
        // Note: Le dark mode sera géré via CSS, ici on met le fond light mode par défaut
        baseStyle.backgroundColor = "#fff";

        if (isStickyLeft && leftOffset !== undefined) {
          baseStyle.left = leftOffset;
        } else if (isStickyRight && rightOffset !== undefined) {
          baseStyle.right = rightOffset;
        }
      }

      return baseStyle;
    }, [col.width, col.minWidth, isSticky, isStickyLeft, isStickyRight, leftOffset, rightOffset, extraStyle]);

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