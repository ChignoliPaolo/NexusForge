import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrations } from '../server/integrations.mjs';
import { readConfig, integrationStatus } from '../server/config.mjs';
import { getScenario } from '../server/scenarios.mjs';
import { simulate } from '../server/engine.mjs';
import { getSample } from '../server/samples.mjs';
import { simulateEvidence } from '../server/decision.mjs';

const config = () => readConfig({ AMD_API_KEY: 'test-only', AMD_BASE_URL: 'https://amd.example.test/v1', AMD_DEFAULT_MODEL: 'test-model', EVOLUS_API_KEY: 'test-only', EVOLUS_APPLICATION_ID: 'test-app', EVOLUS_KNOWLEDGE_PATH: '/configured-search', EVOLUS_EXTRACTOR_PATH: '/configured-extract', EVOLUS_WORKFLOW_PATH: '/configured-workflow' });
const validAssessment = { hypothesis: 'Possible pressure leak.', rationale: 'Compare the modeled plans.', uncertainty: 'Technician verification required.', evidenceIds: ['P-01'], recommendedPlanId: 'targeted' };
const chatResponse = assessment => new Response(JSON.stringify({ model: 'returned-model', choices: [{ message: { content: JSON.stringify(assessment) } }], usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 } }));

test('provider call sends only server-side credentials and validates structured reasoning', async () => {
  const client = createIntegrations(config(), async (url, options) => {
    assert.equal(String(url), 'https://amd.example.test/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    assert.equal(options.redirect, 'error');
    assert.equal(JSON.parse(options.body).model, 'test-model');
    return chatResponse(validAssessment);
  });
  const result = await client.assess(getScenario('pressure'), simulate('pressure'));
  assert.equal(result.model, 'returned-model');
  assert.equal(result.usage.totalTokens, 120);
  assert.ok(result.latencyMs >= 0);
});

test('unknown evidence and plan IDs are rejected', async () => {
  for (const assessment of [{ ...validAssessment, evidenceIds: ['FAKE-123'] }, { ...validAssessment, recommendedPlanId: 'dangerous' }, { ...validAssessment, evidenceIds: [] }, { ...validAssessment, uncertainty: '' }]) {
    const client = createIntegrations(config(), async () => chatResponse(assessment));
    await assert.rejects(client.assess(getScenario('pressure'), simulate('pressure')));
  }
});

test('missing configuration does not call provider', async () => {
  const client = createIntegrations(readConfig({}), async () => assert.fail('Unexpected network call'));
  await assert.rejects(client.assess(getScenario('pressure'), simulate('pressure')), /Configure AMD/);
  await assert.rejects(client.knowledge(getScenario('pressure')), /not configured/);
});

test('provider errors are sanitized rather than exposing upstream response bodies', async () => {
  const client = createIntegrations(config(), async () => new Response('secret upstream token', { status: 401 }));
  await assert.rejects(client.assess(getScenario('pressure'), simulate('pressure')), error => error.message.includes('401') && !error.message.includes('secret'));
});

test('Evolus knowledge validates actual source fields', async () => {
  const client = createIntegrations(config(), async () => new Response(JSON.stringify({ results: [{ title: 'Workspace document', text: 'Retrieved text', page: 2 }] })));
  const sources = await client.knowledge(getScenario('pressure'));
  assert.equal(sources[0].id, 'LIVE-1');
  assert.equal(sources[0].section, '2');
  const invalid = createIntegrations(config(), async () => new Response(JSON.stringify({ fallback_citation: 'made up' })));
  await assert.rejects(invalid.knowledge(getScenario('pressure')), /response must contain/);
});

test('Evolus reports failed status and mismatched extraction as errors', async () => {
  const failed = createIntegrations(config(), async () => new Response(JSON.stringify({ status: 'failed' })));
  await assert.rejects(failed.dispatch({}, 'test'), /unsuccessful/);
  const mismatched = createIntegrations(config(), async () => new Response(JSON.stringify({ scenario_id: 'wrong', asset_id: 'pressure', summary: 'Wrong scenario' })));
  await assert.rejects(mismatched.extract(getScenario('pressure')), /does not match/);
});

test('endpoint paths cannot redirect credentials to a different origin', async () => {
  const settings = config();
  settings.evolus.knowledgePath = '//evil.example.test';
  const client = createIntegrations(settings, async () => assert.fail('Unexpected network call'));
  await assert.rejects(client.knowledge(getScenario('pressure')), /Invalid provider endpoint/);
});

test('public connection status never contains credentials or unmeasured GPU metrics', () => {
  const status = integrationStatus(config());
  assert.equal(status.amd.configured, true);
  assert.match(status.amd.status, /not verified/);
  assert.equal(status.telemetry.gpuUtilization, null);
  assert.ok(!JSON.stringify(status).includes('test-only'));
  assert.ok(integrationStatus(readConfig({})).amd.missing.includes('AMD_API_KEY'));
  assert.equal(integrationStatus(readConfig({ AMD_API_KEY: 'test', AMD_BASE_URL: 'https://test.example/v1' })).amd.modelDiscovery, true);
});

test('oversized and non-object provider responses are rejected', async () => {
  for (const payload of ['null', '[]', '"string"', JSON.stringify({ content: 'x'.repeat(1000001) })]) {
    const client = createIntegrations(config(), async () => new Response(payload));
    await assert.rejects(client.assess(getScenario('pressure'), simulate('pressure')), /JSON object|size limit/);
  }
});

test('authenticated model discovery is shared and cached, then used for actual assessment', async () => {
  const settings = config(); settings.amd.model = '';
  let discoveries = 0;
  const client = createIntegrations(settings, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    if (String(url).endsWith('/models')) {
      discoveries++;
      assert.equal(options.method, 'GET');
      return new Response(JSON.stringify({ data: [{ id: 'embedding-model' }, { id: 'qwen-instruct' }] }));
    }
    assert.equal(JSON.parse(options.body).model, 'qwen-instruct');
    return chatResponse(validAssessment);
  });
  assert.deepEqual(await Promise.all([client.discoverModel(), client.discoverModel()]), ['qwen-instruct', 'qwen-instruct']);
  await client.assess(getScenario('pressure'), simulate('pressure'));
  assert.equal(discoveries, 1);
});

