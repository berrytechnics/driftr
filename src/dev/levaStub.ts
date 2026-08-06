/** Production stub — extracts schema defaults so leva never ships in the bundle. */

type SchemaValue =
  | number
  | string
  | boolean
  | { value: number | string | boolean; [key: string]: unknown }
  | { type: string; [key: string]: unknown }

function isSpecialInput(entry: unknown): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'type' in entry &&
    typeof (entry as { type: unknown }).type === 'string' &&
    !('value' in entry)
  )
}

function isFolderInput(entry: unknown): entry is {
  type: string
  schema: Record<string, SchemaValue>
} {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'type' in entry &&
    (entry as { type: unknown }).type === 'FOLDER' &&
    'schema' in entry &&
    typeof (entry as { schema: unknown }).schema === 'object' &&
    (entry as { schema: unknown }).schema !== null
  )
}

function defaultsFromSchema<T extends Record<string, SchemaValue>>(schema: T) {
  const result = {} as Record<string, unknown>
  for (const key of Object.keys(schema) as (keyof T)[]) {
    const entry = schema[key]
    if (isFolderInput(entry)) {
      Object.assign(result, defaultsFromSchema(entry.schema))
      continue
    }
    if (isSpecialInput(entry)) continue
    result[key as string] =
      typeof entry === 'object' && entry !== null && 'value' in entry
        ? entry.value
        : entry
  }
  return result as {
    [K in keyof T]: T[K] extends { value: infer V } ? V : T[K]
  }
}

export function button(
  onClick: (get: (path: string) => unknown) => void,
  settings: { disabled?: boolean } = {},
) {
  return { type: 'BUTTON', onClick, settings }
}

export function folder<T extends Record<string, SchemaValue>>(
  schema: T,
  settings: Record<string, unknown> = {},
) {
  return { type: 'FOLDER' as const, schema, settings }
}

export function useControls<T extends Record<string, SchemaValue>>(
  _folder: string,
  schema: T,
  _deps?: unknown[],
) {
  return defaultsFromSchema(schema)
}

export function Leva(_props: Record<string, unknown>) {
  return null
}
