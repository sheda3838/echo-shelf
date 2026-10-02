import fs from "fs";
import path from "path";
import { createClient } from "next-sanity";

// Load .env.local variables when run standalone via tsx/node
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const token = process.env.SANITY_API_WRITE_TOKEN;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2026-09-27";

if (!projectId || !dataset) {
  console.error("Missing Sanity configuration: NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET");
  process.exit(1);
}

if (!token) {
  console.error("Missing Sanity write token: SANITY_API_WRITE_TOKEN is required to seed items");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

import { getSanityUserId } from "../lib/auth/echoUser";

export const SEED_USER_SUPABASE_ID = "seed-test-user";
export const SEED_USER_SANITY_ID = getSanityUserId(SEED_USER_SUPABASE_ID);

export interface SeedItem {
  _id: string;
  _type: "savedItem";
  owner?: {
    _type: "reference";
    _ref: string;
  };
  title: string;
  description: string;
  contentType: "note";
  source: {
    text: string;
  };
  tags: string[];
  savedAt: string;
  isFavorite: boolean;
}

export const SEED_ITEMS: SeedItem[] = [
  // ----------------------------------------------------
  // Group A — Containers / DevOps (Items 1 to 4)
  // ----------------------------------------------------
  {
    _id: "seed-smart-connections-docker-networking-basics",
    _type: "savedItem",
    title: "Docker Networking Basics",
    description:
      "An overview of Docker networking architecture, detailing how the default bridge network enables container-to-container communication while preserving host isolation.",
    contentType: "note",
    source: {
      text: "Docker provides several network drivers including bridge, host, overlay, and macvlan. The default bridge network is created automatically on the Docker host. Containers connected to the same bridge network can communicate via IP addresses, while custom user-defined bridges provide automatic DNS resolution between container names. Isolation is enforced through iptables rules and Linux network namespaces.",
    },
    tags: ["docker", "networking", "containers", "bridge-network"],
    savedAt: "2026-09-20T10:00:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-container-port-mapping",
    _type: "savedItem",
    title: "Container Port Mapping",
    description:
      "Practical guide on forwarding network traffic between Docker host ports and container internal ports using the -p and -P flags.",
    contentType: "note",
    source: {
      text: "Container port mapping binds a port on the host network interface to a specific listening port inside a container. Using the `-p <host-port>:<container-port>` flag tells the Docker daemon to configure NAT forwarding rules. This allows external clients to access services running inside isolated containers without exposing the entire container network stack.",
    },
    tags: ["docker", "containers", "ports", "networking"],
    savedAt: "2026-09-20T14:30:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-kubernetes-service-discovery",
    _type: "savedItem",
    title: "Kubernetes Service Discovery",
    description:
      "Explains how Kubernetes Services and CoreDNS allow pods to dynamically discover and communicate with other microservices across the cluster.",
    contentType: "note",
    source: {
      text: "In Kubernetes, pods are ephemeral and their IP addresses change frequently. A Service resource provides a stable virtual IP address and DNS name that routes traffic across a dynamic set of pods identified by label selectors. CoreDNS resolves standard service names like `<service-name>.<namespace>.svc.cluster.local`, abstracting pod lifecycle changes from consumers.",
    },
    tags: ["kubernetes", "services", "networking", "containers"],
    savedAt: "2026-09-21T09:15:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-github-actions-ci-cd",
    _type: "savedItem",
    title: "GitHub Actions CI/CD",
    description:
      "Overview of constructing automated continuous integration and deployment pipelines using GitHub Actions workflows, triggers, and containerized runner steps.",
    contentType: "note",
    source: {
      text: "GitHub Actions enables workflow automation directly from git repository events such as push, pull_request, or scheduled cron triggers. Workflows define jobs containing sequential steps that execute in virtual environments or inside specified Docker containers. Secret management, artifact caching, and matrix builds help streamline testing and automated deployments to cloud targets.",
    },
    tags: ["github-actions", "ci-cd", "automation", "devops"],
    savedAt: "2026-09-21T16:45:00.000Z",
    isFavorite: false,
  },

  // ----------------------------------------------------
  // Group B — Web Development (Items 5 to 8)
  // ----------------------------------------------------
  {
    _id: "seed-smart-connections-nextjs-server-actions",
    _type: "savedItem",
    title: "Next.js Server Actions",
    description:
      "In-depth reference for defining and invoking asynchronous server functions directly from React components and HTML form submissions.",
    contentType: "note",
    source: {
      text: "Server Actions are asynchronous functions declared with the 'use server' directive that execute securely on the server. They eliminate the boilerplate of creating separate API route handlers for basic data mutations. Server Actions integrate seamlessly with HTML forms, support progressive enhancement when JavaScript is disabled, and work in tandem with revalidatePath and revalidateTag for cache invalidation.",
    },
    tags: ["nextjs", "server-actions", "react", "backend"],
    savedAt: "2026-09-22T11:00:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-react-server-components",
    _type: "savedItem",
    title: "React Server Components",
    description:
      "Exploration of React Server Components (RSC), explaining how rendering components on the server reduces client bundle sizes and keeps sensitive logic off the browser.",
    contentType: "note",
    source: {
      text: "React Server Components run exclusively on the server and never ship their JavaScript dependencies to the client bundle. This paradigm enables direct database and backend system access right from components, improving initial page load performance and reducing bundle sizes. Client components are demarcated using 'use client' to establish interactive boundaries where event listeners and browser state reside.",
    },
    tags: ["react", "server-components", "nextjs", "frontend"],
    savedAt: "2026-09-22T15:20:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-sanity-groq-queries",
    _type: "savedItem",
    title: "Sanity GROQ Queries",
    description:
      "Cheat sheet and guide for querying structured content from the Sanity Content Lake using the GROQ query language.",
    contentType: "note",
    source: {
      text: "GROQ (Graph-Relational Object Queries) is a powerful, expressive query language designed for filtering and projecting JSON documents in Sanity. Key features include document type filters like *[_type == 'savedItem'], projection brackets to shape the return structure, dereferencing with the -> operator, array slicing, and ordering with order(_createdAt desc).",
    },
    tags: ["sanity", "groq", "cms", "queries"],
    savedAt: "2026-09-23T08:30:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-rest-api-route-design",
    _type: "savedItem",
    title: "REST API Route Design",
    description:
      "Best practices for designing predictable, resource-oriented RESTful endpoints using standard HTTP verbs, status codes, and JSON schemas.",
    contentType: "note",
    source: {
      text: "Well-architected REST APIs structure endpoints around plural nouns representing resources, such as /items or /users/{id}. They employ standard HTTP verbs (GET for retrieval, POST for creation, PUT/PATCH for updates, DELETE for removal) and return accurate HTTP status codes (200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Internal Error) with consistent JSON error bodies.",
    },
    tags: ["api", "rest", "backend", "http"],
    savedAt: "2026-09-23T13:45:00.000Z",
    isFavorite: false,
  },

  // ----------------------------------------------------
  // Group C — Knowledge / AI (Items 9 to 12)
  // ----------------------------------------------------
  {
    _id: "seed-smart-connections-personal-knowledge-management",
    _type: "savedItem",
    title: "Personal Knowledge Management",
    description:
      "Core methodologies for capturing, organizing, and resurfacing ideas and research to build an effective second brain.",
    contentType: "note",
    source: {
      text: "Personal Knowledge Management (PKM) focuses on systematizing how individuals curate and synthesize digital information. Effective systems emphasize low-friction capture, semantic categorization via tags or clusters, and regular resurfacing mechanisms to turn passive bookmarking into active comprehension and creative output.",
    },
    tags: ["knowledge-management", "notes", "productivity", "learning"],
    savedAt: "2026-09-24T10:10:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-ai-assisted-metadata-generation",
    _type: "savedItem",
    title: "AI-Assisted Metadata Generation",
    description:
      "How large language models can automatically extract concise titles, objective summaries, and indexable tags from diverse unstructured source materials.",
    contentType: "note",
    source: {
      text: "AI-assisted metadata extraction uses prompt-engineered language models to parse incoming articles, transcripts, notes, and visual documents. By constraining the model output to structured JSON schemas with specific length and deduplication rules, personal knowledge tools can drastically reduce the manual cognitive burden of indexing content without sacrificing searchability.",
    },
    tags: ["ai", "metadata", "automation", "knowledge-management"],
    savedAt: "2026-09-24T14:50:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-knowledge-graph-fundamentals",
    _type: "savedItem",
    title: "Knowledge Graph Fundamentals",
    description:
      "Overview of nodes, edges, and semantic triples used to model complex interconnected information networks and discover hidden associations.",
    contentType: "note",
    source: {
      text: "A knowledge graph represents real-world entities as nodes and their relationships as directional edges, often formalized as semantic triples (subject-predicate-object). Unlike flat relational tables, graph structures naturally support multi-hop queries, cluster detection, and associative exploration, making them ideal for understanding how discrete concepts relate to one another.",
    },
    tags: ["knowledge-graph", "relationships", "semantic", "knowledge-management"],
    savedAt: "2026-09-25T09:20:00.000Z",
    isFavorite: false,
  },
  {
    _id: "seed-smart-connections-semantic-search-concepts",
    _type: "savedItem",
    title: "Semantic Search Concepts",
    description:
      "Introduction to vector embeddings, high-dimensional cosine similarity, and meaning-based retrieval compared to traditional lexical keyword matching.",
    contentType: "note",
    source: {
      text: "Semantic search transforms text documents and search queries into high-dimensional numerical vectors (embeddings) generated by neural networks. By computing geometric proximity (such as cosine similarity) between vectors, the search engine retrieves results based on contextual intent and semantic meaning rather than exact keyword overlap, effectively bridging synonyms and conceptual parallels.",
    },
    tags: ["semantic-search", "similarity", "embeddings", "ai"],
    savedAt: "2026-09-25T16:00:00.000Z",
    isFavorite: false,
  },
];

async function seedSmartConnections() {
  console.log(`Connecting to Sanity project: ${projectId} (dataset: ${dataset})...`);
  console.log(`Seeding test user: ${SEED_USER_SANITY_ID}...`);
  await client.createIfNotExists({
    _id: SEED_USER_SANITY_ID,
    _type: "user",
    displayName: "Echo Shelf Test User",
    createdAt: new Date().toISOString(),
  });

  console.log(`Seeding ${SEED_ITEMS.length} Smart Connections test items with deterministic IDs and owner...\n`);

  let successCount = 0;

  for (const item of SEED_ITEMS) {
    try {
      // createOrReplace ensures duplicate-safe, idempotent execution with owner
      await client.createOrReplace({
        ...item,
        owner: {
          _type: "reference",
          _ref: SEED_USER_SANITY_ID,
        },
      });
      successCount++;
      console.log(`  ✓ [${item.contentType}] ${item.title}`);
      console.log(`    ID: ${item._id}`);
      console.log(`    Tags: ${item.tags.join(", ")}`);
    } catch (err) {
      console.error(`  ✗ Failed to seed item: ${item.title}`, err);
    }
  }

  console.log(`\nSuccessfully seeded ${successCount} / ${SEED_ITEMS.length} items in Sanity.`);

  // Verification query
  console.log("\nVerifying seeded items from Sanity Content Lake...");
  const query = `*[_type == "savedItem" && _id match "seed-smart-connections*"] | order(savedAt asc) {
    _id,
    title,
    contentType,
    "hasSourceText": defined(source.text),
    "descriptionLength": length(description),
    tags,
    savedAt
  }`;

  const verified: Array<{
    _id: string;
    title: string;
    contentType: string;
    hasSourceText: boolean;
    descriptionLength: number;
    tags: string[];
    savedAt: string;
  }> = await client.fetch(query);

  console.log(`Found ${verified.length} seeded records in dataset:\n`);
  console.log(
    "| Index | ID | Title | Tags |"
  );
  console.log(
    "| :---: | :--- | :--- | :--- |"
  );
  verified.forEach((doc, idx) => {
    console.log(
      `| ${idx + 1} | \`${doc._id}\` | **${doc.title}** | ${doc.tags.join(", ")} |`
    );
  });

  if (verified.length === SEED_ITEMS.length) {
    console.log("\n✅ All 12 items verified in Sanity with exact deterministic IDs!");
  } else {
    console.warn(`\n⚠️ Expected ${SEED_ITEMS.length} items, but found ${verified.length}.`);
  }
}

// Execute when run directly
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/seed-smart-connections.ts')) {
  seedSmartConnections().catch((err) => {
    console.error("Fatal error during seeding:", err);
    process.exit(1);
  });
}
