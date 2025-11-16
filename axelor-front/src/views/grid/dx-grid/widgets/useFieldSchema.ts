import { useMemo } from "react";
import { processView } from "@/views/form/builder/utils";
import type { Field, Schema } from "@/services/client/meta.types";

/**
 * Hook pour créer un Schema Axelor à partir d'un Field (vue XML) et FieldMeta (métadonnées).
 *
 * Utilise la fonction `processView()` d'Axelor qui :
 * - Merge les attributs par défaut depuis fieldMeta
 * - Détermine le widget approprié via getWidget()
 * - Ajoute le serverType via getFieldServerType()
 * - Traite les conditions (showIf, hideIf, readonlyIf)
 * - Active inGridEditor pour les widgets grid spécialisés
 *
 * @param field - Définition du champ depuis la vue XML
 * @param fieldMeta - Métadonnées du champ depuis le serveur
 * @param allFields - Tous les fields métadata (pour processView)
 * @returns Schema compatible avec FormWidget
 */
export function useFieldSchema(
  field: Field,
  fieldMeta: any,
  allFields: Record<string, any>
): Schema {
  return useMemo(() => {
    // Créer un schema minimal pour ce field
    const fieldSchema: Schema = {
      name: field.name,
      type: "field",
      title: field.title,
      placeholder: field.placeholder,
      readonly: field.readonly,
      required: field.required,
      hidden: field.hidden,
      widget: field.widget,

      // Active les widgets spécialisés grid (ex: TextEdit avec popup)
      inGridEditor: true,

      // Copier les triggers depuis le Field
      onChange: field.onChange,
      onSelect: field.onSelect,

      // Initialiser widgetAttrs comme objet vide pour éviter les erreurs
      // processView() va le remplir avec les bonnes valeurs
      widgetAttrs: {},
    };

    // Utiliser processView() d'Axelor pour enrichir le schema
    // processView() va :
    // - Merger defaultAttrs depuis fieldMeta
    // - Déterminer le widget avec getWidget()
    // - Ajouter serverType, etc.
    const processedSchema = processView(fieldSchema, allFields);

    // IMPORTANT: processView() ne copie pas certaines propriétés car elles ne sont pas dans DEFAULT_ATTRS
    // On doit les copier manuellement depuis fieldMeta

    // Pour les widgets Selection : copier selectionList
    if (fieldMeta?.selectionList) {
      processedSchema.selectionList = fieldMeta.selectionList;
    }

    // Pour les widgets ManyToOne/OneToMany/ManyToMany : copier target, targetName, targetSearch
    if (fieldMeta?.target) {
      processedSchema.target = fieldMeta.target;
    }
    if (fieldMeta?.targetName) {
      processedSchema.targetName = fieldMeta.targetName;
    }
    if (fieldMeta?.targetSearch) {
      processedSchema.targetSearch = fieldMeta.targetSearch;
    }

    // Cacher le titre dans les cellules de la grille (le titre de colonne suffit)
    processedSchema.showTitle = false;

    return processedSchema;
  }, [field, fieldMeta, allFields]);
}