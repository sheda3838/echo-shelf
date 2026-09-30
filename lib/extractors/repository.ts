export type ExtractedRepository = {
  sourceType: "repository";
  provider: "github" | "gitlab";
  sourceUrl: string;
  name: string;
  fullName: string;
  description?: string;
  readme?: string;
  topics?: string[];
  primaryLanguage?: string;
  defaultBranch?: string;
  homepage?: string;
  stars?: number;
};

export type RepositoryExtractionResult =
  | { success: true; data: ExtractedRepository }
  | { success: false; error: string };

/**
 * Maximum character limit for repository README content passed to Groq.
 */
export const MAX_REPOSITORY_TEXT_LENGTH = 15000;

/**
 * Network timeout for repository API requests.
 */
const REPO_FETCH_TIMEOUT_MS = 10000;

/**
 * Cleans excess whitespace and collapses multiple blank lines.
 */
function cleanWhitespace(str: string): string {
  return str
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Server-only extractor for GitHub and GitLab repositories.
 * Uses official REST APIs to retrieve metadata and README without scraping HTML.
 * Handles rate limits, private repos, nested namespaces, and missing READMEs cleanly.
 */
export async function extractRepository(
  inputUrl: string
): Promise<RepositoryExtractionResult> {
  const trimmed = inputUrl.trim();
  if (!trimmed) {
    return { success: false, error: "Please enter a valid repository URL." };
  }

  // 1. URL and Protocol Validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { success: false, error: "Please enter a valid repository URL." };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      success: false,
      error: "Please enter a valid repository URL starting with http:// or https://.",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");

  // Detect supported providers strictly
  if (hostname === "github.com") {
    return extractGitHubRepository(parsedUrl);
  } else if (hostname === "gitlab.com") {
    return extractGitLabRepository(parsedUrl);
  }

  return {
    success: false,
    error:
      "This repository provider is not supported yet. Echo Shelf currently supports GitHub and GitLab repositories.",
  };
}

/**
 * Handles GitHub repository extraction via official GitHub REST API.
 */
async function extractGitHubRepository(
  url: URL
): Promise<RepositoryExtractionResult> {
  // Parse path segments: /owner/repo/...
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return { success: false, error: "Please enter a valid repository URL." };
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");

  if (!owner || !repo) {
    return { success: false, error: "Please enter a valid repository URL." };
  }

  const canonicalUrl = `https://github.com/${owner}/${repo}`;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  // Optional server-side token for increased rate limits
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "EchoShelf-Repository-Extractor/1.0",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 1. Fetch Repository Metadata
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REPO_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      signal: controller.signal,
      headers,
      cache: "no-store",
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: "Could not access this repository (request timed out).",
      };
    }
    return {
      success: false,
      error: "Could not access this repository. Please verify the URL and try again.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle GitHub API status codes
  if (!response.ok) {
    if (response.status === 404) {
      return {
        success: false,
        error: "Repository not found. Please verify the link.",
      };
    }

    const remainingRateLimit = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && remainingRateLimit === "0")) {
      return {
        success: false,
        error: "Repository service rate limit reached. Please try again later.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: "This repository is private or requires authentication.",
      };
    }

    return {
      success: false,
      error: `Could not access this repository (HTTP ${response.status}).`,
    };
  }

  let repoData: Record<string, unknown>;
  try {
    repoData = (await response.json()) as Record<string, unknown>;
  } catch {
    return {
      success: false,
      error: "Could not parse repository metadata from GitHub.",
    };
  }

  const name = typeof repoData.name === "string" ? repoData.name : repo;
  const fullName = typeof repoData.full_name === "string" ? repoData.full_name : `${owner}/${repo}`;
  const description = typeof repoData.description === "string" ? repoData.description.trim() : undefined;
  const primaryLanguage = typeof repoData.language === "string" ? repoData.language.trim() : undefined;
  const defaultBranch = typeof repoData.default_branch === "string" ? repoData.default_branch.trim() : undefined;
  const homepage = typeof repoData.homepage === "string" && repoData.homepage.trim() ? repoData.homepage.trim() : undefined;
  const stars = typeof repoData.stargazers_count === "number" ? repoData.stargazers_count : undefined;

  let topics: string[] | undefined = undefined;
  if (Array.isArray(repoData.topics)) {
    const rawTopics = repoData.topics.filter((t): t is string => typeof t === "string");
    if (rawTopics.length > 0) {
      topics = rawTopics;
    }
  }

  // 2. Fetch README via GitHub README Endpoint
  let readme: string | undefined = undefined;
  try {
    const readmeController = new AbortController();
    const readmeTimeoutId = setTimeout(() => readmeController.abort(), REPO_FETCH_TIMEOUT_MS);

    const readmeResponse = await fetch(`${apiUrl}/readme`, {
      signal: readmeController.signal,
      headers,
      cache: "no-store",
    });
    clearTimeout(readmeTimeoutId);

    if (readmeResponse.ok) {
      const readmeData = (await readmeResponse.json()) as Record<string, unknown>;
      let rawText = "";

      if (readmeData.encoding === "base64" && typeof readmeData.content === "string") {
        rawText = Buffer.from(readmeData.content, "base64").toString("utf-8");
      } else if (typeof readmeData.content === "string") {
        rawText = readmeData.content;
      }

      const cleaned = cleanWhitespace(rawText);
      if (cleaned) {
        readme =
          cleaned.length > MAX_REPOSITORY_TEXT_LENGTH
            ? cleaned.slice(0, MAX_REPOSITORY_TEXT_LENGTH).trim() + "..."
            : cleaned;
      }
    }
  } catch {
    // Missing or failed README does not fail the repository extraction
    readme = undefined;
  }

  return {
    success: true,
    data: {
      sourceType: "repository",
      provider: "github",
      sourceUrl: canonicalUrl,
      name,
      fullName,
      description,
      readme,
      topics,
      primaryLanguage,
      defaultBranch,
      homepage,
      stars,
    },
  };
}

