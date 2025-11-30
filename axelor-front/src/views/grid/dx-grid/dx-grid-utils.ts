import getObjValue from "lodash/get";
import { Field, Property } from "@/services/client/meta.types";
import { DataRecord } from "@/services/client/data.types";
import { getFieldValue } from "@/utils/data-record";
import format from "@/utils/format";
import { toKebabCase } from "@/utils/names";
import React, { type RefObject } from "react";
import { DataGrid } from "devextreme-react/data-grid";
import isEqual from "lodash/isEqual";

/**
 * Génère des IDs négatifs pour les nouvelles lignes non sauvegardées
 *
 * Compatible avec le système Axelor qui utilise nextId() pour créer des IDs temporaires
 * Les IDs négatifs (-1, -2, -3...) permettent de distinguer les nouvelles lignes
 * des lignes existantes (IDs positifs) et évitent que DevExtreme génère ses propres
 * clés temporaires (_DX_KEY_...)
 *
 * @returns Un ID négatif incrémental (-1, puis -2, puis -3, etc.)
 */
export const nextId = (() => {
  let id = 0;
  return () => --id;
})();

/**
 * Vérifie si un record est une nouvelle ligne non sauvegardée
 *
 * @param record - Le DataRecord à vérifier
 * @returns true si c'est une nouvelle ligne (ID négatif ou absent)
 */
export function isNewRecord(record: DataRecord): boolean {
  return !record?.id || record.id < 0;
}

/**
 * Helper pour accéder à l'instance DevExtreme DataGrid
 *
 * Gère le fait que `.instance` peut être soit une fonction soit un getter
 * selon la version de DevExtreme React et le contexte d'exécution
 */
export function getGridInstance(dataGridRef: RefObject<React.ElementRef<typeof DataGrid> | null>): any | null {
  const gridRef = dataGridRef.current;
  if (!gridRef) {
    return null;
  }

  // .instance est un getter dans DevExtreme v22
  const gridInstance = gridRef.instance;

  return gridInstance || null;
}

/**
 * Récupère un élément cellule en accédant directement au DOM.
 *
 * Note: La méthode native gridInstance.getCellElement() ne fonctionne pas
 * avec dataRowRender car DevExtreme wrappe chaque ligne dans son propre tbody.
 *
 * @param dataGridRef - Référence au composant DataGrid
 * @param rowIndex - Index de la ligne (0-based)
 * @param columnIndex - Index de la colonne (0-based)
 * @returns L'élément HTMLTableCellElement ou null si non trouvé
 */
export function getCellElement(
  dataGridRef: RefObject<React.ElementRef<typeof DataGrid> | null>,
  rowIndex: number,
  columnIndex: number
): HTMLTableCellElement | null {
  const gridInstance = getGridInstance(dataGridRef);
  if (!gridInstance) {
    console.warn('[getCellElement] No grid instance');
    return null;
  }

  const gridElement = gridInstance.element();

  // ✅ FIX: Avec dataRowRender, CHAQUE ligne est dans son propre tbody.dx-data-row
  // Donc on doit sélectionner TOUS les tbody, pas juste le premier
  const allTbodies = gridElement?.querySelectorAll('tbody.dx-data-row');

  if (!allTbodies || allTbodies.length === 0) {
    console.warn('[getCellElement] No tbody.dx-data-row found');
    return null;
  }

  // Récupérer le tbody à l'index rowIndex
  const targetTbody = allTbodies[rowIndex] as HTMLElement;

  if (!targetTbody) {
    console.warn('[getCellElement] tbody not found at rowIndex:', rowIndex, 'total tbodies:', allTbodies.length);
    return null;
  }

  // Récupérer le TR à l'intérieur de ce tbody (il n'y en a qu'un avec dataRowRender)
  const tr = targetTbody.querySelector('tr.dx-data-row') as HTMLElement;

  if (!tr) {
    console.warn('[getCellElement] TR not found in tbody at rowIndex:', rowIndex);
    return null;
  }

  // Récupérer la cellule à l'index columnIndex
  const cell = tr.children[columnIndex] as HTMLTableCellElement;

  if (!cell || cell.tagName !== 'TD') {
    console.warn('[getCellElement] TD not found at columnIndex:', columnIndex);
    return null;
  }

  return cell;
}

/**
 * Extrait la valeur d'affichage pour une cellule (gère les M2O avec targetName)
 *
 * Basé sur getFieldSortValue de grid/builder/utils.ts
 */
