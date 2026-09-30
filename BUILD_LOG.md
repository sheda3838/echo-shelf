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

## 2026-09-28 — Smart Capture AI Helper

### What I Built

Integrated Groq into Echo Shelf as the first AI helper.

Smart Capture can analyze available text context and generate editable metadata for a saved item.

AI currently suggests:

- Title
- Description
- Tags

### Current Supported Flow

For text-based content such as Notes:

User provides source text
→ Echo Shelf sends the usable context to Groq
→ Groq returns structured metadata
→ Generated values populate the form
→ User can review/edit before saving

### User Control

AI only assists with metadata generation.

Generated content is not saved automatically.

The user can:

- Edit the generated title
- Edit the generated description
- Add/remove tags
- Clear the AI-generated suggestions entirely

### Security

The Groq API key is stored server-side in `.env.local` as:

`GROQ_API_KEY`

It is never exposed to the browser.

### Limitation Identified

Groq cannot understand a URL, image, PDF, or other source simply from the source reference itself.

For these content types, Echo Shelf will need a source-extraction layer before sending meaningful text to Groq.

### Verification

Smart Capture was tested successfully with note content about Docker networking.

Groq generated relevant:

- Title
- Description
- Tags

The generated metadata remained fully editable before saving.

### Learning

The AI layer works best when it receives real extracted context rather than raw links or file references.

This led to the next architectural requirement:

Source
→ Extraction layer
→ Groq
→ Structured metadata

## 2026-09-29 — Article & URL Source Extraction

### What I Built

Implemented the first real source extraction layer for Echo Shelf Smart Capture.

For Article and generic URL content, Echo Shelf can now:

1. Fetch the webpage server-side
2. Parse the HTML using `jsdom`
3. Extract readable page content using Mozilla Readability
4. Clean and normalize the extracted text
5. Send meaningful context to Groq
6. Generate editable title, description, and tags

### Extraction Stack

- `jsdom`
- `@mozilla/readability`
- Server-side `fetch`
- Groq

### Extraction Flow

Article / URL
→ Fetch webpage
→ Parse HTML
→ Extract main readable content
→ Clean and cap extracted text
→ Send real content to Groq
→ Generate metadata
→ User reviews/edits before saving

### Text Limit

Extracted webpage content is capped at 15,000 characters before being sent to Groq.

This prevents very large webpages from sending unnecessary content while preserving enough context for meaningful metadata generation.

### Reliability Improvements

Manual testing revealed several Smart Capture state issues.

These were fixed by:

- Invalidating previous AI metadata when the source URL changes
- Clearing only AI-generated values while preserving manual inputs
- Replacing previous AI tags during regeneration instead of accumulating them
- Tracking AI-generated metadata separately from manual content
- Preventing stale async responses from older URLs from updating the current form
- Distinguishing authentication errors from automated-access blocking

### AI State Tracking

Echo Shelf now tracks:

- AI-generated title
- AI-generated description
- AI-generated tags
- source URL
- source text
- content type

This allows the interface to determine whether a value was generated by AI or manually entered by the user.

### Race Condition Protection

Each Smart Capture request receives a request identifier and source-context snapshot.

If the user changes the source before the AI request finishes, the previous response is discarded rather than being applied to the new source.

### Error Handling

The extractor now distinguishes:

- Invalid URL
- Unsupported protocol
- Authentication-required page
- Automated-access blocked page
- 404 page
- Timeout
- Non-HTML response
- Empty page
- Unreadable/dynamic webpage

Blocked webpages show a fallback message suggesting that the user paste relevant text manually.

### Verification

Successfully tested:

- Wikipedia article
- Text-heavy essay
- Basic webpage
- Invalid URL
- Unsupported protocol
- 404 response
- Empty response
- URL A → URL B source switching
- AI regeneration
- Manual metadata preservation
- Clear AI Suggestions
- Stale request protection

TypeScript and ESLint checks completed successfully.

### Learning