/**
 * Handles GitLab repository extraction via official GitLab REST API v4.
 */
async function extractGitLabRepository(
  url: URL
): Promise<RepositoryExtractionResult> {
  // Strip sub-routes like /-/tree/..., /-/issues, /-/blob/...
  const pathWithoutSubroutes = url.pathname.split("/-/")[0];
  const segments = pathWithoutSubroutes.split("/").filter(Boolean);

  if (segments.length < 2) {
    return { success: false, error: "Please enter a valid repository URL." };
  }

  // Clean .git extension from project name
  const lastIndex = segments.length - 1;
  segments[lastIndex] = segments[lastIndex].replace(/\.git$/i, "");

  const projectPath = segments.join("/");
  if (!projectPath || segments.some((s) => !s)) {
    return { success: false, error: "Please enter a valid repository URL." };
  }

  const canonicalUrl = `https://gitlab.com/${projectPath}`;
  const encodedPath = encodeURIComponent(projectPath);
  const apiUrl = `https://gitlab.com/api/v4/projects/${encodedPath}`;

  // Optional server-side token for increased rate limits or private repos
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "EchoShelf-Repository-Extractor/1.0",
  };
  const token = process.env.GITLAB_TOKEN?.trim();
  if (token) {
    headers["PRIVATE-TOKEN"] = token;
  }

  // 1. Fetch GitLab Project Metadata
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REPO_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      signal: controller.signal,
      headers,
      cache: "no-store",
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: "Could not access this repository (request timed out).",
      };
    }
    return {
      success: false,
      error: "Could not access this repository. Please verify the URL and try again.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle GitLab API status codes
  if (!response.ok) {
    if (response.status === 404) {
      return {
        success: false,
        error: "Repository not found. Please verify the link.",
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        error: "Repository service rate limit reached. Please try again later.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: "This repository is private or requires authentication.",
      };
    }

    return {
      success: false,
      error: `Could not access this repository (HTTP ${response.status}).`,
    };
  }

  let projectData: Record<string, unknown>;
  try {
    projectData = (await response.json()) as Record<string, unknown>;
  } catch {
    return {
      success: false,
      error: "Could not parse repository metadata from GitLab.",
    };
  }

  const name = typeof projectData.name === "string" ? projectData.name : segments[lastIndex];
  const fullName = typeof projectData.path_with_namespace === "string" ? projectData.path_with_namespace : projectPath;
  const description = typeof projectData.description === "string" ? projectData.description.trim() : undefined;
  const defaultBranch = typeof projectData.default_branch === "string" ? projectData.default_branch.trim() : "main";
  const stars = typeof projectData.star_count === "number" ? projectData.star_count : undefined;
  const homepage = typeof projectData.web_url === "string" && projectData.web_url.trim() ? projectData.web_url.trim() : undefined;

  // Extract topics or tag list
  let topics: string[] | undefined = undefined;
  if (Array.isArray(projectData.topics) && projectData.topics.length > 0) {
    topics = projectData.topics.filter((t): t is string => typeof t === "string");
  } else if (Array.isArray(projectData.tag_list) && projectData.tag_list.length > 0) {
    topics = projectData.tag_list.filter((t): t is string => typeof t === "string");
  }

  // 2. Fetch README
  let readme: string | undefined = undefined;
  const candidateFilenames: string[] = [];

  // Check if GitLab provided readme_url, e.g. .../-/blob/main/README.md
  if (typeof projectData.readme_url === "string") {
    const blobMatch = projectData.readme_url.split("/blob/")[1];
    if (blobMatch) {
      const parts = blobMatch.split("/");
      parts.shift(); // remove branch
      const fileName = parts.join("/");
      if (fileName) candidateFilenames.push(fileName);
    }
  }
  candidateFilenames.push("README.md", "README", "README.rst", "README.txt");

  // Try candidate files until one succeeds
  for (const filename of candidateFilenames) {
    try {
      const readmeController = new AbortController();
      const readmeTimeoutId = setTimeout(() => readmeController.abort(), REPO_FETCH_TIMEOUT_MS);

      const rawUrl = `${apiUrl}/repository/files/${encodeURIComponent(filename)}/raw?ref=${encodeURIComponent(defaultBranch)}`;
      const readmeResponse = await fetch(rawUrl, {
        signal: readmeController.signal,
        headers,
        cache: "no-store",
      });
      clearTimeout(readmeTimeoutId);

      if (readmeResponse.ok) {
        const rawText = await readmeResponse.text();
        const cleaned = cleanWhitespace(rawText);
        if (cleaned) {
          readme =
            cleaned.length > MAX_REPOSITORY_TEXT_LENGTH
              ? cleaned.slice(0, MAX_REPOSITORY_TEXT_LENGTH).trim() + "..."
              : cleaned;
          break;
        }
      }
    } catch {
      // Continue trying next candidate filename or finish without README
    }
  }

  return {
    success: true,
    data: {
      sourceType: "repository",
      provider: "gitlab",
      sourceUrl: canonicalUrl,
      name,
      fullName,
      description,
      readme,
      topics,
      defaultBranch,
      homepage,
      stars,
    },
  };
}
