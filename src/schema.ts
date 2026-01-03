import schema from "./assets/schema.json";

export type Schema = typeof schema;
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Definitions = Schema["$defs"];
export type Type = keyof Definitions;

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
    music_dir: { default: "$HOME/Music" }
  },
};

export const commonModuleProperties = Object.keys(
  schema.$defs["CommonConfig"].properties,
);

export function resolveReference(ref: string): ResolvedReference {
  const typeName = ref.split("/")[2] as Type;
  const definition = schema.$defs[typeName] as Definition;

  return {
    typeName,
    definition,
  };
}