Groq should never be asked to guess the content behind a URL.

Echo Shelf now follows the architecture:

Source
→ Extraction Layer
→ Groq
→ Structured Metadata

This extraction pattern can now be reused for repositories, videos, documents, and images.


## 2026-09-30 — Repository Source Extraction

### What I Built

Implemented a dedicated repository extraction layer for Echo Shelf Smart Capture.

Repository content is no longer treated like a generic webpage.

Echo Shelf now detects supported repository providers and uses their official APIs to retrieve structured repository information.

Supported providers:

- GitHub
- GitLab

### Repository Extraction Flow

Repository URL
→ Detect provider
→ Parse repository/project path
→ Fetch repository metadata
→ Fetch README
→ Normalize extracted context
→ Send context to Groq
→ Generate editable title, description, and tags

### GitHub Integration

For GitHub repositories, Echo Shelf retrieves:

- Repository name
- Full repository name
- Description
- Topics
- Primary language
- Default branch
- Homepage
- Star count
- README content

The GitHub REST API is used instead of scraping repository webpages.

### GitLab Integration

For GitLab repositories, Echo Shelf retrieves:

- Project name
- Namespace/project path
- Description
- Topics
- Default branch
- Star count
- README content

Nested GitLab namespaces and subgroup paths are supported.

### README Handling

README content is used as the main semantic context for Smart Capture.

If no README exists, extraction continues using repository metadata instead of failing.

README content is cleaned and capped at 15,000 characters before being sent to Groq.

### Authentication

Public repositories can be extracted without additional provider credentials.

Optional server-side tokens are supported:

- `GITHUB_TOKEN`
- `GITLAB_TOKEN`

These can later be added to increase provider API rate limits.

### Smart Capture Integration

For `repo` content:

Repository URL
→ Repository extractor
→ Structured repository context
→ Groq
→ Suggested title, description, and tags

Existing Smart Capture behavior remains unchanged:

- Manual values are preserved
- AI tags do not accumulate across regenerations
- Clear AI Suggestions removes only AI-generated metadata
- Changing repository URL invalidates stale AI suggestions
- Out-of-order AI responses are discarded

### Error Handling

Handled:

- Invalid repository URLs
- Nonexistent repositories
- Private/authentication-required repositories
- Provider rate limits
- Unsupported providers
- Network/timeout failures
- Missing README files

### Verification

Successfully tested:

- Public GitHub repository
- GitHub repository end-to-end Smart Capture
- Invalid GitHub URL
- Nonexistent GitHub repository
- Public GitLab repository
- GitLab nested namespace repository
- GitLab repository end-to-end Smart Capture
- Nonexistent GitLab repository
- Unsupported provider

TypeScript and ESLint checks completed successfully.

### Learning

Structured provider APIs are more reliable than webpage scraping for repository content.

Echo Shelf now follows provider-specific extraction:

GitHub / GitLab
→ Official API
→ Repository metadata + README
→ Groq
→ Structured metadata

## 2026-09-30 — YouTube Video Source Extraction

### What I Built

Implemented a dedicated YouTube source extraction layer for Echo Shelf Smart Capture.

Instead of asking Groq to infer video content from a URL, Echo Shelf now retrieves real YouTube metadata using the official YouTube Data API v3.

### Video Extraction Flow

YouTube URL
→ Parse video ID
→ YouTube Data API v3
→ Normalize video metadata
→ Send structured context to Groq
→ Generate editable title, description, and tags

### Supported YouTube URLs

Echo Shelf supports:

- Standard YouTube watch URLs
- `youtu.be` short links
- YouTube Shorts URLs
- Embed URLs
- Legacy `/v/` URLs
- URLs containing additional query parameters such as timestamps or playlists

### Metadata Extracted

The extractor retrieves:

- Video title
- Video description
- Channel name
- Channel ID
- Published date
- YouTube tags
- Video duration
- Thumbnail URL

The video description is cleaned and capped at 15,000 characters before being sent to Groq.

