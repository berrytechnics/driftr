/** Production stub — extracts schema defaults so leva never ships in the bundle. */

type SchemaValue =
  | number
  | string
  | boolean
  | { value: number | string | boolean; [key: string]: unknown }

function defaultsFromSchema<T extends Record<string, SchemaValue>>(schema: T) {
  const result = {} as {
    [K in keyof T]: T[K] extends { value: infer V } ? V : T[K]
  }
  for (const key of Object.keys(schema) as (keyof T)[]) {
    const entry = schema[key]
    ;(result as Record<string, unknown>)[key as string] =
      typeof entry === 'object' && entry !== null && 'value' in entry
        ? entry.value
        : entry
  }
  return result
}

export function useControls<T extends Record<string, SchemaValue>>(
  _folder: string,
  schema: T,
) {
  return defaultsFromSchema(schema)
}

export function Leva(_props: Record<string, unknown>) {
  return null
}
