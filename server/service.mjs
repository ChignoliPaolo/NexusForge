import { randomUUID } from 'node:crypto';
import { getScenario } from './scenarios.mjs';
import { simulate, localAssessment } from './engine.mjs';
import { ingestEvidence } from './evidence.mjs';
import { getSample } from './samples.mjs';
import { simulateEvidence } from './decision.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export function createService(store, integrations) {
  const approving = new Set();
  const resolveEvidence = input => {
    if (!input.caseId) return null;
    if (typeof input.caseId !== 'string' || input.caseId.length > 100) fail('Invalid evidence case ID.');
    const evidence = store.case?.(input.caseId) || getSample(input.caseId);
    if (!evidence) fail('Evidence case not found.', 404);
    if (input.scenarioId && input.scenarioId !== evidence.scenarioId) fail('Evidence family does not match the selected scenario.');
    return evidence;
  };
  return {
    intake(input) {
      const evidence = { ...ingestEvidence(input), id: randomUUID() };
      store.saveCase(evidence);
      store.audit('evidence.ingested', { caseId: evidence.id, provenance: evidence.provenance, rowCount: evidence.telemetry.rowCount, planningFields: Object.keys(evidence.planning.fields) });
      return evidence;
    },
    preview(input) {
      const evidence = resolveEvidence(input);
      return evidence ? simulateEvidence(evidence, input.assumptions, input.constraints) : simulate(input.scenarioId, input.assumptions);
    },
    async investigate(input) {
      const { scenarioId, mode = 'demo', assumptions = {}, note = '' } = input;
      if (!['demo', 'live'].includes(mode)) fail('Mode must be demo or live.');
      if (typeof note !== 'string' || note.length > 2000) fail('Operator note must be at most 2000 characters.');
      const evidence = resolveEvidence(input);
      let simulation = evidence ? simulateEvidence(evidence, assumptions, input.constraints) : simulate(scenarioId, assumptions);
      let scenario = simulation.scenario || getScenario(scenarioId);
      const started = Date.now();
      let assessment = localAssessment(scenario);
      assessment.recommendedPlanId = simulation.recommendedId;
      const blocks = [];
      if (mode === 'live') {
        const results = await Promise.allSettled([integrations.knowledge(scenario), integrations.extract(scenario)]);
        for (const [index, result] of results.entries()) {
          blocks.push({ name: index === 0 ? 'Knowledge library' : 'Document extractor', status: result.status === 'fulfilled' ? 'completed' : 'unavailable', detail: result.status === 'fulfilled' ? 'Provider response validated' : result.reason.message });
        }
        if (results[1].status === 'fulfilled' && evidence) {
          const fields = results[1].value.planningFields;
          if (fields && Object.keys(fields).length) {
            simulation = simulateEvidence(evidence, assumptions, input.constraints, fields);
            scenario = simulation.scenario;
          } else {
            blocks[1] = { name: 'Document extractor', status: 'unavailable', detail: 'No source-validated planning fields returned. Live dispatch remains blocked.' };
          }
        }
        if (results[0].status === 'fulfilled') scenario.evidence.push(...results[0].value);
        if (results[1].status === 'fulfilled') scenario.extractedIncident = results[1].value;
        assessment = await integrations.assess(scenario, simulation, note);
        if (results[1].status === 'fulfilled') assessment.extractedIncident = results[1].value;
      } else {
        blocks.push({ name: 'Knowledge library', status: 'demo', detail: 'Local synthetic evidence; no Evolus call' }, { name: 'Document extractor', status: 'demo', detail: 'Local structured fixture; no Evolus call' });
      }
      if (mode === 'demo' && simulation.reasoning) assessment.rationale = `${simulation.reasoning.label}. Only feasible interventions are ranked. The preferred action follows the uploaded observations, source-extracted planning fields, declared constraints, and diagnostic result—not a fixed scenario label.`;
      const value = { id: randomUUID(), createdAt: new Date().toISOString(), scenarioId: scenario.id, caseId: evidence?.id || null, inputEvidence: evidence || null, mode, status: 'review_required', scenario, simulation, assessment, blocks, note, elapsedMs: Date.now() - started };
      store.saveInvestigation(value);
      store.audit('investigation.created', { investigationId: value.id, scenarioId, mode, provider: assessment.provider, model: assessment.model });
      return value;
    },
    async approve(input) {
      const { investigationId, planId, reviewer, checks } = input;
      if (typeof investigationId !== 'string' || investigationId.length > 100 || typeof planId !== 'string') fail('A valid investigation and plan are required.');
      if (typeof reviewer !== 'string' || reviewer.trim().length < 2 || reviewer.length > 100) fail('Enter the reviewing operator’s name (2–100 characters).');
      const investigation = store.investigation(investigationId);
      if (!investigation) fail('Investigation not found.', 404);
      const plan = investigation.simulation.plans.find(candidate => candidate.id === planId);
      if (!plan) fail('The selected plan is not part of this investigation.');
      if (plan.feasible === false) fail(`This intervention is blocked: ${plan.blockedReasons.join(' ')}`, 409);
      if (!Array.isArray(checks) || checks.length !== plan.checks.length || checks.some(value => value !== true)) fail('Every human-review check must be acknowledged.');
      const existing = store.orderFor(investigationId);
      if (existing) {
        if (existing.planId !== planId) fail('This investigation already has a different approved plan.', 409);
        return existing;
      }
      if (approving.has(investigationId)) fail('Approval is already in progress.', 409);
      if (investigation.mode === 'live' && process.env.ALLOW_LIVE_WORKFLOW_DISPATCH !== 'true' && investigation.blocks.some(block => block.status !== 'completed')) fail('Live dispatch is blocked: both Evolus evidence and extraction must complete successfully. Resolve integration setup and run a new investigation.', 409);
      approving.add(investigationId);
      const order = { id: `NF-${randomUUID().slice(0, 8).toUpperCase()}`, investigationId, planId, scenarioId: investigation.scenarioId, plan: plan.name, reviewer: reviewer.trim(), checks: [...plan.checks], createdAt: new Date().toISOString(), status: investigation.mode === 'demo' ? 'demo_approved' : 'pending', mode: investigation.mode, projectedSavings: plan.savings, cost: plan.cost, minutes: plan.downtime, part: plan.part };
      try {
        store.saveOrder(order);
        store.audit('approval.recorded', { orderId: order.id, reviewer: order.reviewer, mode: order.mode, planId });
        if (investigation.mode === 'live') {
          try {
            const response = await integrations.dispatch(order, order.id);
            order.status = 'submitted';
            order.providerReference = String(response.executionId ?? response.jobId ?? response.id ?? response.run_id ?? 'Provider accepted; completion not verified').slice(0, 200);
          } catch (error) {
            order.status = 'dispatch_unconfirmed';
            order.error = error.message;
          }
          store.saveOrder(order);
          store.audit(`workflow.${order.status}`, { orderId: order.id, status: order.status });
        }
        investigation.status = order.status;
        store.saveInvestigation(investigation);
        return order;
      } finally { approving.delete(investigationId); }
    }
  };
}
