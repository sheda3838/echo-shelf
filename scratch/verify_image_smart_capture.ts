import fs from "fs";
import path from "path";
import { prepareImage, MAX_IMAGE_SIZE_BYTES } from "../lib/extractors/image";
import { generateSmartCaptureAction } from "../app/add/ai-actions";

// Load environment variables for Groq if available
const envLocalPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
      process.env[key.trim()] = val;
    }
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

function makeFile(buf: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buf)], name, { type });
}

async function runTests() {
  console.log("=== 1. Testing Image Preparation Unit Logic ===");

  // 1.1 Valid image preparation (PNG)
  console.log("\n[Test 1.1] Image preparation (PNG):");
  const diagramBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/docker_networking.png"));
  const resDiagram = prepareImage(diagramBuf, "docker_networking.png", "image/png");
  assert(resDiagram.success, "Preparation succeeded for PNG");
  if (resDiagram.success) {
    assert(resDiagram.data.sourceType === "image", "Source type is 'image'");
    assert(resDiagram.data.mimeType === "image/png", "MIME type is 'image/png'");
    assert(resDiagram.data.base64DataUrl.startsWith("data:image/png;base64,"), "Data URL starts with correct prefix");
    assert(resDiagram.data.size === diagramBuf.length, "Reported size matches buffer length");
  }

  // 1.2 Valid image preparation (JPG)
  console.log("\n[Test 1.2] Image preparation (JPG):");
  const sunsetBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/sunset_beach.jpg"));
  const resSunset = prepareImage(sunsetBuf, "sunset_beach.jpg", "image/jpeg");
  assert(resSunset.success, "Preparation succeeded for JPG");
  if (resSunset.success) {
    assert(resSunset.data.mimeType === "image/jpeg", "MIME type is 'image/jpeg'");
    assert(resSunset.data.base64DataUrl.startsWith("data:image/jpeg;base64,"), "Data URL starts with correct prefix");
  }

  // 1.3 Unsupported format rejection (GIF)
  console.log("\n[Test 1.3] Unsupported format rejection (GIF):");
  const resGif = prepareImage(diagramBuf, "animation.gif", "image/gif");
  assert(!resGif.success, "GIF should be rejected");
  if (!resGif.success) {
    assert(
      resGif.error === "This image format is not supported yet. Please use PNG, JPG, JPEG, or WEBP.",
      `Correct error message on unsupported format: '${resGif.error}'`
    );
  }

  // 1.4 Oversized file rejection (>10 MB)
  console.log("\n[Test 1.4] Oversized image rejection (>10 MB):");
  const oversizedBuf = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1024);
  const resOversized = prepareImage(oversizedBuf, "huge.png", "image/png");
  assert(!resOversized.success, "Oversized file should be rejected");
  if (!resOversized.success) {
    assert(
      resOversized.error === "This image is too large to analyze. Please upload an image smaller than 10 MB.",
      `Correct error message on oversized image: '${resOversized.error}'`
    );
  }

  // 1.5 Empty / invalid file rejection
  console.log("\n[Test 1.5] Empty / invalid file rejection:");
  const emptyBuf = Buffer.alloc(0);
  const resEmpty = prepareImage(emptyBuf, "empty.png", "image/png");
  assert(!resEmpty.success, "Empty file should be rejected");
  if (!resEmpty.success) {
    assert(
      resEmpty.error === "Please upload a valid image file.",
      `Correct error message on empty file: '${resEmpty.error}'`
    );
  }

  console.log("\n=== 2. Testing Direct Multimodal Understanding (Groq Vision) ===");

  // 2.1 Test A: Text-heavy diagram
  console.log("\n[Test 2.1] Test A — Text-heavy image (docker_networking.png):");
  const fdDiagram = new FormData();
  fdDiagram.append("contentType", "image");
  fdDiagram.append("sourceFile", makeFile(diagramBuf, "docker_networking.png", "image/png"));

  const actionDiagramRes = await generateSmartCaptureAction(fdDiagram);
  assert(actionDiagramRes.success, "Server Action succeeded for text-heavy image");
  if (actionDiagramRes.success && actionDiagramRes.data) {
    console.log("    Title:", actionDiagramRes.data.title);
    console.log("    Description:", actionDiagramRes.data.description);
    console.log("    Tags:", actionDiagramRes.data.tags);
    assert(Boolean(actionDiagramRes.data.title), "Title is present");
    assert(Boolean(actionDiagramRes.data.description), "Description is present");
    assert(actionDiagramRes.data.tags.length >= 3, "At least 3 tags generated");
  }

  // 2.2 Test B: Visual photo with no text
  console.log("\n[Test 2.2] Test B — Visual photo (sunset_beach.jpg):");
  const fdSunset = new FormData();
  fdSunset.append("contentType", "image");
  fdSunset.append("sourceFile", makeFile(sunsetBuf, "sunset_beach.jpg", "image/jpeg"));

  const actionSunsetRes = await generateSmartCaptureAction(fdSunset);
  assert(actionSunsetRes.success, "Server Action succeeded for visual photo");
  if (actionSunsetRes.success && actionSunsetRes.data) {
    console.log("    Title:", actionSunsetRes.data.title);
    console.log("    Description:", actionSunsetRes.data.description);
    console.log("    Tags:", actionSunsetRes.data.tags);
    assert(Boolean(actionSunsetRes.data.title), "Title is present");
    assert(Boolean(actionSunsetRes.data.description), "Description is present");
    assert(actionSunsetRes.data.tags.length >= 3, "At least 3 tags generated");
    // Verify it understands the visual scene
    const textLower = (actionSunsetRes.data.title + " " + actionSunsetRes.data.description).toLowerCase();
    const hasVisualTerm = ["sunset", "sun", "ocean", "beach", "sky", "horizon"].some((t) => textLower.includes(t));
    assert(hasVisualTerm, "Visual content recognized (sunset/ocean/beach/sky)");
  }

  // 2.3 Test C: UI screenshot
  console.log("\n[Test 2.3] Test C — UI Screenshot (ui_screenshot.png):");
  const uiBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/ui_screenshot.png"));
  const fdUi = new FormData();
  fdUi.append("contentType", "image");
  fdUi.append("sourceFile", makeFile(uiBuf, "ui_screenshot.png", "image/png"));

  const actionUiRes = await generateSmartCaptureAction(fdUi);
  assert(actionUiRes.success, "Server Action succeeded for UI screenshot");
  if (actionUiRes.success && actionUiRes.data) {
    console.log("    Title:", actionUiRes.data.title);
    console.log("    Description:", actionUiRes.data.description);
    console.log("    Tags:", actionUiRes.data.tags);
    assert(Boolean(actionUiRes.data.title), "Title is present");
  }

  // 2.4 Test D: Image with very little/no text (blank.png)
  console.log("\n[Test 2.4] Test D — Image with no text (blank.png):");
  const blankBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/blank.png"));
  const fdBlank = new FormData();
  fdBlank.append("contentType", "image");
  fdBlank.append("sourceFile", makeFile(blankBuf, "blank.png", "image/png"));

  const actionBlankRes = await generateSmartCaptureAction(fdBlank);
  // Unlike OCR which failed with "Not enough readable text", Groq Vision succeeds on blank/simple images
  assert(actionBlankRes.success, "Groq Vision handles blank/minimal images without OCR minimum-text error");
  if (actionBlankRes.success && actionBlankRes.data) {
    console.log("    Title:", actionBlankRes.data.title);
    console.log("    Description:", actionBlankRes.data.description);
    console.log("    Tags:", actionBlankRes.data.tags);
  }

  console.log("\n=== 3. Regression Checks ===");

  // 3.1 Note Smart Capture
  console.log("\n[Test 3.1] Note Smart Capture regression:");
  const noteRes = await generateSmartCaptureAction({
    contentType: "note",
    sourceText: "PostgreSQL indexing guide: Use B-Tree indexes for equality and range queries, and GIN indexes for full-text search and JSONB containment queries.",
  });
  assert(noteRes.success, "Note Smart Capture still works");
  if (noteRes.success && noteRes.data) {
    console.log("    Note Title:", noteRes.data.title);
  }

  // 3.2 Document Smart Capture (DOCX)
  console.log("\n[Test 3.2] Document Smart Capture regression (sample.docx):");
  const docxPath = path.join(__dirname, "../test_fixtures/sample.docx");
  if (fs.existsSync(docxPath)) {
    const docxBuf = fs.readFileSync(docxPath);
    const fdDocx = new FormData();
    fdDocx.append("contentType", "document");
    fdDocx.append("sourceFile", makeFile(docxBuf, "sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    const docxRes = await generateSmartCaptureAction(fdDocx);
    assert(docxRes.success, "Document Smart Capture still works");
    if (docxRes.success && docxRes.data) {
      console.log("    DOCX Title:", docxRes.data.title);
    }
  }

  // 3.3 Article / URL Smart Capture
  console.log("\n[Test 3.3] Article Smart Capture regression:");
  const articleRes = await generateSmartCaptureAction({
    contentType: "article",
    sourceText: "Rust concurrency model: Fearless concurrency achieved through ownership and type system guarantees. Threads are isolated unless shared via thread-safe abstractions like Arc and Mutex.",
  });
  assert(articleRes.success, "Article Smart Capture still works");

  // 3.4 Repo Smart Capture
  console.log("\n[Test 3.4] Repository Smart Capture regression:");
  const repoRes = await generateSmartCaptureAction({
    contentType: "repo",
    sourceUrl: "https://github.com/facebook/react",
  });
  assert(repoRes.success, "Repository Smart Capture still works");
  if (repoRes.success && repoRes.data) {
    console.log("    Repo Title:", repoRes.data.title);
  }

  // 3.5 YouTube Smart Capture
  console.log("\n[Test 3.5] YouTube Smart Capture regression:");
  const ytRes = await generateSmartCaptureAction({
    contentType: "video",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  assert(ytRes.success, "YouTube Smart Capture still works");
  if (ytRes.success && ytRes.data) {
    console.log("    YouTube Title:", ytRes.data.title);
  }

  console.log("\n🎉 ALL TESTS AND REGRESSIONS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
