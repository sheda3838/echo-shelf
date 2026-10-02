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

## 2026-09-30 — Replaced OCR-Only Image Capture with Groq Vision

### Why This Changed

The first Image Smart Capture implementation used `tesseract.js` OCR.

It worked well for text-heavy screenshots and infographics, but manual testing with normal visual images exposed a major limitation.

For images with little or no readable text, OCR produced meaningless text fragments and Smart Capture generated poor metadata from that incorrect context.

Example failure:
- Visual beach/sunset image
- OCR extracted low-confidence noise
- Groq generated metadata about OCR quality instead of the actual scene

This showed that OCR alone was not suitable for Echo Shelf's broader Image category, which includes:

- Photos
- Screenshots
- Diagrams
- Illustrations

### Architecture Revision

The image pipeline was redesigned from:

Image
→ Tesseract OCR
→ Extracted text
→ Text-only Groq model

to:

Image
→ Groq Vision
→ Direct visual + text understanding
→ Structured metadata

### Multimodal Model

Echo Shelf now uses:

`qwen/qwen3.8-27b`

through the existing Groq API.

The uploaded image is converted server-side into a Base64 Data URL and sent directly as multimodal input.

### Image Smart Capture Flow

Image upload
→ Validate format and file size
→ Convert image buffer to Base64 Data URL
→ Send image directly to Groq Vision
→ Analyze visual scene + visible text
→ Generate title, description, and tags
→ User reviews/edits before saving

### Supported Formats

- PNG
- JPG
- JPEG
- WEBP

Maximum image size:

`10 MB`

### Tesseract Removal

`tesseract.js` was removed completely because Groq Vision now handles both:

- visible text
- visual content

Removed:

- Tesseract dependency
- OCR worker lifecycle
- OCR confidence tracking
- minimum readable-text threshold
- OCR-specific error handling
- Tesseract server external configuration

### Vision Capabilities

Image Smart Capture can now understand:

- Photos
- Landscapes
- Screenshots
- Posters
- Infographics
- UI screenshots
- Diagrams
- Illustrations
- Images containing visible text
- Images containing little or no text

The model is instructed to avoid inventing details that cannot reasonably be seen in the supplied image.

### UI Updates

Updated loading state to:

`Analyzing image and generating suggestions...`

Removed outdated OCR/future-image-extraction messaging.

Existing Smart Capture behavior remains intact:

- Manual values are preserved
- AI-generated values are tracked separately
- Changing image invalidates stale suggestions
- Clear AI Suggestions removes only AI-generated metadata
- Out-of-order responses cannot overwrite a newly selected image

### Manual Verification

#### Text-Heavy Image

A Docker networking diagram was analyzed successfully.

Generated metadata correctly identified:

- Docker networking
- Host/container port mapping
- Bridge networking
- Virtual subnet information

#### Visual Photo

A beach/sunset image containing no useful text was analyzed successfully.

The model recognized the actual visual scene and generated relevant metadata instead of OCR noise.

#### UI Screenshot

A settings-dashboard screenshot was successfully understood using both visible text and visual context.

#### Blank Image

A blank white image was still handled safely and described accurately rather than causing an extraction failure.

### Real-World Manual Test

A bank-account information image was manually tested through `/add`.

Groq Vision correctly generated:

- A meaningful bank-account title
- A description based on the visible information
- Relevant banking/account tags

The result confirmed that both visual content and visible text can now be understood directly.

### Regression Verification

Existing Smart Capture flows continued working:

- Notes
- Articles / generic URLs
- GitHub / GitLab repositories
- YouTube videos
- Documents

TypeScript and ESLint checks completed successfully.

### Learning

OCR is useful for reading text but is not sufficient for general image understanding.

Manual testing revealed that Echo Shelf's Image category required multimodal visual understanding rather than text extraction alone.

The final Image Smart Capture architecture is:

Image
→ Groq Vision
→ Visual + textual understanding
→ AI-generated metadata

## 2026-09-30 — Smart Connections Test Dataset

Seeded 12 deterministic `savedItem` notes into Sanity across three themes:

- Containers / DevOps
- Web Development
- Knowledge / AI

