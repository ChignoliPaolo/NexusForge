import { FactoryTwin } from '../frontend/twin.js';
import { assets } from '../server/scenarios.mjs';
import { getSample } from '../server/samples.mjs';
import { simulateEvidence } from '../server/decision.mjs';
import { runEvaluation } from '../server/evaluation.mjs';

const twin = Object.create(FactoryTwin.prototype);
Object.assign(twin, { width: 1000, height: 490, angle: -0.58, pitch: 0.63, zoom: 1, time: 1, assets, selected: 'pressure', scenarioId: 'pressure', layer: 'status' });
twin.build();
const sort = faces => faces.sort((first, second) => first.depth - second.depth);
const before = simulateEvidence(getSample('pressure-leak'));
const after = simulateEvidence(getSample('pressure-leak'), {}, { testResult: 'leak_confirmed' });
console.log(JSON.stringify({ geometry: [...sort(twin.floorFaces), ...sort(twin.faces)], before, after, evaluation: runEvaluation() }));
