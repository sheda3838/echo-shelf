import fs from "fs";
import path from "path";
import { extractImage, MAX_IMAGE_SIZE_BYTES } from "../lib/extractors/image";
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

async function runTests() {
  console.log("=== 1. Testing Image Extractor Unit Logic ===");

  // 1.1 Diagram screenshot (PNG)
  console.log("\n[Test 1.1] Diagram screenshot PNG extraction:");
  const diagramBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/docker_networking.png"));
  const resDiagram = await extractImage(diagramBuf, "docker_networking.png", "image/png");
  assert(resDiagram.success, "Extraction succeeded for diagram PNG");
  if (resDiagram.success) {
    assert(resDiagram.data.sourceType === "image", "Source type is 'image'");
    assert(resDiagram.data.text.includes("Docker"), "Extracted text contains 'Docker'");
    assert(typeof resDiagram.data.ocrConfidence === "number", "Confidence is a number");
    console.log("    Extracted text sample:", JSON.stringify(resDiagram.data.text.slice(0, 80)));
    console.log("    Confidence:", resDiagram.data.ocrConfidence);
  }

  // 1.2 Infographic Card (JPG)
  console.log("\n[Test 1.2] Infographic card JPG extraction:");
  const jpgBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/infographic_card.jpg"));
  const resJpg = await extractImage(jpgBuf, "infographic_card.jpg", "image/jpeg");
  assert(resJpg.success, "Extraction succeeded for JPG");
  if (resJpg.success) {
    assert(resJpg.data.text.toLowerCase().includes("echo shelf"), "Extracted text contains 'Echo Shelf'");
    console.log("    Extracted text sample:", JSON.stringify(resJpg.data.text.slice(0, 80)));
  }

  // 1.3 Photo / Blank image (Insufficient text)
  console.log("\n[Test 1.3] Blank / low-text image threshold:");
  const blankBuf = fs.readFileSync(path.join(__dirname, "../test_fixtures/blank.png"));
  const resBlank = await extractImage(blankBuf, "blank.png", "image/png");
  assert(!resBlank.success, "Blank image should fail extraction");
  if (!resBlank.success) {
    assert(
      resBlank.error === "Not enough readable text was found in this image. Add a description manually.",
      `Correct error message on blank image: '${resBlank.error}'`
    );
  }

  // 1.4 Unsupported format (GIF)
  console.log("\n[Test 1.4] Unsupported format rejection (GIF):");
  const resGif = await extractImage(diagramBuf, "animation.gif", "image/gif");
  assert(!resGif.success, "GIF should be rejected");
  if (!resGif.success) {
    assert(
      resGif.error === "This image format is not supported yet. Please use PNG, JPG, JPEG, or WEBP.",
      `Correct error message on unsupported format: '${resGif.error}'`
    );
  }

  // 1.5 Oversized file rejection
  console.log("\n[Test 1.5] Oversized image rejection (>10 MB):");
  const oversizedBuf = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1024);
  const resOversized = await extractImage(oversizedBuf, "huge.png", "image/png");
  assert(!resOversized.success, "Oversized file should be rejected");
  if (!resOversized.success) {
    assert(
      resOversized.error === "This image is too large to analyze. Please upload an image smaller than 10 MB.",
      `Correct error message on oversized image: '${resOversized.error}'`
    );
  }

  // 1.6 Invalid / Empty file rejection
  console.log("\n[Test 1.6] Empty / invalid file rejection:");
  const emptyBuf = Buffer.alloc(0);
  const resEmpty = await extractImage(emptyBuf, "empty.png", "image/png");
  assert(!resEmpty.success, "Empty file should be rejected");
  if (!resEmpty.success) {
    assert(
      resEmpty.error === "Please upload a valid image file.",
      `Correct error message on empty file: '${resEmpty.error}'`
    );
  }

  console.log("\n=== 2. Testing End-to-End Server Action with Groq ===");

  // Helper to create a File object
  function makeFile(buf: Buffer, name: string, type: string): File {
    return new File([new Uint8Array(buf)], name, { type });
  }

  // 2.1 Full Image Smart Capture via FormData
  console.log("\n[Test 2.1] Server Action call with docker_networking.png:");
  const imageFile = makeFile(diagramBuf, "docker_networking.png", "image/png");
  const fdImage = new FormData();
  fdImage.append("contentType", "image");
  fdImage.append("sourceFile", imageFile);

  const actionRes = await generateSmartCaptureAction(fdImage);
  assert(actionRes.success, "Server Action succeeded for image");
  if (actionRes.success && actionRes.data) {
    console.log("    Generated Title:", actionRes.data.title);
    console.log("    Generated Description:", actionRes.data.description);
    console.log("    Generated Tags:", actionRes.data.tags);
    assert(Boolean(actionRes.data.title), "Title is present");
    assert(Boolean(actionRes.data.description), "Description is present");
    assert(actionRes.data.tags.length >= 3, "At least 3 tags generated");
  }

  // 2.2 Server Action with Blank Image (Safe error propagation)
  console.log("\n[Test 2.2] Server Action call with blank image:");
  const blankFile = makeFile(blankBuf, "blank.png", "image/png");
  const fdBlank = new FormData();
  fdBlank.append("contentType", "image");
  fdBlank.append("sourceFile", blankFile);

  const actionBlankRes = await generateSmartCaptureAction(fdBlank);
  assert(!actionBlankRes.success, "Blank image Server Action should fail safely");
  assert(
    actionBlankRes.message === "Not enough readable text was found in this image. Add a description manually.",
    `Server Action preserved safe message: '${actionBlankRes.message}'`
  );

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
    console.log("    Note Tags:", noteRes.data.tags);
  }

  // 3.2 Document Smart Capture regression (DOCX)
  console.log("\n[Test 3.2] Document Smart Capture regression (sample.docx):");
  const docxPath = path.join(__dirname, "../test_fixtures/sample.docx");
  if (fs.existsSync(docxPath)) {
    const docxBuf = fs.readFileSync(docxPath);
    const docxFile = makeFile(docxBuf, "sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const fdDocx = new FormData();
    fdDocx.append("contentType", "document");
    fdDocx.append("sourceFile", docxFile);
    const docxRes = await generateSmartCaptureAction(fdDocx);
    assert(docxRes.success, "Document Smart Capture still works");
    if (docxRes.success && docxRes.data) {
      console.log("    DOCX Title:", docxRes.data.title);
    }
  }

  // 3.3 Article / URL Smart Capture regression
  console.log("\n[Test 3.3] Article Smart Capture regression:");
  const articleRes = await generateSmartCaptureAction({
    contentType: "article",
    sourceText: "Rust concurrency model: Fearless concurrency achieved through ownership and type system guarantees. Threads are isolated unless shared via thread-safe abstractions like Arc and Mutex.",
  });
  assert(articleRes.success, "Article Smart Capture still works");

  // 3.4 Repo Smart Capture regression
  console.log("\n[Test 3.4] Repository Smart Capture regression:");
  const repoRes = await generateSmartCaptureAction({
    contentType: "repo",
    sourceUrl: "https://github.com/facebook/react",
  });
  assert(repoRes.success, "Repository Smart Capture still works");
  if (repoRes.success && repoRes.data) {
    console.log("    Repo Title:", repoRes.data.title);
  }

  // 3.5 YouTube Smart Capture regression
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