The dataset intentionally contains strong, moderate, and unrelated relationships for testing Smart Connections.

The seed script is idempotent and can be rerun with:

`npm run seed:connections`

## 2026-09-30 — Smart Connections Phase 1: Connection Schema & Metadata Candidate Shortlisting

### Overview
Implemented the foundation for Smart Connections:
1. Extended Sanity's `savedItem` schema with a `connections` array of reference objects (`item`, `strength`, `relationshipType`, `explanation`), preserving backward compatibility with `relatedItems`.
2. Created a lightweight, deterministic candidate shortlisting engine (`lib/connections/candidateShortlist.ts`) that extracts potential relationship candidates from Sanity without expensive LLM or embedding calls.

### Schema Additions
- Added `connections` array field to `savedItem` schema:
  - `item`: Reference to `savedItem`
  - `strength`: Dropdown with `"strong" | "moderate" | "weak"`
  - `relationshipType`: Short string description
  - `explanation`: Contextual text description
  - Custom Sanity Studio preview displaying connected item title, strength, and relationship type.

### Candidate Shortlisting Heuristics
- **Signals & Weights**:
  - Normalized Tag Overlap (60% weight, Jaccard similarity)
  - Title Keyword Overlap (25% weight, root-aware Dice overlap + title-in-query cross-matching)
  - Description Keyword Overlap (15% weight, root-aware Dice overlap)
- **Token Normalization**:
  - Lowercased, stripped punctuation, filtered generic stop words and short tokens (<=2 chars).
  - Rule-based suffix normalization (handling plurals, `-ing`, `-es`, `-ies`, and root prefixes like `route`/`router`).
- **Eligibility & Filtering**:
  - Excludes current item (`excludeId`).
  - Excludes Sanity drafts (`drafts.**`).
  - Excludes documents missing title or meaningful content.
  - Cross-content-type support (notes, articles, repos, videos, documents, images).
  - Filters out weak candidates below heuristic threshold (`0.04`), capping shortlist at top 5 candidates and returning empty array `[]` when no meaningful candidates exist.
- **Sanity Retrieval**:
  - Lightweight GROQ query fetching only `_id`, `title`, `description`, `tags`, and `contentType` without pulling heavy file assets or source bodies.

### Verification Results
Tested against the 12-item controlled seed dataset:
- **Test A (Docker Bridge Networks)**: Successfully ranked `Docker Networking Basics` (0.8402), `Container Port Mapping` (0.4612), `Kubernetes Service Discovery` (0.2261).
- **Test B (Next.js Server Actions)**: Successfully ranked `Next.js Server Actions` (0.6020), `React Server Components` (0.2865), `GitHub Actions CI/CD` (0.1011), `REST API Route Design` (0.0515).
- **Test C (Semantic Knowledge Management)**: Successfully ranked `Knowledge Graph Fundamentals` (0.4498), `Semantic Search Concepts` (0.1650), `Personal Knowledge Management` (0.1570).
- **Test D (Home Gardening Checklist)**: Returned `[]` (0 candidates), verifying that no false relationships are forced.
- All unit tests passed (tag normalization, keyword normalization, stop words, duplicate tags, case insensitivity, top-5 limit, self-exclusion, and no-match threshold).
- TypeScript check (`npx tsc --noEmit`) and ESLint (`npm run lint`) passed with 0 errors and 0 warnings.

## 2026-09-30 — Smart Connections Phase 2A: Pre-Save Candidate Suggestions UI

### Overview
Integrated candidate shortlisting into the `/add` pre-save workflow. Users can preview potentially related saved items in Sanity before saving without calling Groq or calculating embeddings:
1. Created dedicated server action `lookupConnectionCandidatesAction` in `app/add/connection-actions.ts`.
2. Built a responsive "Potentially Related" suggestions UI section below tags and before the save button.
3. Automatically triggers candidate lookup once Smart Capture generates metadata (using fresh resolved values to prevent React state lag).
4. Added manual "Find Related Items" trigger for manual-metadata users.
5. Implemented immediate stale candidate invalidation on metadata (title, description, tags), content type, or source changes.