### Smart Capture Integration

For `video` content:

YouTube URL
→ YouTube extractor
→ Structured metadata
→ Groq
→ Suggested title, description, and tags

Existing Smart Capture behavior remains intact:

- Manual values are preserved
- AI-generated tags are replaced correctly on regeneration
- Changing the source invalidates stale suggestions
- Clear AI Suggestions removes only AI-generated content
- Stale async responses cannot update a newer source

### Limitations

This version uses YouTube metadata only.

Transcript extraction is intentionally not included in the current MVP.

If a video's description and tags contain limited information, Smart Capture may have less context about the actual video content.

Transcript-based understanding can be added later as an enhancement.

### Error Handling

Handled:

- Missing YouTube API configuration
- Invalid YouTube URLs
- Unsupported video providers
- Private/deleted/unavailable videos
- YouTube API quota limits
- Network and timeout failures

### Verification

Successfully tested:

- Standard watch URL
- `youtu.be` URL
- YouTube Shorts URL
- Invalid YouTube URL
- Nonexistent video
- Unsupported Vimeo URL
- End-to-end YouTube → Groq Smart Capture flow

Regression tests for Article/URL and GitHub/GitLab extraction continued to pass.

TypeScript and ESLint checks completed successfully.

### Learning

Different source types require different extraction strategies.

For YouTube, structured platform metadata is more reliable than webpage scraping.

Echo Shelf now uses:

YouTube
→ Official API
→ Structured metadata
→ Groq
→ AI-assisted metadata

## 2026-09-30 — Document Source Extraction

### What I Built

Implemented document extraction for Echo Shelf Smart Capture.

Supported formats:

- PDF
- DOCX
- PPTX
- XLSX

Each format is parsed server-side and converted into normalized text before being sent to Groq.

### Document Extraction Flow

Uploaded document
→ Validate file
→ Convert to Buffer
→ Detect document type
→ Format-specific parser
→ Normalize extracted content
→ Send structured context to Groq
→ Generate editable title, description, and tags

### Parsers Used

- PDF → `pdf-parse`
- DOCX → `mammoth`
- PPTX → `pptx-text-parser`
- XLSX → `xlsx` / SheetJS

### Limits

- Maximum document size: 20 MB
- Maximum extracted context sent to Groq: 20,000 characters

### Format Behavior

PDF:
- Extracts readable text
- Tracks page count
- Image-only/scanned PDFs are reported as unsupported for text extraction

DOCX:
- Extracts raw semantic text
- Preserves meaningful paragraph separation

PPTX:
- Extracts slide text in order
- Preserves slide boundaries

XLSX:
- Extracts non-empty sheets
- Preserves sheet names and tabular row structure

### Runtime Issues Discovered During Manual Testing

The first implementation passed automated tests but failed in the real browser flow.

Manual testing exposed three runtime issues.

#### pdf-parse Import Failure

`pdf-parse@1.1.1` executed a debug block from its package entry point during Next.js server bundling and attempted to read a missing test PDF.

The extractor now imports the core parser directly:

`pdf-parse/lib/pdf-parse.js`

This bypasses the problematic debug entry code.

#### Next.js Server Action File Size Limit

Next.js Server Actions defaulted to a request body limit too small for document uploads.

The Server Action body size limit was updated to support Echo Shelf's 20 MB document limit.

#### Error Masking

Document parser failures were originally caught by the generic Groq error handler and displayed as:

"Unable to reach the AI assistant."

Extraction and AI errors are now separated so the user receives accurate failure messages.

### File State & Race Protection

Document Smart Capture uses file identity information such as:

- file name
- file size
- MIME type
- last modified value

Changing or replacing a document invalidates previous AI suggestions.

Out-of-order requests are discarded so metadata from File A cannot appear after the user switches to File B.

### Security

