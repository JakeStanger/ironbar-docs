import type { Schema, Definition, Property, Type } from "./schema.ts";
import { commonModuleProperties, type JsonValue, resolveReference } from "./schema.ts";

export type HeaderDepth = 1 | 2 | 3 | 4 | 5 | 6;
export const MAX_HEADER_DEPTH = 6;

export function getDisplayType(
  schema: Schema,
  typeName: Type,
  property: Property | Definition,
): string {
  const type = getDisplayTypePart(schema, typeName, property);
  return Array.from(new Set(type.split(" | "))).join(" | ");
}

function getDisplayTypePart(
  schema: Schema,
  typeName: Type,
  property: Property | Definition,
): string {
  let type = property.type;

  if (Array.isArray(type)) {
    // handle option types
    if (type.length === 2 && type[1] === "null") type = type[0];
    else return type.join(" | ");
  }

  if (type === "object" && typeName) {
    return `Object (${typeName})`;
  }

  if (type === "array") {
    const childType = getDisplayTypePart(
      schema,
      typeName,
      (property as Property).items!,
    );
    return `Array (${childType})`;
  }

  if ((property as Property).$ref) {
    const ref = resolveReference(schema, (property as Property).$ref!);
    return getDisplayTypePart(schema, ref.typeName, ref.definition);
  }

  if (property.anyOf) {
    const values = property.anyOf.map((prop) =>
      getDisplayTypePart(schema, typeName, prop),
    );
    return Array.from(new Set(values)).join(" | ");
  }

  if ((property as Definition).enum) {
    return (property as Definition).enum!.map((val) => `'${val}'`).join(" | ");
  }

  if (type === "null" && typeName) {
    return typeName;
  }

  if ((property as Property).const) {
    return (property as Property).const!.toString();
  }

  if (typeof type === "string") {
    return type;
  }

  return "";
}

export function getDisplayDefault(value: JsonValue | undefined) {
  if (!value || value === "null" || value == null) {
    return "None";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

export function getModuleProperties(
  schema: Schema,
  definition: Definition,
  includeCommon = false,
): string[] {
  return Object.keys(definition.properties).filter((prop) => {
    if (includeCommon) return true;

    const matchesCommon = commonModuleProperties(schema).includes(prop);

    // some modules have properties which override the common properties -
    // we assume if their descriptions don't match, they're different.
    if (matchesCommon) {
      const property = definition.properties[prop];
      const commonProp = schema.$defs.CommonConfig.properties[
        prop as keyof typeof schema.$defs.CommonConfig.properties
      ] as Property;

      return property.description != commonProp.description;
    }

    return true;
  });
}

export function merge(
  obj1: Record<string, unknown>,
  obj2: Record<string, unknown>,
): Record<string, unknown> {
  for (let k in obj2) {
    const key = k as keyof Definition;

    if (obj2.hasOwnProperty(key)) {
      if (obj2[key] instanceof Object && obj1[key] instanceof Object) {
        obj1[key] = merge(
          obj1[key] as Record<string, unknown>,
          obj2[key] as Record<string, unknown>,
        );
      } else {
        obj1[key] = obj2[key];
      }
    }
  }
  return obj1;
}

/** Converts the first letter of a string to capital */
export function capitalise(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function removeCharAtIndex(string: string, index: number): string {
  return string.slice(0, index) + string.slice(index + 1);
}