### Server Action Details (`app/add/connection-actions.ts`)
- Reuses the Phase 1 metadata shortlist engine (`lib/connections/candidateShortlist.ts`).
- Enforces minimum metadata requirement: requires `title` or `description`.
- Maps candidates to safe user-facing shape (`_id`, `title`, `description`, `tags`, `contentType`), stripping internal numeric scores.
- Never exposes internal GROQ errors or sensitive tokens.

### Frontend UI & State Architecture (`app/add/page.tsx`)
- **State**:
  - `connectionCandidates`: List of shortlisted candidate items kept for subsequent Phase 2B persistence.
  - `isShortlisting`: Loading spinner with `"Looking for related items..."` text, preventing repeated clicks.
  - `hasSearchedCandidates`: Tracks whether search ran to accurately display non-alarming empty state (`"No closely related saved items found."`).
  - `candidateFeedback`: Displays non-blocking informative notifications if lookup fails.
- **Card Design**:
  - Displays title, content type badge, 2-line summary description, and up to 3-4 keyword tags formatted cleanly with `·`.
  - Omits internal similarity scores, raw heuristic details, Groq strength, and relationship explanation (reserved for post-save AI verification in Phase 2B).
- **Stale Invalidation**:
  - Modifying title, description, tags, content type, or source immediately resets `connectionCandidates` and hides stale suggestions.
- **Save Integrity**:
  - Save button and form action behavior remain completely unaffected and unblocked.

### Verification Results
- **Test A (Docker)**: Successfully suggested `Docker Networking Basics`, `Container Port Mapping`, `Kubernetes Service Discovery`.
- **Test B (Next.js)**: Successfully suggested `Next.js Server Actions`, `React Server Components`, `REST API Route Design`.
- **Test C (Knowledge)**: Successfully suggested `Knowledge Graph Fundamentals`, `Semantic Search Concepts`, `Personal Knowledge Management`.
- **Test D (Gardening)**: Correctly returned `[]` and displayed the clean empty state `"No closely related saved items found."`.
- **Automated Regression & Suite Checks**:
  - `npm run test:connections` passed (100% unit tests + seed dataset + server action assertions).
  - TypeScript check (`npx tsc --noEmit`) passed with 0 errors.
  - ESLint check (`npm run lint`) passed with 0 warnings/errors.


  ## 2026-09-30 — Pre-Save Smart Connection Suggestions

Connected the Smart Connections shortlist engine to the `/add` page.

Echo Shelf now compares the current item's title, description, and tags against existing Sanity items before saving and displays likely related items under a "Potentially Related" section.

The suggestions are heuristic only and do not use Groq yet.

Verified manually with:
- Docker/networking note
- Next.js Server Actions note
- Semantic knowledge-management note

The expected related items appeared correctly, and unrelated items were not forced into the shortlist.

## 2026-09-30 — Library, Item Detail Pages & Post-Save Navigation

### What I Built

Built the main Echo Shelf browsing experience so saved knowledge can now be viewed directly inside the app instead of relying on Sanity Studio.

Echo Shelf now has:

- A real Library homepage
- Search and content-type filtering
- Saved item cards
- Dedicated `/item/[id]` detail pages
- Source-specific rendering
- Smart Connections placeholder area
- Post-save redirect into the saved item page

### Library Architecture

The `/` route is now the main Echo Shelf Library.

The page fetches lightweight saved-item metadata from Sanity server-side and passes it to an interactive client Library view.

Library items are ordered newest first.

The library query avoids loading heavy source content and file bodies unnecessarily.

### Library Features

Users can:

- Search saved knowledge by title, description, and tags
- Filter by content type
- Browse saved items as responsive cards
- View favorite state
- See saved dates
- See image thumbnails when available
- See connection counts when connections already exist
- Open any saved item directly from the Library

Supported filters include:

- All
- Notes
- Articles
- Videos
- Repositories
- Documents
- Images
- URLs
- Other

### Saved Item Cards

Each Library card displays:

- Content type
- Title
- Description preview
- Tags
- Saved date
- Favorite indicator
- Image preview when available
- Connection count when available

Cards link directly to:

