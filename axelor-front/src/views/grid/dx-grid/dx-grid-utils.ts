import getObjValue from "lodash/get";
import { Field, Property } from "@/services/client/meta.types";
import { DataRecord } from "@/services/client/data.types";
import { getFieldValue } from "@/utils/data-record";
import format from "@/utils/format";
import { toKebabCase } from "@/utils/names";

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

  const value = getFieldValue(record, field);

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