test('Radeon shared models use documented JSON output and bounded Qwen reasoning', async () => {
  const settings = config();
  settings.amd.baseUrl = 'https://developer.amd.com.cn/radeon/api/v1';
  settings.amd.model = 'Qwen3.6-test-instruct';
  const client = createIntegrations(settings, async (url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_tokens, 2048);
    return chatResponse(validAssessment);
  });
  await client.assess(getScenario('pressure'), simulate('pressure'));
});

test('model discovery failures remain explicit and never manufacture a model ID', async () => {
  const settings = config(); settings.amd.model = '';
  const client = createIntegrations(settings, async () => new Response(JSON.stringify({ data: [] })));
  await assert.rejects(client.discoverModel(), /No chat model/);
});

test('model cannot choose a blocked plan or an unsupported diagnostic observation', async () => {
  const simulation = simulateEvidence(getSample('pressure-no-stock'), {}, { testResult: 'leak_confirmed' });
  for (const assessment of [
    { ...validAssessment, evidenceIds: ['OBS-01'] },
    { ...validAssessment, evidenceIds: ['OBS-01'], recommendedPlanId: 'inspect', nextObservationId: 'imagined-test' }
  ]) {
    const client = createIntegrations(config(), async () => chatResponse(assessment));
    await assert.rejects(client.assess(simulation.scenario, simulation), /infeasible|unsupported diagnostic/);
  }
});

test('extractor values must match source lines, not invented stock or costs', async () => {
  const scenario = simulateEvidence(getSample('pressure-leak')).scenario;
  for (const stock of [0, 15]) {
    const client = createIntegrations(config(), async () => new Response(JSON.stringify({ data: { scenario_id: scenario.id, asset_id: scenario.assetId, summary: 'Source extraction', planning_fields: { ...scenario.planningFields, stock_on_hand: stock } } })));
    if (stock === 0) await assert.rejects(client.extract(scenario), /source lines/);
    else assert.equal((await client.extract(scenario)).planningFields.stock_on_hand, 15);
  }
});
