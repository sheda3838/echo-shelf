import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '../env'

/**
 * Server-side Sanity client with write permissions.
 * Uses SANITY_API_WRITE_TOKEN from environment variables.
 * Kept strictly on the server (never exposed to the client bundle).
 */
export const writeClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN,
})