export function getDxCellValue(
  record: DataRecord,
  field: Field,
  fieldMeta: Property | undefined
): any {
  const name = field.name;

  // Valeur traduite prioritaire
  if (record?.[`$t:${name}`]) {
    return record[`$t:${name}`];
  }

  // Pour les M2O : vérifier d'abord la clé plate field.targetName
  const isM2O =
    fieldMeta?.type === "MANY_TO_ONE" ||
    fieldMeta?.type === "ONE_TO_ONE";

  if (isM2O && fieldMeta?.targetName) {
    const flatKey = `${name}.${fieldMeta.targetName}`;
    if (record[flatKey] !== undefined) {
      return record[flatKey];
    }
  }

  let value = getFieldValue(record, field);

  // Pour les collections (O2M, M2M) : afficher le nombre d'éléments
  if (Array.isArray(value)) {
    return value.length;
  }

  // Pour les M2O : afficher le targetName (nameColumn) depuis l'objet
  if (value && typeof value === "object") {
    const targetName = fieldMeta?.targetName || field.targetName || "id";
    return (
      getObjValue(value, `$t:${targetName}`) ||
      getObjValue(value, targetName)
    );
  }

  // Appliquer la valeur par défaut si la valeur est null/undefined
  // Compatible avec le mode remote (champs plats) et local (objets)
  if (value === null || value === undefined) {
    const defaultValue = fieldMeta?.defaultValue !== undefined
      ? fieldMeta.defaultValue
      : field.defaultValue;

    if (defaultValue !== undefined) {
      value = defaultValue;
    }
  }

  return value;
}

/**
 * Formatte la valeur pour l'affichage (utilise le système de format Axelor)
 */
export function formatDxCellValue(
  value: any,
  field: Field,
  fieldMeta: Property | undefined,
  record: DataRecord
): string {
  return format(value, {
    props: { ...fieldMeta, ...field } as any,
    context: record,
  });
}

/**
 * Détermine le widget effectif pour un field
 *
 * Basé sur getWidget de grid/builder/utils.ts
 */
export function getEffectiveWidget(
  field: Field,
  fieldMeta: Property | undefined
): string {
  let widget = field.widget;

  // Utiliser le serverType si pas de widget explicite
  if (!widget || !isValidWidget(widget)) {
    widget = fieldMeta?.type || field.serverType;
  }

  // Cas spécial : champs image
  if (!field.widget && fieldMeta?.image) {
    widget = "image";
  }

  return toKebabCase(widget || "string");
}

/**
 * Vérifie si un widget est valide
 */
function isValidWidget(widget?: string): boolean {
  if (!widget) return false;

  const validWidgets = [
    "string", "text", "integer", "decimal", "boolean",
    "date", "datetime", "time",
    "many-to-one", "one-to-many", "many-to-many", "one-to-one",
    "selection", "multi-select",
    "image", "binary",
    "email", "url", "phone",
    "password", "enum",
    "ref-text", "ref-select",
    "tag-select", "binary-link",
  ];

  return validWidgets.includes(toKebabCase(widget));
}

/**
 * Mapper les types Axelor vers DevExtreme
 */
export function mapAxelorTypeToDevExtreme(
  widget: string,
  fieldMeta?: Property
): "string" | "number" | "date" | "boolean" | "datetime" | "object" {
  const widgetLower = widget.toLowerCase();

  // Types numériques
  if (
    widgetLower.includes("integer") ||
    widgetLower.includes("long") ||
    widgetLower === "int"
  ) {
    return "number";
  }

  if (
    widgetLower.includes("decimal") ||
    widgetLower.includes("double") ||
    widgetLower === "float"
  ) {
    return "number";
  }

  // Types de date
  if (widgetLower === "date") {
    return "date";
  }

  if (widgetLower === "datetime" || widgetLower === "time") {
    return "datetime";
  }

  // Boolean
  if (widgetLower === "boolean") {
    return "boolean";
  }

  // Relations (affichées comme string via targetName)
  if (
    widgetLower.includes("many-to-one") ||
    widgetLower.includes("one-to-one") ||
    widgetLower === "many_to_one" ||
    widgetLower === "one_to_one"
  ) {
    return "string";
  }

  // Collections (affichées comme nombre)
  if (
    widgetLower.includes("one-to-many") ||
    widgetLower.includes("many-to-many") ||
    widgetLower === "one_to_many" ||
    widgetLower === "many_to_many"
  ) {
    return "number";
  }

  // Défaut : string
  return "string";
}

/**
 * Récupère les champs à fetcher pour une colonne (inclut targetName pour M2O)
 *
 * Basé sur getGridColumnNames de grid/builder/scope.tsx
 */
export function getFieldsToFetch(
  field: Field,
  fieldMeta: Property | undefined
): string[] {
  const fields: string[] = [field.name];

  // Pour les M2O : ajouter field.targetName
  const isM2O =
    fieldMeta?.type === "MANY_TO_ONE" ||
    fieldMeta?.type === "ONE_TO_ONE" ||
    field.serverType === "MANY_TO_ONE" ||
    field.serverType === "ONE_TO_ONE";

  if (isM2O && fieldMeta?.targetName && fieldMeta.targetName !== "id") {
    fields.push(`${field.name}.${fieldMeta.targetName}`);
  }

  // Pour les M2O avec colorField
  if (isM2O && (fieldMeta as any)?.colorField) {
    fields.push(`${field.name}.${(fieldMeta as any).colorField}`);
  }

  return fields;
}

/**
 * Options pour saveEditingRowFormAtom
 */
