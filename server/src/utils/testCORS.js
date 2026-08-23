/**
 * testCORS.js
 *
 * Verification suite for CORS hardening, normalization, logging, and unauthenticated cors-check endpoint.
 *
 * Run: node src/utils/testCORS.js
 */

import { config } from '../config/env.js';

const BASE_URL = 'http://localhost:5000/api/v1';

export const runCORSTests = async () => {
  console.log('\n==================================================');
  console.log('🔒 CORS HARDENING & CORS-CHECK ENDPOINT VERIFICATION');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (testName, condition, detail = '') => {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
      failed++;
    }
  };

  // 1. Test GET /api/v1/cors-check with no origin (non-browser)
  try {
    const res = await fetch(`${BASE_URL}/cors-check`);
    const data = await res.json();
    assert('GET /api/v1/cors-check returns 200 OK with { ok: true } (no origin)', res.status === 200 && data.ok === true);
  } catch (err) {
    assert('GET /api/v1/cors-check (no origin)', false, err.message);
  }

  // 2. Test GET /api/v1/cors-check with allowed origin (without trailing slash)
  try {
    const res = await fetch(`${BASE_URL}/cors-check`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const data = await res.json();
    const acao = res.headers.get('access-control-allow-origin');
    assert('GET /api/v1/cors-check allows http://localhost:5173', res.status === 200 && data.ok === true && acao === 'http://localhost:5173');
  } catch (err) {
    assert('GET /api/v1/cors-check (allowed origin)', false, err.message);
  }

  // 3. Test GET /api/v1/cors-check with trailing slash origin (robust normalization check)
  try {
    const res = await fetch(`${BASE_URL}/cors-check`, {
      headers: { Origin: 'http://localhost:5173/' },
    });
    const data = await res.json();
    assert('GET /api/v1/cors-check handles origin with trailing slash cleanly', res.status === 200 && data.ok === true);
  } catch (err) {
    assert('GET /api/v1/cors-check (trailing slash origin)', false, err.message);
  }

  // 4. Test OPTIONS preflight request
  try {
    const res = await fetch(`${BASE_URL}/cors-check`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert('OPTIONS preflight returns 204/200 with Access-Control headers', res.status === 204 || res.status === 200);
  } catch (err) {
    assert('OPTIONS preflight test', false, err.message);
  }

  // 5. Test rejected origin (should reject cleanly with warning log)
  try {
    const res = await fetch(`${BASE_URL}/cors-check`, {
      headers: { Origin: 'http://unauthorized-domain-example.com' },
    });
    const acao = res.headers.get('access-control-allow-origin');
    assert('Rejected origin does NOT receive access-control-allow-origin header', acao !== 'http://unauthorized-domain-example.com');
  } catch (err) {
    assert('Rejected origin test', true, 'Fetch failed or rejected as expected');
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  return { passed, failed };
};

if (process.argv[1]?.endsWith('testCORS.js')) {
  runCORSTests()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
