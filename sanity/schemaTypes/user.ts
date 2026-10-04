import { UserIcon } from '@sanity/icons/User'
import { defineField, defineType } from 'sanity'

export const userType = defineType({
  name: 'user',
  title: 'User',
  type: 'document',
  icon: UserIcon,
  fields: [
    defineField({
      name: 'displayName',
      title: 'Display Name',
      type: 'string',
      description: 'Public or preferred display name for the user',
      validation: (rule) => rule.required().error('A display name is required'),
    }),
    defineField({
      name: 'avatarUrl',
      title: 'Avatar URL',
      type: 'url',
      description: 'Optional avatar or profile picture URL',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (rule) => rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'displayName',
      subtitle: 'createdAt',
    },
    prepare({ title, subtitle }) {
      return {
        title: title || 'Anonymous User',
        subtitle: subtitle ? `Created ${new Date(subtitle).toLocaleDateString()}` : '',
      }
    },
  },
})
