/**
 * Smoke tests — exercises the critical apply → hire flow against a
 * running backend.
 *
 * Zero new deps: uses Node's built-in fetch + a tiny assertion helper.
 * Run with:
 *
 *   API_URL=http://localhost:8080 pnpm --filter @doondo/backend smoke
 *
 * The script:
 *   1. Creates a fresh seeker and a fresh employer (POST /auth/register).
 *   2. Employer posts a job.
 *   3. Seeker applies.
 *   4. Employer shortlists → hires the applicant.
 *   5. Both sides leave ratings.
 *   6. Verifies the seeker's earnings ledger is reachable.
 *
 * Each step throws on failure with a clear message; CI / a dev loop
 * just looks at the exit code (0 = pass).
 *
 * IMPORTANT: this hits real endpoints with real DB writes. Run against
 * a disposable / dev database — never staging or prod.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:8080';
const API_BASE = `${API_URL}/api/v1`;

// All Doondo handlers respond with { ok, data, requestId }; smokes pull
// the data layer out so callers see a flatter shape.
interface ApiEnvelope {
  ok: boolean;
  data: unknown;
  requestId?: string;
  error?: { message?: string };
}
interface ApiResult<T> {
  status: number;
  data: T;
  raw: ApiEnvelope;
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let raw: ApiEnvelope;
  try {
    raw = (await res.json()) as ApiEnvelope;
  } catch {
    raw = { ok: false, data: null };
  }
  return { status: res.status, data: (raw?.data ?? null) as T, raw };
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function randomPhone(): string {
  return `9${Math.floor(Math.random() * 900_000_000 + 100_000_000)}`;
}

// ─── Test scenario ─────────────────────────────────────────────────────────

interface AuthData {
  user: { id: string; email: string };
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
}

interface JobData {
  job: { id: string };
}

interface ApplicationData {
  application: { id: string; status: string };
}

async function run(): Promise<void> {
  const stamp = Date.now();
  console.log(`▶ Smoke test against ${API_BASE} (stamp ${stamp})`);

  // 1. Register the seeker.
  const seekerEmail = `smoke-seeker-${stamp}-${rand()}@doondo.test`;
  const seekerSignup = await request<AuthData>('POST', '/auth/register', {
    body: {
      name: 'Smoke Seeker',
      email: seekerEmail,
      password: 'StrongPass123!',
      role: 'seeker',
      phone: randomPhone(),
      workType: 'solo',
    },
  });
  assert(
    seekerSignup.status === 201 && seekerSignup.data?.tokens?.accessToken,
    `seeker register → ${seekerSignup.status}: ${JSON.stringify(seekerSignup.raw)}`,
  );
  const seekerToken = seekerSignup.data.tokens.accessToken;
  const seekerId = seekerSignup.data.user.id;
  console.log(`  ✓ Seeker created (id ${seekerId.slice(-6)})`);

  // 2. Register the employer.
  const employerEmail = `smoke-employer-${stamp}-${rand()}@doondo.test`;
  const employerSignup = await request<AuthData>('POST', '/auth/register', {
    body: {
      name: 'Smoke Employer',
      email: employerEmail,
      password: 'StrongPass123!',
      role: 'employer',
      phone: randomPhone(),
    },
  });
  assert(
    employerSignup.status === 201 && employerSignup.data?.tokens?.accessToken,
    `employer register → ${employerSignup.status}: ${JSON.stringify(employerSignup.raw)}`,
  );
  const employerToken = employerSignup.data.tokens.accessToken;
  console.log(`  ✓ Employer created (id ${employerSignup.data.user.id.slice(-6)})`);

  // 3. Employer posts a job.
  const jobPost = await request<JobData>('POST', '/jobs', {
    token: employerToken,
    body: {
      title: `Smoke Test Job ${rand()}`,
      description: 'Automated smoke test job — safe to delete.',
      type: 'gig',
      pay: { amount: 50_000, period: 'day', currency: 'INR' },
      location: {
        address: 'Smoke Test, Bengaluru',
        city: 'Bengaluru',
        lat: 12.9716,
        lng: 77.5946,
      },
      skills: ['helper'],
      workMode: 'onsite',
    },
  });
  assert(
    jobPost.status === 201 && jobPost.data?.job?.id,
    `job post → ${jobPost.status}: ${JSON.stringify(jobPost.raw)}`,
  );
  const jobId = jobPost.data.job.id;
  console.log(`  ✓ Job posted (id ${jobId.slice(-6)})`);

  // 4. Seeker applies — POST /jobs/:id/apply.
  const apply = await request<ApplicationData>(
    'POST',
    `/jobs/${jobId}/apply`,
    {
      token: seekerToken,
      body: { coverLetter: 'Smoke test cover letter.' },
    },
  );
  assert(
    apply.status === 201 && apply.data?.application?.id,
    `apply → ${apply.status}: ${JSON.stringify(apply.raw)}`,
  );
  const applicationId = apply.data.application.id;
  console.log(`  ✓ Application submitted (id ${applicationId.slice(-6)})`);

  // 5. Employer shortlists — POST /applications/:id/shortlist.
  const shortlist = await request<ApplicationData>(
    'POST',
    `/applications/${applicationId}/shortlist`,
    { token: employerToken, body: {} },
  );
  assert(
    shortlist.status === 200 && shortlist.data?.application?.status === 'shortlisted',
    `shortlist → ${shortlist.status}: ${JSON.stringify(shortlist.raw)}`,
  );
  console.log(`  ✓ Shortlisted`);

  // 6. Employer hires — POST /applications/:id/hire.
  const hire = await request<ApplicationData>(
    'POST',
    `/applications/${applicationId}/hire`,
    { token: employerToken, body: {} },
  );
  assert(
    hire.status === 200 && hire.data?.application?.status === 'hired',
    `hire → ${hire.status}: ${JSON.stringify(hire.raw)}`,
  );
  console.log(`  ✓ Hired`);

  // 7. Seeker checks earnings — endpoint should be reachable.
  const earnings = await request<{ transactions: unknown[] }>(
    'GET',
    '/me/earnings',
    { token: seekerToken },
  );
  assert(
    earnings.status === 200 && Array.isArray(earnings.data?.transactions),
    `earnings → ${earnings.status}: ${JSON.stringify(earnings.raw)}`,
  );
  console.log(`  ✓ Earnings ledger reachable (${earnings.data.transactions.length} rows)`);

  // 8. Both sides leave 5-star ratings.
  const seekerRates = await request('POST', '/ratings', {
    token: seekerToken,
    body: {
      applicationId,
      score: 5,
      comment: 'Smoke test — great employer.',
    },
  });
  assert(
    seekerRates.status === 200 || seekerRates.status === 201,
    `seeker rates → ${seekerRates.status}: ${JSON.stringify(seekerRates.raw)}`,
  );
  console.log(`  ✓ Seeker rated the employer`);

  const employerRates = await request('POST', '/ratings', {
    token: employerToken,
    body: {
      applicationId,
      score: 5,
      comment: 'Smoke test — great worker.',
    },
  });
  assert(
    employerRates.status === 200 || employerRates.status === 201,
    `employer rates → ${employerRates.status}: ${JSON.stringify(employerRates.raw)}`,
  );
  console.log(`  ✓ Employer rated the seeker`);

  console.log('\n✅ Smoke test PASSED');
}

run().catch((err: Error) => {
  console.error('\n❌ Smoke test FAILED');
  console.error(err.message);
  process.exit(1);
});
