// Quick test of lane resolver
import { resolveLanes, resolvePrimaryLane, getLaneConfidence } from "./src/lanes/resolver.js";

console.log("=== Lane Resolver Tests ===\n");

const queries = [
  "is it busy right now?",
  "how much does it cost?",
  "are there new businesses opening?",
  "is it busy and expensive?",
  "wait time",
  "hello"
];

for (const query of queries) {
  const lanes = resolveLanes(query);
  const primary = resolvePrimaryLane(query);
  const confidence = getLaneConfidence(query, primary);
  
  console.log(`Query: "${query}"`);
  console.log(`  Candidate lanes: ${[...lanes].join(", ")}`);
  console.log(`  Primary lane: ${primary}`);
  console.log(`  Confidence: ${(confidence * 100).toFixed(0)}%\n`);
}

console.log("✅ Resolver working");