- Parsing occurs server-side
- Raw files are not sent directly to Groq
- Document contents are treated as untrusted input
- No macros, formulas, scripts, or embedded content are executed
- File contents and secrets are not logged
- Smart Capture parses the selected file directly without creating temporary Sanity assets

### Verification

Successfully tested end-to-end:

- PDF
- DOCX
- PPTX
- XLSX

Also verified:

- document replacement invalidation
- Clear AI Suggestions
- stale request protection
- Notes regression
- Article/URL regression
- GitHub/GitLab regression
- YouTube regression

The real browser `/add → upload document → Generate with AI` flow was manually tested successfully.

TypeScript and ESLint checks completed successfully.

### Learning

Automated parser tests alone were not enough.

The real browser flow exposed framework-specific issues involving package bundling and Server Action request limits.

Echo Shelf now follows:

Document
→ Format-specific parser
→ Normalized text
→ Groq
→ Structured metadata

## 2026-09-30 — Image OCR Source Extraction

### What I Built

Implemented the final Smart Capture extraction type for Echo Shelf: Image OCR.

Echo Shelf can now analyze text-heavy images such as:

- Screenshots
- Posters
- Infographics
- UI screenshots
- Diagrams with labels
- Slide screenshots
- Scanned text images

### Image Extraction Flow

Image upload
→ Validate file
→ Convert to Buffer
→ Tesseract.js OCR
→ Normalize extracted text
→ Check OCR quality
→ Send structured context to Groq
→ Generate editable title, description, and tags

### OCR Engine

Used:

`Tesseract.js`

OCR runs server-side and does not require an external OCR API key.

### Supported Image Formats

- PNG
- JPG
- JPEG
- WEBP

### Limits

- Maximum image size: 10 MB
- OCR context limit: 12,000 characters
- Minimum useful OCR threshold: 20 meaningful characters

### OCR Context

The Groq context includes:

- File name
- OCR confidence
- Extracted visible text

The filename is used only as supporting context.

Groq is instructed not to invent visual information that was not extracted through OCR.

### Smart Capture Integration

For Image content:

Image
→ OCR
→ Extracted text
→ Groq
→ Suggested title, description, and tags

Existing Smart Capture behavior remains intact:

- Manual metadata is preserved
- AI metadata is tracked separately
- Changing the image invalidates stale suggestions
- AI tags do not accumulate across regenerations
- Clear AI Suggestions removes only AI-generated metadata
- Stale OCR/AI responses cannot overwrite a newly selected image

### Error Handling

Handled:

- Invalid image file
- Unsupported image format
- Oversized image
- OCR processing failure
- Insufficient readable text
- Groq failure after successful OCR

Images with insufficient readable text fall back to:

`Not enough readable text was found in this image. Add a description manually.`

### Manual Verification

A social-media content moderation infographic was manually tested.

OCR successfully extracted the visible points, including:

- Protecting users from harm
- Compliance with laws and regulations
- Maintaining platform reputation
- Fostering healthy community engagement
- Building trust and promoting diversity

Smart Capture generated:

- A relevant title
- A grounded summary
- Relevant tags related to social media moderation, user protection, compliance, and community engagement

The generated metadata accurately reflected the image content.

### Regression Verification

Confirmed existing extraction flows continue working:

- Notes
- Articles / generic URLs
- GitHub / GitLab repositories
- YouTube videos
- Documents

TypeScript and ESLint checks completed successfully.

### Limitation

Echo Shelf currently understands images through extracted visible text only.

It does not yet perform full visual scene understanding such as:

- Object recognition
- Color analysis
- Visual composition understanding
- Semantic chart interpretation
- Image-only photo understanding

### Learning

Different source types require specialized extraction strategies.

Echo Shelf Smart Capture now supports:

Notes
→ Direct text

Articles / URLs
→ Mozilla Readability

GitHub / GitLab
→ Provider APIs

YouTube
→ YouTube Data API

Documents
→ Format-specific parsers

Images
→ Tesseract.js OCR

All extracted content is normalized before being sent to Groq.