export interface SaveFormAtomOptions {
  /** Instance DevExtreme DataGrid */
  gridInstance: any;
  /** FormAtom contenant les données modifiées */
  formAtom: any;
  /** Store Jotai pour lire le formAtom */
  store: any;
  /** Record initial pour comparer les modifications */
  initialRecord: DataRecord | null;
  /** Si c'est une nouvelle ligne (insert) vs existante (update) */
  isNewRow: boolean;
  /** Mode local (O2M) vs distant (standalone) */
  isLocalMode: boolean;
  /** Callback pour sauvegarder en mode local (update) */
  localOnUpdate?: (record: DataRecord) => Promise<any>;
  /** Callback pour sauvegarder en mode local (insert) */
  localOnSave?: (record: DataRecord) => Promise<any>;
  /** Si true, appelle cancelEditData() après save */
  closeAfterSave?: boolean;
  /** Si true, appelle dataSource.reload() après save (mode standalone) */
  reloadAfterSave?: boolean;
  /** Préfixe pour les logs */
  logPrefix?: string;
  /** Callback de validation (pattern Axelor) - retourne les erreurs ou undefined si valide */
  getErrors?: (formState?: any) => any;
  /** Callback pour afficher les erreurs de validation */
  showErrors?: (errors: any) => void;
}

/**
 * Résultat de saveEditingRowFormAtom
 */
export interface SaveFormAtomResult {
  /** Si la sauvegarde a réussi (ou rien à sauvegarder) */
  success: boolean;
  /** Si des modifications ont été détectées */
  hasChanges: boolean;
  /** Le record actuel (modifié) */
  currentRecord?: DataRecord;
  /** Si la validation a échoué (erreurs Axelor) */
  validationFailed?: boolean;
}

/**
 * Sauvegarde les données d'une ligne en édition via le formAtom.
 *
 * Fonction utilitaire factorisant la logique commune entre :
 * - saveEditDataIfDirty() : switch de ligne
 * - saveEditingRowAndClose() : clickAway et Enter
 *
 * @param options - Options de sauvegarde
 * @returns Résultat de la sauvegarde
 */
export async function saveEditingRowFormAtom(options: SaveFormAtomOptions): Promise<SaveFormAtomResult> {
  const {
    gridInstance,
    formAtom,
    store,
    initialRecord,
    isNewRow,
    isLocalMode,
    localOnUpdate,
    localOnSave,
    closeAfterSave = false,
    reloadAfterSave = false,
    logPrefix = '[saveFormAtom]',
    getErrors,
    showErrors,
  } = options;

  // Pas de formAtom = pas en édition = succès
  if (!formAtom || !initialRecord) {
    return { success: true, hasChanges: false };
  }

  // 1. Blur-focus l'input actif pour finaliser la valeur (pattern Axelor)
  const activeElement = document.activeElement as HTMLElement;
  if (activeElement && activeElement.blur) {
    activeElement.blur();
    activeElement.focus?.();
    // Attendre que les handlers onBlur/onChange se terminent
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // 2. Lire le formAtom pour obtenir les valeurs modifiées
  const formState = store.get(formAtom) as any;
  const currentRecord = formState?.record;

  if (!currentRecord) {
    return { success: true, hasChanges: false };
  }

  // 3. Valider les champs required AVANT de sauvegarder (pattern Axelor)
  if (getErrors) {
    const errors = getErrors(formState);
    if (errors) {
      if (showErrors) {
        showErrors(errors);
      }
      // Ne pas fermer la ligne - garder le mode édition
      return { success: false, hasChanges: false, currentRecord, validationFailed: true };
    }
  }

  // 4. Comparer avec le record original
  const hasChanges = !isEqual(initialRecord, currentRecord);

  if (!hasChanges && !isNewRow) {
    // Pas de modifications = succès, fermer si demandé
    if (closeAfterSave && gridInstance) {
      await gridInstance.cancelEditData();
    }
    return { success: true, hasChanges: false, currentRecord };
  }

  // 5. Sauvegarder selon le mode
  try {
    if (isLocalMode) {
      // Mode O2M: utiliser les callbacks locaux
      if (isNewRow && localOnSave) {
        await localOnSave(currentRecord);
      } else if (!isNewRow && localOnUpdate) {
        await localOnUpdate(currentRecord);
      }
    } else {
      // Mode standalone: utiliser le CustomStore directement
      const dataSource = gridInstance?.getDataSource();
      const customStore = dataSource?.store();
      if (customStore) {
        if (isNewRow) {
          await customStore.insert(currentRecord);
        } else {
          await customStore.update(currentRecord.id, currentRecord);
        }
        // Reload pour rafraîchir l'affichage avec les nouvelles données du serveur
        if (reloadAfterSave) {
          await dataSource.reload();
        }
      }
    }

    // 6. Fermer la ligne si demandé
    if (closeAfterSave && gridInstance) {
      await gridInstance.cancelEditData();
    }

    return { success: true, hasChanges: true, currentRecord };
  } catch (error) {
    console.error(`${logPrefix} Save failed:`, error);
    return { success: false, hasChanges: true, currentRecord };
  }
}
