import { type SchemaTypeDefinition } from 'sanity'

import { userType } from './user'
import { savedItemType } from './savedItem'
import { knowledgeClusterType } from './knowledgeCluster'
import { rediscoveryResultType } from './rediscoveryResult'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [userType, savedItemType, knowledgeClusterType, rediscoveryResultType],
}
