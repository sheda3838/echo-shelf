import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Echo Shelf')
    .items([
      S.documentTypeListItem('savedItem').title('Saved Items'),
    ])