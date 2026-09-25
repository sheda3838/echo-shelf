# Echo Shelf — Project Plan

## Project Idea

Echo Shelf is a personal knowledge-resurfacing app that helps users save useful content, organize it intelligently, rediscover forgotten information, and reconnect it with what matters now.

The core idea is:

**Capture → Connect → Resurface**

Instead of acting like a normal bookmark manager where saved content is forgotten over time, Echo Shelf uses structured content stored in Sanity and AI-powered analysis through Groq to bring useful knowledge back when it becomes relevant.

## Problem

People constantly save useful content from different places such as:

- Articles
- YouTube videos
- GitHub repositories
- Screenshots
- Notes
- Code snippets
- Social media posts
- PDFs
- Learning resources

The problem is that most of this content is rarely revisited.

Traditional bookmarking tools are good at storing information, but they usually do not help users:

- understand what they saved
- avoid saving duplicates
- connect related knowledge
- rediscover old content
- understand how old knowledge relates to current topics

## Target Users

Echo Shelf is mainly designed for:

- Developers
- Students
- Researchers
- Lifelong learners
- People who regularly save useful online content

## Core Features

### 1. Smart Capture

When saving new content, the user first provides the source material.

Supported source types may include:

- Source URL
- Image or screenshot
- PDF/document
- Plain text or notes
- Other supported media

Echo Shelf analyzes the provided source and uses AI to suggest structured metadata such as:

- Title
- Description
- Summary
- Topic
- Tags
- Keywords

The AI-generated suggestions are shown to the user before saving.

The user can:

- Accept the suggestions
- Edit any generated field
- Add additional information manually
- Remove incorrect suggestions

Once confirmed, the structured item is stored in Sanity Content Lake.

### 2. Smart Connections

When a new item is saved, Echo Shelf checks existing saved content.

Relevant structured content is sent to Groq so it can identify meaningful relationships between the new item and older saved items.

Example:

> This AWS ECS note connects to the Docker networking article you saved three months ago because both relate to container networking and deployment.

### 3. Contextual Rediscovery

When the user visits the application, Echo Shelf can retrieve current or trending topics from an external source.

Groq compares those topics with the user's saved knowledge.

If a meaningful connection exists, Echo Shelf resurfaces the relevant saved content.

Example:

> Container deployment is trending today. You previously saved an article about Docker networking that may be useful again.

This makes rediscovery context-aware instead of random.

### 4. Duplicate Prevention

Before saving a new item, Echo Shelf checks existing saved content for similar or near-duplicate entries.

Groq can compare:

- Titles
- Summaries
- Topics
- Tags
- Keywords

If a likely duplicate exists, the user receives a warning before saving.

Example:

> You may already have something similar saved.

The user can then open the existing item or continue saving the new one.

### 5. Knowledge Clusters

Echo Shelf groups related saved content into useful knowledge themes.

Examples:

- DevOps
- AWS
- AI
- Frontend
- Backend
- Career
- Cloud

Groq can help identify and name these clusters based on the user's saved content.

This allows users to understand how their saved knowledge is organized and connected.

## Main User Flow

### Saving Content

User adds content
↓
Echo Shelf collects text/metadata
↓
Groq suggests structured metadata
↓
User reviews and edits suggestions
↓
Duplicate check runs
↓
Content is saved to Sanity
↓
Related existing items are identified

### Rediscovery

User opens Echo Shelf
↓
Current/trending topics are retrieved
↓
Relevant saved content is fetched from Sanity
↓
Groq compares current topics with saved knowledge
↓
Relevant forgotten items are resurfaced

## MVP Features

The first version will include:

- Add a saved item
- AI-assisted metadata suggestions
- Editable AI suggestions
- Store structured content in Sanity
- View all saved items
- View individual item details
- Search and filter saved content
- Duplicate detection
- AI-generated related-item connections
- Knowledge clusters
- Rediscovery section
- Responsive Next.js interface

## Stretch Features

If time allows:

- Visual knowledge graph
- Smart recommendations based on recent user activity
- Better trending-topic integration
- Favorite/pinned items
- Usage history
- More advanced cluster visualization

## Technology Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS

### Content Backend
- Sanity
- Sanity Content Lake
- GROQ
- Sanity Studio

### AI
- Groq API

### Deployment
- Vercel

## High-Level Architecture

User
↓
Next.js Interface
↓
Sanity Client
↓
Sanity Content Lake

AI-powered features:

Sanity structured content
↓
Next.js backend/API route
↓
Groq API
↓
AI analysis
↓
Result returned to the frontend

## Role of Each Technology

### Next.js
Handles the user interface, application logic, API routes, and interaction flow.

### Sanity
Acts as the structured content backend.

Sanity stores the user's saved knowledge as structured documents inside Content Lake.

### GROQ
Queries structured content stored inside Sanity Content Lake.

### Groq AI
Provides the intelligence layer for:

- metadata generation
- content connections
- contextual rediscovery
- duplicate detection
- knowledge clustering

## Project Goal

Echo Shelf should not feel like another bookmark manager.

The goal is to build a personal knowledge system that helps users:

**save smarter, remember more, and rediscover useful knowledge when it matters.**

## Tagline

**Echo Shelf — Your saved knowledge, echoed back when it matters.**