`/item/[id]`

### Saved Item Detail Page

Created a dedicated dynamic route:

`/item/[id]`

The page retrieves the complete saved item from Sanity and renders it as a knowledge item rather than a CMS document.

### Source-Specific Rendering

Different source types are displayed appropriately.

Notes:
- Original note text with preserved line breaks

Articles / URLs:
- Original source link

Repositories:
- Repository link

Videos:
- YouTube/source link

Documents:
- File name
- Extension
- File size
- Open Document link

Images:
- Responsive saved image preview

Other:
- Displays available URL and/or text safely

### Smart Connections Preparation

The saved-item detail page now includes a dedicated:

`Smart Connections`

section.

If connections exist, the page can already render:

- Connected item
- Strength
- Relationship type
- Explanation

If no connections exist, a placeholder is displayed.

No Groq calls are performed yet.

This creates the final UI location needed for the next Smart Connections phase.

### Post-Save Flow

The item creation flow now works as:

Add Item
→ Save to Sanity
→ receive created document ID
→ redirect to `/item/[id]`
→ view saved item inside Echo Shelf

Users no longer need to visit Sanity Studio to view newly created content.

Sanity Studio remains available only as an admin/development tool.

### Responsive Design

Verified at:

- 375px mobile
- 768px tablet
- desktop

The Library adapts from one to multiple columns, filter controls remain usable on small screens, and item detail content stays readable across viewports.

### Verification

Confirmed:

- Library loads existing Sanity items
- 12 Smart Connections seed items appear
- Search works
- Content-type filters work
- Cards open the correct detail page
- Notes render correctly
- Source-specific item views work
- Missing items return a clean 404
- Saving redirects to the new item's detail page
- Existing Smart Capture remains functional
- Pre-save Potentially Related suggestions remain functional

Quality checks:

- `npm run test:connections` — passed
- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 errors / 0 warnings

### Product Flow

Echo Shelf now has a complete core navigation loop:

Library
→ Add Item
→ Smart Capture
→ Potentially Related
→ Save
→ Saved Item Detail
→ Back to Library

This prepares the application for persistent, AI-generated Smart Connections.


## 2026-10-01 — Smart Connections: AI Relationship Analysis & Persistence

### What I Built

Implemented Echo Shelf's second major AI feature: Smart Connections.

Smart Connections compares a saved item against likely related knowledge, uses Groq to verify genuine relationships, explains why they are connected, and persists those relationships back into Sanity.

Unlike Smart Capture, Smart Connections does not run automatically.

Users explicitly trigger it from the saved-item detail page using:

`Generate Connections`

or:

`Refresh Connections`

### Smart Connections Flow

The final flow is:

Saved Item
→ Generate Connections
→ Metadata shortlist
→ Groq relationship analysis
→ Validate AI response
→ Persist `connections[]` in Sanity
→ Refresh item page
→ Display meaningful connections

The existing metadata shortlist engine is reused so the full knowledge library is never sent to Groq.

Only the top likely candidates are analyzed.

### Candidate Shortlisting

Before calling Groq, Echo Shelf compares the current item's:

- Title
- Description
- Tags

against existing saved items.

The shortlist is capped at 5 candidates.

If no meaningful candidate exists:

- Groq is not called
- No artificial relationship is created
- The user sees a clean no-connections state

### Groq Relationship Analysis

Smart Connections uses:

`openai/gpt-oss-120b`

through the existing Groq integration.

Groq receives:

- Current saved-item metadata
- Shortlisted candidate metadata

It decides which candidates are genuinely related and returns structured connection data.

Each relationship contains:

- Connected item ID
- Strength
- Relationship type
- Explanation

Valid strengths are:

- Strong
- Moderate
- Weak

Groq is explicitly allowed to reject shortlist false positives.

This is important because metadata heuristics may identify superficial matches that are not useful knowledge relationships.

### Structured AI Output

Expected structure:

