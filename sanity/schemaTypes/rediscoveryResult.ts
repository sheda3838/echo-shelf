import {SparklesIcon} from '@sanity/icons/Sparkles'
import {defineField, defineType} from 'sanity'

export const rediscoveryResultType = defineType({
  name: 'rediscoveryResult',
  title: 'Rediscovery Result',
  type: 'document',
  icon: SparklesIcon,
  fields: [
    defineField({
      name: 'owner',
      title: 'Owner',
      type: 'reference',
      to: [{type: 'user'}],
      validation: (rule) => rule.required().error('An owner reference is required'),
    }),
    defineField({
      name: 'articleTitle',
      title: 'Article Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'articleDescription',
      title: 'Article Description',
      type: 'text',
    }),
    defineField({
      name: 'articleUrl',
      title: 'Article URL',
      type: 'url',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'articleImageUrl',
      title: 'Article Image URL',
      type: 'url',
    }),
    defineField({
      name: 'articleSource',
      title: 'Article Source / Publisher',
      type: 'string',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'savedItem',
      title: 'Saved Knowledge Item',
      type: 'reference',
      to: [{type: 'savedItem'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'cluster',
      title: 'Related Knowledge Cluster',
      type: 'reference',
      weak: true,
      to: [{type: 'knowledgeCluster'}],
    }),
    defineField({
      name: 'relevance',
      title: 'Relevance',
      type: 'string',
      options: {
        list: [
          {title: 'Strong', value: 'strong'},
          {title: 'Moderate', value: 'moderate'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'connectionType',
      title: 'Connection Type',
      type: 'string',
      description: 'e.g. updates, extends, related-development, new-application, changes, revisits',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'reason',
      title: 'Why This Matters',
      type: 'text',
      description: 'AI explanation of why this current news article makes the saved knowledge relevant now',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'discoveredAt',
      title: 'Discovered At',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'articleTitle',
      source: 'articleSource',
      itemTitle: 'savedItem.title',
    },
    prepare({title, source, itemTitle}) {
      return {
        title,
        subtitle: `${source || 'News'} → ${itemTitle || 'Saved Item'}`,
      }
    },
  },
})
