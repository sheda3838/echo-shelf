# Echo Shelf — Build Log

## 2026-09-25 — Project Planning

### Initial Problem
I often save useful articles, screenshots, notes, videos, and technical resources but rarely return to them later.

### Final Project Direction
Echo Shelf will help users:

- Capture useful content
- Use AI to generate structured metadata
- Store content in Sanity
- Detect similar/duplicate saved items
- Connect related knowledge
- Organize content into knowledge clusters
- Resurface forgotten content when it becomes relevant again

### Core Concept
**Capture → Connect → Resurface**

### Main Technologies Planned

- Next.js
- TypeScript
- Tailwind CSS
- Sanity
- Sanity Content Lake
- GROQ
- Groq API
- Vercel

### Key Planning Decision

Sanity will not be used only as a generic database.

The structured metadata stored for each saved item will be important for AI-powered connections, duplicate detection, knowledge clustering, and rediscovery.

## 2026-09-25 — Next.js Initialization

### What I Tried

I attempted to initialize the Next.js application directly inside the existing `echo-shelf` folder using:

`npx create-next-app@latest .`

### Issue Encountered

The setup stopped because the folder already contained:

- `PROJECT_PLAN.md`
- `BUILD_LOG.md`

`create-next-app` detected the existing files and avoided generating the project in the same directory to prevent possible conflicts or overwrites.

### Resolution

I temporarily moved the planning files outside the project folder, initialized the Next.js application, and then restored the files back into the project root.

### Learning

`create-next-app` performs a safety check before generating a project inside an existing directory. Existing files are not necessarily incompatible with Next.js, but the CLI avoids modifying a non-empty folder automatically.

## 2026-09-27 — Sanity Initialization

### What I Did

Initialized Sanity inside the existing Next.js project using:

`npx sanity@latest init`

Created:

- Sanity project: Echo Shelf
- Dataset: production
- Embedded Sanity Studio
- Studio route: `/studio`
- TypeScript configuration
- Next.js integration
- Sanity environment variables

### Result

Sanity Studio successfully loaded at:

`http://localhost:3000/studio`

The default Blog starter schema is currently visible with:

- Posts
- Categories
- Authors

This confirmed that the Next.js application is successfully connected to the Sanity project and Content Lake.

### Learning

Sanity Studio acts as the content-management interface, while the schema defines what types of structured content can be created and stored in Content Lake.

The default Blog schema is only temporary and will later be replaced with schemas designed specifically for Echo Shelf.

## 2026-09-28 — Echo Shelf Saved Item Schema

### What I Did

Replaced the default Sanity Blog starter schemas with the first real Echo Shelf document type: `savedItem`.

The schema currently stores:

- Title
- Description
- Content type
- Source URL, file, or text
- Optional preview image
- Tags
- Saved date
- Last opened date
- Favorite state
- Related items
- Knowledge cluster

I also customized the Sanity Studio structure so the sidebar is now specific to Echo Shelf and currently displays only:

- Saved Items

### Design Decision

The Sanity schema contains some internal fields that normal users should not manually manage, such as:

- `savedAt`
- `lastOpenedAt`
- `relatedItems`
- `knowledgeCluster`

These fields may still be visible in Sanity Studio because Studio is the content-management interface.

The future Next.js user interface will control these fields automatically and only show the inputs relevant to the selected content type.

### Learning

The Sanity schema defines how Echo Shelf content is structured in Content Lake, while the Next.js frontend can provide a completely different and simplified experience for users.

## 2026-09-28 — Add Item Flow

### What I Built

Built the first real Echo Shelf user flow for adding saved content from the Next.js application.

The `/add` page supports the finalized content types:

- Article
- Video
- Repository
- URL
- Image
- Document
- Note
- Other

Similar types were intentionally merged before the first commit:

- Image and Screenshot → Image
- PDF and Document → Document

The form dynamically changes the required source inputs depending on the selected content type.

### Dynamic Source Inputs

- Article / Video / Repository / URL → source URL + optional preview image
- Image → required image upload
- Document → required document/file upload + optional preview image
- Note → required text content + optional preview image
- Other → optional URL, file, text, and preview image

### Sanity Write Integration

Created a dedicated server-side Sanity write client.

All Sanity mutations and asset uploads happen on the server.

A private `SANITY_API_WRITE_TOKEN` is stored inside `.env.local` and is not exposed to the browser.

### Asset Handling

Echo Shelf can upload:

- Images to Sanity image assets
- Documents/files to Sanity file assets

The resulting asset references are stored inside the `savedItem` document.

### Automatic Fields

The application automatically manages:

- `savedAt`
- `isFavorite`

Internal fields such as `lastOpenedAt`, `relatedItems`, and `knowledgeCluster` are not exposed in the user-facing Add Item form.

### Tag Input

Tags use an interactive chip-based input.

Users can:

- Type a tag and press Enter to add it
- Use comma to add a tag
- Remove individual tags using an × button
- Use Backspace on an empty input to remove the last tag

Duplicate tags are prevented case-insensitively.

Tags are stored in Sanity as a `string[]`.

Pressing Enter while entering tags does not submit the form.

### Validation & UX

Added:

- Required-field validation
- Dynamic content-type validation
- URL validation
- Interactive tag input
- Duplicate-tag prevention
- Loading state
- Duplicate submission prevention
- Success and error feedback
- Responsive mobile and desktop layout
- Safe Enter-key behavior

### Verification

Verified the complete flow:

Next.js Add Item page
→ dynamic source fields
→ server-side validation
→ Sanity asset upload
→ savedItem document creation
→ document visible in Sanity Studio

Verified:

- URL-based items
- Image-based items
- Document-based items
- Tag creation and removal
- Sanity tag storage as `string[]`
- TypeScript checks
- ESLint checks

### Learning

This milestone connected the public Next.js application to Sanity mutations safely.

Sanity Studio is now only one way to manage content; Echo Shelf can create structured Content Lake documents directly through its own user interface.