```json
{
  "connections": [
    {
      "itemId": "candidate-id",
      "strength": "strong",
      "relationshipType": "complementary",
      "explanation": "..."
    }
  ]
}

## 2026-10-01 — Knowledge Clusters

### What I Built

Implemented Echo Shelf's third major AI feature: Knowledge Clusters.

Knowledge Clusters groups related saved items into broader themes so users can explore their library by topic instead of only by individual items.

The feature is user-triggered and does not regenerate automatically on page load.

### Cluster Generation Flow

The final flow is:

Saved Library
→ User clicks Generate Clusters / Refresh Clusters
→ Fetch lightweight saved-item metadata
→ Send metadata to Groq
→ Groq identifies meaningful themes
→ Validate generated clusters
→ Persist cluster documents in Sanity
→ Display clusters in `/clusters`

Only lightweight metadata is used:

- Item ID
- Title
- Description
- Tags
- Content type

Full notes, documents, images, files, and raw source content are not sent for clustering.

### Groq Model

Knowledge Clusters uses:

`openai/gpt-oss-120b`

through the existing server-side Groq integration.

Groq is instructed to:

- group items by actual conceptual relationships
- avoid superficial keyword-only grouping
- avoid single-item clusters
- avoid one giant cluster
- allow useful many-to-many membership
- leave unrelated items ungrouped when appropriate

### Structured Cluster Output

Groq returns structured JSON containing:

- Cluster title
- Cluster summary
- Saved item IDs
- Cluster tags

Example structure:

```json
{
  "clusters": [
    {
      "title": "Containerization & Orchestration",
      "summary": "Saved knowledge around Docker networking, containers, orchestration, and service discovery.",
      "itemIds": [
        "item-id-1",
        "item-id-2"
      ],
      "tags": [
        "docker",
        "kubernetes",
        "containers"
      ]
    }
  ]
}


## 2026-10-01 — Contextual Rediscovery

### What I Built

Implemented Echo Shelf's fourth major AI feature: Contextual Rediscovery.

Contextual Rediscovery connects current news and developments with knowledge previously saved in Echo Shelf.

The feature answers:

`What is happening now that makes something I saved before relevant again?`

### Rediscovery Flow

The final flow is:

Knowledge Clusters
→ Generate compact topic queries
→ Search recent news through GNews
→ Normalize and deduplicate articles
→ Compare news against relevant saved knowledge using Groq
→ Validate meaningful matches
→ Persist rediscovery results in Sanity
→ Display current developments alongside related saved items

### News Provider

Used:

`GNews API`

News retrieval is handled server-side using:

`GNEWS_API_KEY`

Echo Shelf does not send full private notes or uploaded content to the news provider.

Only general topic queries derived from Knowledge Clusters are used.

### Cluster-Based News Search

Knowledge Clusters are used as the primary discovery source.

Cluster metadata such as:

- Title
- Tags
- Item count

is converted into compact search queries.

A rediscovery run uses a maximum of 4 cluster-derived searches to keep external API usage controlled.

### Groq Relationship Analysis

Recent news is not displayed automatically just because it matches a keyword.

Echo Shelf uses:

`openai/gpt-oss-120b`

to compare fetched news against saved-item metadata.

Groq determines whether a current article has a genuinely meaningful connection to something already stored in Echo Shelf.

Only strong or moderate matches are retained.

### Why This Matters

Every Rediscovery result includes a dedicated:

`Why this matters to your shelf`

explanation.

The explanation connects:

- the current development
- the saved item's existing knowledge
- why revisiting that item may be useful now

This makes Rediscovery different from a normal news feed.

### Rediscovery Result UI

Created:

`/rediscover`

Each result displays:

- Current news headline
- Publisher
- Publication time
- News snippet
- Article image when available
- Match strength
- Connection type
- Why this matters to your shelf
- Related saved item
- Related Knowledge Cluster
- Read Article link
- View Saved Item link

External article and saved-item actions open safely in new tabs.

### Persistence

Rediscovery results are stored in Sanity using a dedicated:

`rediscoveryResult`

document type.

Stored data includes:

- Article title
- Description
- URL
- Image URL
- Publisher
- Publication date
- Saved-item reference
- Cluster reference
- Relevance
- Connection type
- Explanation
- Discovery timestamp

Full article contents are not stored.

### Refresh Behavior

