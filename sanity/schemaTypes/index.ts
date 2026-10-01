import { type SchemaTypeDefinition } from 'sanity'

import { savedItemType } from './savedItem'
import { knowledgeClusterType } from './knowledgeCluster'
import { rediscoveryResultType } from './rediscoveryResult'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [savedItemType, knowledgeClusterType, rediscoveryResultType],
}
