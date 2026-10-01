import { type SchemaTypeDefinition } from 'sanity'

import { savedItemType } from './savedItem'
import { knowledgeClusterType } from './knowledgeCluster'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [savedItemType, knowledgeClusterType],
}
