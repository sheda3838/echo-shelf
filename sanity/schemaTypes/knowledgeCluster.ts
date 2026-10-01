import {ProjectsIcon} from '@sanity/icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

export const knowledgeClusterType = defineType({
  name: 'knowledgeCluster',
  title: 'Knowledge Cluster',
  type: 'document',
  icon: ProjectsIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Thematic name of this knowledge cluster',
      validation: (rule) => rule.required().error('A cluster title is required'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (rule) => rule.required().error('A slug is required'),
    }),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'text',
      description: 'Thematic summary explaining how the items in this cluster relate',
      validation: (rule) => rule.required().error('A summary is required'),
    }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      description: 'Saved items belonging to this thematic knowledge cluster',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'savedItem'}],
        }),
      ],
      validation: (rule) => rule.min(2).error('A cluster must have at least 2 items'),
    }),
    defineField({
      name: 'tags',
      title: 'Tags / Keywords',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {
        layout: 'tags',
      },
    }),
    defineField({
      name: 'generatedAt',
      title: 'Generated At',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      itemCount: 'items.length',
    },
    prepare({title, itemCount}) {
      return {
        title,
        subtitle: `${itemCount || 0} item${itemCount === 1 ? '' : 's'}`,
      }
    },
  },
})
