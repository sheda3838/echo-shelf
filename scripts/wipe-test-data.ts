import { createClient } from '@sanity/client';
import fs from 'fs';
import path from 'path';

// Fallback auto-loader for .env.local when run directly with `npx tsx scripts/wipe-test-data.ts`
if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || !process.env.SANITY_API_WRITE_TOKEN) {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-02-19';
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!projectId || !dataset || !token) {
  console.error('Missing required Sanity environment variables (PROJECT_ID, DATASET, SANITY_API_WRITE_TOKEN)');
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token,
});

async function wipeTestData() {
  console.log('===============================================================');
  console.log('🧹 Echo Shelf Test Data Wipe Script');
  console.log('===============================================================\n');

  // Query existing test documents of target application types (including drafts)
  const targetTypes = ['savedItem', 'knowledgeCluster', 'rediscoveryResult'];
  
  const docsToDelete = await client.fetch<{ _id: string; _type: string; title?: string; articleTitle?: string }[]>(
    `*[_type in $targetTypes]{ _id, _type, title, articleTitle }`,
    { targetTypes }
  );

  const initialCounts = {
    savedItem: docsToDelete.filter(d => d._type === 'savedItem').length,
    knowledgeCluster: docsToDelete.filter(d => d._type === 'knowledgeCluster').length,
    rediscoveryResult: docsToDelete.filter(d => d._type === 'rediscoveryResult').length,
  };

  console.log('Initial document counts before wipe:');
  console.log(`  savedItem: ${initialCounts.savedItem}`);
  console.log(`  knowledgeCluster: ${initialCounts.knowledgeCluster}`);
  console.log(`  rediscoveryResult: ${initialCounts.rediscoveryResult}`);
  console.log(`  Total documents to delete: ${docsToDelete.length}\n`);

  if (docsToDelete.length === 0) {
    console.log('✓ No documents found to delete. Database is already clean.');
    return;
  }

  console.log('Deleting documents:');
  for (const doc of docsToDelete) {
    const label = doc.title || doc.articleTitle || '(no title)';
    console.log(`  - Deleting [${doc._type}] id: ${doc._id} ("${label}")`);
  }

  // Delete in batches of 50 to avoid request payload limits
  const batchSize = 50;
  for (let i = 0; i < docsToDelete.length; i += batchSize) {
    const batch = docsToDelete.slice(i, i + batchSize);
    const tx = client.transaction();
    for (const doc of batch) {
      tx.delete(doc._id);
    }
    await tx.commit();
  }

  console.log('\nVerifying post-wipe counts...');
  const remainingCounts = {
    savedItem: await client.fetch<number>(`count(*[_type == "savedItem"])`),
    knowledgeCluster: await client.fetch<number>(`count(*[_type == "knowledgeCluster"])`),
    rediscoveryResult: await client.fetch<number>(`count(*[_type == "rediscoveryResult"])`),
  };

  console.log('Post-wipe document counts:');
  console.log(`  savedItem: ${remainingCounts.savedItem}`);
  console.log(`  knowledgeCluster: ${remainingCounts.knowledgeCluster}`);
  console.log(`  rediscoveryResult: ${remainingCounts.rediscoveryResult}`);

  if (
    remainingCounts.savedItem === 0 &&
    remainingCounts.knowledgeCluster === 0 &&
    remainingCounts.rediscoveryResult === 0
  ) {
    console.log('\n🎉 ALL ECHO SHELF TEST CONTENT SUCCESSFULLY WIPED! (All counts = 0)');
  } else {
    console.error('\n❌ Error: Some documents still remain after wipe attempt!');
    process.exit(1);
  }
}

wipeTestData().catch((err) => {
  console.error('Wipe failed with error:', err);
  process.exit(1);
});
