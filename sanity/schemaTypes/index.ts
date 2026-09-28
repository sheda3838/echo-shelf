import { type SchemaTypeDefinition } from 'sanity'

import { savedItemType } from './savedItem'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [savedItemType],
}
