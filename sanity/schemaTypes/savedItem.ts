import {BookmarkIcon} from '@sanity/icons/Bookmark'
import {defineArrayMember, defineField, defineType} from 'sanity'

export const savedItemType = defineType({
  name: 'savedItem',
  title: 'Saved Item',
  type: 'document',
  icon: BookmarkIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required().error('A title is required'),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      description: 'AI-assisted or user-edited description of the saved content',
      validation: (rule) => rule.required().error('A description is required'),
    }),
    defineField({
      name: 'contentType',
      title: 'Content Type',
      type: 'string',
      validation: (rule) => rule.required().error('A content type is required'),
      options: {
        list: [
          {title: 'Article', value: 'article'},
          {title: 'Video', value: 'video'},
          {title: 'Repository', value: 'repo'},
          {title: 'URL', value: 'url'},
          {title: 'Image', value: 'image'},
          {title: 'Screenshot', value: 'screenshot'},
          {title: 'PDF', value: 'pdf'},
          {title: 'Document', value: 'document'},
          {title: 'Note', value: 'note'},
          {title: 'Other', value: 'other'},
        ],
        layout: 'dropdown',
      },
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'object',
      description: 'Source content details (URL, uploaded file, or raw text)',
      fields: [
        defineField({
          name: 'url',
          title: 'URL',
          type: 'url',
        }),
        defineField({
          name: 'file',
          title: 'File',
          type: 'file',
        }),
        defineField({
          name: 'text',
          title: 'Text',
          type: 'text',
        }),
      ],
    }),
    defineField({
      name: 'image',
      title: 'Preview Image',
      type: 'image',
      description: 'Optional preview or cover image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      description: 'AI-generated or user-edited keywords and tags',
      of: [defineArrayMember({type: 'string'})],
      options: {
        layout: 'tags',
      },
    }),
    defineField({
      name: 'savedAt',
      title: 'Saved At',
      type: 'datetime',
      validation: (rule) => rule.required().error('Saved date is required'),
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'lastOpenedAt',
      title: 'Last Opened At',
      type: 'datetime',
    }),
    defineField({
      name: 'isFavorite',
      title: 'Favorite',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'relatedItems',
      title: 'Related Items',
      type: 'array',
      description: 'References to other saved items (powers Smart Connections)',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'savedItem'}],
        }),
      ],
    }),
    defineField({
      name: 'knowledgeCluster',
      title: 'Knowledge Cluster',
      type: 'string',
      description: 'Cluster or topic grouping identifier for AI-driven organization',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      contentType: 'contentType',
      media: 'image',
    },
    prepare({title, contentType, media}) {
      return {
        title: title || 'Untitled Saved Item',
        subtitle: contentType ? contentType.toUpperCase() : 'No type specified',
        media,
      }
    },
  },
})
