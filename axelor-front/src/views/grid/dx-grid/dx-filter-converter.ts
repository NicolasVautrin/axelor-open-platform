/**
 * Convertit les filtres DevExtreme vers le format Axelor (Criteria/Filter)
 *
 * DevExtreme utilise un format de filtre array-based :
 * ["field", "operator", "value"]
 * ou
 * [condition1, "and"/"or", condition2]
 *
 * Axelor utilise un format objet Criteria (pour AND/OR) et Filter (pour les conditions)
 */

import { Criteria, Filter } from "@/services/client/data.types";

/**
 * Convertit un filtre DevExtreme en Criteria/Filter Axelor
 *
 * @param dxFilter - Filtre DevExtreme (format array)
 * @returns Criteria Axelor ou null si pas de filtre
 */
export function convertDxFilterToAxelor(dxFilter: any): Criteria | Filter | null {
  if (!dxFilter || !Array.isArray(dxFilter)) {
    return null;
  }

  // Si c'est un filtre simple : ["fieldName", "operator", "value"]
  if (typeof dxFilter[0] === "string") {
    return convertSimpleFilter(dxFilter);
  }

  // Si c'est un filtre composé : [filter1, "and"/"or", filter2, ...]
  return convertCompoundFilter(dxFilter);
}

/**
 * Convertit un filtre simple DevExtreme → Filter Axelor
 */
function convertSimpleFilter(filter: any[]): Filter | null {
  const [fieldName, operator, value] = filter;

  // Mapper les opérateurs DevExtreme → Axelor
  const filterOperator = mapDxOperatorToAxelor(operator);
  if (!filterOperator) {
    console.warn(`[DxFilter] Unsupported operator: ${operator}`);
    return null;
  }

  // Construire le Filter Axelor
  const axelorFilter: Filter = {
    fieldName,
    operator: filterOperator as any, // Les opérateurs Axelor ne sont pas tous typés
    value,
  };

  return axelorFilter;
}

/**
 * Convertit un filtre composé (avec AND/OR) → Criteria Axelor
 */
function convertCompoundFilter(filter: any[]): Criteria | null {
  const criteria: Criteria = {
    operator: "and", // Par défaut
    criteria: [],
  };

  let currentOperator: "and" | "or" = "and";

  for (let i = 0; i < filter.length; i++) {
    const item = filter[i];

    if (typeof item === "string") {
      // C'est un opérateur logique : "and" ou "or"
      if (item === "and" || item === "or") {
        currentOperator = item;
      }
    } else if (Array.isArray(item)) {
      // C'est un sous-filtre (peut être Filter ou Criteria)
      const subFilter = convertDxFilterToAxelor(item);
      if (subFilter) {
        if (!criteria.criteria) {
          criteria.criteria = [];
        }
        criteria.criteria.push(subFilter as Filter | Criteria);
      }
    }
  }

  // Si tous les sous-filtres ont le même opérateur, on l'utilise
  if (currentOperator) {
    criteria.operator = currentOperator;
  }

  return criteria.criteria && criteria.criteria.length > 0 ? criteria : null;
}

/**
 * Mapper les opérateurs DevExtreme vers Axelor
 *
 * DevExtreme operators:
 * - "=", "<>", ">", ">=", "<", "<="
 * - "contains", "notcontains", "startswith", "endswith"
 * - "between"
 *
 * Axelor operators:
 * - "=", "!=", ">", ">=", "<", "<="
 * - "like", "notLike"
 * - "isNull", "notNull"
 * - "in", "notIn"
 * - "between"
 */
function mapDxOperatorToAxelor(dxOperator: string): string | null {
  const mapping: Record<string, string> = {
    // Opérateurs de comparaison
    "=": "=",
    "<>": "!=",
    ">": ">",
    ">=": ">=",
    "<": "<",
    "<=": "<=",

    // Opérateurs de texte
    "contains": "like",
    "notcontains": "notLike",
    "startswith": "like", // On ajoutera % à la fin
    "endswith": "like", // On ajoutera % au début

    // Opérateurs spéciaux
    "between": "between",
  };

  return mapping[dxOperator] || null;
}

/**
 * Convertit une valeur selon l'opérateur
 * (pour startswith/endswith, ajoute les % nécessaires)
 */
export function convertFilterValue(
  operator: string,
  value: any
): any {
  if (operator === "startswith" && typeof value === "string") {
    return `${value}%`;
  }

  if (operator === "endswith" && typeof value === "string") {
    return `%${value}`;
  }

  if (operator === "contains" && typeof value === "string") {
    return `%${value}%`;
  }

  if (operator === "notcontains" && typeof value === "string") {
    return `%${value}%`;
  }

  return value;
}
