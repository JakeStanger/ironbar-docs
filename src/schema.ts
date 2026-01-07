export type Schema = Definition &
  (
    NewSchema | OldSchema
  );

export interface NewSchema {
  $defs: Record<string, Definition>;
}

export interface OldSchema {
  definitions: Record<string, Definition>;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Type = string;

export interface Definition {
  description: string;
  type: string;
  properties: Record<string, Property>;
  enum?: string[];
  anyOf?: Property[];
  oneOf?: Property[];
  required?: string[];
}

export interface Property {
  $ref?: string;
  description?: string;
  type?: string | string[];
  default?: JsonValue;
  anyOf?: Property[];
  items?: { $ref: string };
  const?: JsonValue;
}

export interface ResolvedReference {
  typeName: Type;
  definition: Definition;
}

export const aliases: Record<string, Type> = {
  SysinfoModule: "SysInfoModule",
  "Sys-InfoModule": "SysInfoModule",
  "Network-ManagerModule": "NetworkManagerModule",
};

export const baseOverrides: Partial<Definition> = {
  properties: {
    locale: { default: "$LC_TIME | $LANG | 'POSIX'" },
    justify: { default: "'left'" },
    orientation: { default: "'horizontal'" },
    music_dir: { default: "$HOME/Music" },
  },
};

export function commonModuleProperties(schema: Schema) {
  return Object.keys(definitions(schema)["CommonConfig"]?.properties ?? {});
}

export function definitions(schema: Schema): Record<string, Definition> {
  if (isNewSchema(schema)) return schema.$defs;
  else return schema.definitions;
}

export function resolveReference(
  schema: Schema,
  ref: string,
): ResolvedReference {
  const typeName = ref.split("/")[2] as Type;
  const definition = definitions(schema)[typeName] as Definition;

  return {
    typeName,
    definition,
  };
}

function isNewSchema(schema: Schema): schema is Definition & NewSchema {
  return !!(schema as NewSchema).$defs;
}