Rediscovery is fully user-triggered.

Initial action:

`Check What's Relevant Now`

After results exist:

`Check Again`

Opening `/rediscover` does not call GNews or Groq.

Clicking `Check Again` performs a fresh news search and relationship analysis.

After a successful run, the new validated result set replaces the previous persisted rediscovery results.

Because current news changes between runs:

- New results may appear
- Older results may disappear
- Result counts may change

This is expected behavior and keeps Rediscovery focused on currently relevant developments.

If a refresh fails, the previous persisted results remain intact.

### Zero-Result Behavior

Echo Shelf does not force current-news relationships.

If no meaningful match exists, the user is shown a clean no-results state instead of unrelated news.

### Validation

External and AI-generated results are validated before persistence.

Validation checks include:

- Article URL exists in fetched news
- Saved-item ID exists
- Cluster ID exists
- Relevance is strong or moderate
- Explanation is meaningful
- Duplicate article/item pairs are removed
- Result count is capped

Hallucinated IDs or unsupported matches are rejected.

### Manual Verification

Contextual Rediscovery was tested against the existing Echo Shelf knowledge base.

The feature successfully:

- Generated searches from Knowledge Clusters
- Retrieved live recent news
- Matched relevant stories to saved items
- Produced "Why this matters" explanations
- Persisted results in Sanity
- Reloaded persisted results without another API call
- Replaced results correctly when Check Again was triggered

Manual testing also confirmed that repeated checks can produce different current stories as the news source and relevance analysis change over time.

### Navigation

The shared Echo Shelf navigation now supports:

- Library
- Clusters
- Rediscover
- + Add Item

### Verification

Quality checks passed:

- `npm run test:rediscovery`
- `npm run test:connections`
- `npm run test:clusters`
- `npx tsc --noEmit`
- `npm run lint`

### Product Progress

Echo Shelf now has four major AI-powered features:

1. **Smart Capture**
   - Understands saved content and generates metadata

2. **Smart Connections**
   - Explains relationships between saved items

3. **Knowledge Clusters**
   - Groups saved knowledge into broader themes

4. **Contextual Rediscovery**
   - Connects current developments with previously saved knowledge

The core AI knowledge loop is now complete:

Capture
→ Connect
→ Organize
→ Resurface


## 2026-10-01 — Smart Capture Description Refinement

Refined Smart Capture description generation across all content types.

AI-generated descriptions now explain what the saved item is rather than producing detailed summaries of everything contained inside it.

Examples:
- Notes use descriptions such as “A note about…”
- Articles use “An article about…”
- Videos use “A video explaining…”
- Repositories use “A repository for…”
- Documents use “A report/document covering…”
- Images use “An infographic/screenshot/image showing…”

Descriptions are kept concise at 1–2 sentences while title and tag generation remain unchanged.

Manual testing with both a Docker networking note and an image confirmed the revised behavior works as expected.


## 2026-10-01 — Exact Duplicate Detection

### What I Built

Implemented deterministic exact duplicate detection for Echo Shelf.

The feature checks whether the same source or content already exists before saving a new item.

It does not use Groq or any AI-based similarity.

### Duplicate Detection Strategy

Duplicate identity is derived from the actual source rather than metadata such as title, description, or tags.

Different content types use different fingerprint strategies.

#### URL-Based Content

Used for:

- Articles
- URLs
- Repositories
- Videos
- Other URL-based resources

URLs are normalized before hashing.

Normalization includes:

- Lowercasing protocol and hostname
- Removing URL fragments
- Removing unnecessary trailing slashes
- Removing tracking parameters such as `utm_*`, `fbclid`, and `gclid`
- Preserving meaningful query parameters such as YouTube video IDs
- Sorting remaining query parameters for deterministic output

The normalized URL is hashed with SHA-256.

Fingerprint format:

`url:<sha256>`

#### Notes

Note text is normalized by:

- Trimming whitespace
- Normalizing line endings
- Collapsing repeated whitespace
- Lowercasing text

The normalized note content is then hashed with SHA-256.

Fingerprint format:

`note:<sha256>`

This allows minor spacing or capitalization differences to still be detected as the same note.

