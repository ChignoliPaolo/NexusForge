import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from '../server/config.mjs';
import { runEvaluation } from '../server/evaluation.mjs';
import { sampleCases } from '../server/samples.mjs';
import { simulateEvidence } from '../server/decision.mjs';

const directory = resolve(projectRoot, 'evidence');
mkdirSync(directory, { recursive: true });
mkdirSync(resolve(projectRoot, 'samples'), { recursive: true });
const result = runEvaluation();
const confirmed = simulateEvidence(sampleCases[0], {}, { testResult: 'leak_confirmed' });
writeFileSync(resolve(directory, 'decision-evaluation.json'), JSON.stringify(result, null, 2));
writeFileSync(resolve(directory, 'demo-comparison.json'), JSON.stringify(confirmed, null, 2));
for (const sample of sampleCases) {
  writeFileSync(resolve(projectRoot, 'samples', `${sample.id}.csv`), sample.csv);
  writeFileSync(resolve(projectRoot, 'samples', `${sample.id}.md`), sample.document);
}
console.log(`${result.passed}/${result.total} synthetic decision contracts passed. ${result.elapsedMs} ms local CPU execution.`);
console.log('Not a field-accuracy or GPU benchmark. Receipts in evidence/; reproducible inputs in samples/.');
if (result.passed !== result.total) process.exitCode = 1;