#### Documents & Images

Uploaded file bytes are hashed directly using SHA-256.

The filename is not included.

This means:

`report.pdf`

and:

`renamed-report.pdf`

are still detected as the same file if their underlying bytes are identical.

Fingerprint format:

`file:<sha256>`

### Sanity Schema

Added an optional hidden field to `savedItem`:

`sourceFingerprint`

This stores the deterministic fingerprint used for future exact duplicate checks.

### Pre-Save Flow

The Save flow now works as:

Save to Echo Shelf
→ Generate source fingerprint
→ Query Sanity for matching fingerprint
→ If no duplicate: save normally
→ If duplicate: pause save and show warning

### Duplicate Warning UI

When an exact duplicate is found, Echo Shelf displays:

`EXACT DUPLICATE FOUND`

along with:

- Existing item title
- Content type
- Description
- Saved date

Available actions:

`View Existing Item ↗`

and:

`Save Anyway`

The existing item opens in a new tab so the current Add Item form remains untouched.

### Save Anyway

Duplicate detection acts as a warning rather than a permanent block.

Users can intentionally create another copy using:

`Save Anyway`

The duplicate item is still saved with the same deterministic fingerprint.

### Duplicate Warning Invalidation

If the source changes after a duplicate warning appears, the warning is cleared immediately.

This applies to changes in:

- Source URL
- Note text
- Uploaded document
- Uploaded image
- Content type

This prevents a stale duplicate warning from remaining attached to different content.

### Existing Library Backfill

Created and executed a one-time fingerprint migration for existing saved items.

All 14 existing Echo Shelf items were inspected and backfilled with deterministic source fingerprints.

This allows duplicate detection to work against content saved before the feature existed.

### Verification

Successfully tested:

- URL trailing-slash normalization
- Tracking parameter removal
- YouTube video ID preservation
- Note whitespace and casing normalization
- String hashing determinism
- File hashing determinism
- Same file with different filename
- Unique content detection
- Existing-item duplicate lookup
- Duplicate save blocking
- Save Anyway override
- Matching fingerprints across intentionally duplicated records

### Regression Verification

Existing functionality remained intact:

- Smart Capture
- Potentially Related
- Smart Connections
- Knowledge Clusters
- Contextual Rediscovery
- Library
- Post-save navigation
- Document and image uploads

Quality checks passed:

- `npm run test:duplicates`
- `npm run test:connections`
- `npm run test:clusters`
- `npm run test:rediscovery`
- `npx tsc --noEmit`
- `npm run lint`

### Design Decision

Exact duplicates are handled deterministically rather than with AI.

Echo Shelf now uses:

URL / text / file source
→ Normalize
→ SHA-256 fingerprint
→ Sanity lookup
→ Warn before save

Semantic or near-duplicate detection remains outside the current scope.


## Auth + User Ownership & Isolation

- Added Supabase authentication with:
  - Email/password
  - Google OAuth
  - GitHub OAuth
- Implemented SSR cookie-based sessions using `@supabase/ssr`.
- Added protected routes, auth callbacks, session refresh, logout, and authenticated navigation state.
- Fixed email confirmation callback handling for Supabase PKCE flows:
  - successful same-browser confirmation redirects into the app
  - missing PKCE verifier falls back cleanly to verified-login state
  - expired/reused confirmation links show the expected expired/invalid message
  - Google/GitHub OAuth callback flow remains intact
- Wiped all legacy unauthenticated Sanity test content.
- Added a Sanity `user` schema with privacy-safe ownership mapping.
- Added required `owner` references to `savedItem`, `knowledgeCluster`, and `rediscoveryResult`.
- Scoped Library, item detail, duplicate detection, Potentially Related, Smart Connections, Knowledge Clusters, and Contextual Rediscovery to the authenticated user.
- Verified cross-user isolation:
  - users only see their own data
  - cross-user item URLs are blocked
  - duplicate detection is per-user
  - cluster and rediscovery refreshes do not affect other users
- Authentication, isolation, duplicate, connection, cluster, and rediscovery tests all passed.
- TypeScript and ESLint checks passed.