const http = require('http');
const app = require('../src/app');
const env = require('../src/config/env');
const { createClient } = require('@supabase/supabase-js');

const PORT = 4077;
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const fullPath = '/api' + (path.startsWith('/') ? path : '/' + path);
    const url = new URL(fullPath, `http://127.0.0.1:${PORT}`);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let data = raw;
        try {
          data = JSON.parse(raw);
        } catch (_) {}
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function verifyBug2() {
  const server = app.listen(PORT);
  console.log(`Verification server running on port ${PORT}...`);

  try {
    // 1. Get Admin token
    const { data: adminAuth, error: authError } = await supabase.auth.signInWithPassword({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    if (authError) throw authError;
    const adminToken = adminAuth.session.access_token;
    console.log('✓ Successfully authenticated as Admin.');

    // Initial customers count
    const initialList = await request('GET', '/customers', null, adminToken);
    console.log(`Initial customer count: ${initialList.body?.total}`);

    // 2. Sign up a new customer via POST /api/auth/signup
    const stamp = Date.now();
    const signupEmail = `signup_verify_${stamp}@brightloop.test`;
    console.log(`Signing up customer: ${signupEmail}...`);

    const signupRes = await request('POST', '/auth/signup', {
      email: signupEmail,
      password: 'Password@999',
      fullName: 'Alice From Signup',
      phone: '9123456789',
    });
    console.log(`Signup status: ${signupRes.status}, Customer ID: ${signupRes.body?.data?.customerId}`);

    // Confirm it appears in GET /api/customers
    const listAfterSignup = await request('GET', '/customers', null, adminToken);
    const foundSignupCust = listAfterSignup.body?.data?.find((c) => c.email === signupEmail);
    if (!foundSignupCust) {
      throw new Error(`Customer from /signup (${signupEmail}) NOT found in GET /api/customers!`);
    }
    console.log(`✓ VERIFIED: Signed up customer "${foundSignupCust.name}" (${foundSignupCust.email}) appears in GET /api/customers!`);

    // 3. Create a customer via POST /api/customers
    const directEmail = `direct_verify_${stamp}@acme.test`;
    console.log(`Creating customer via POST /customers: ${directEmail}...`);

    const directRes = await request(
      'POST',
      '/customers',
      {
        name: 'Bob Direct Enterprise',
        email: directEmail,
        company: 'Bob Enterprise Ltd',
        phone: '9876500000',
        address: 'Suite 100, Tech Park',
      },
      adminToken
    );
    console.log(`POST /customers status: ${directRes.status}, Customer ID: ${directRes.body?.data?.id}`);

    // Confirm it appears in GET /api/customers
    const listAfterDirect = await request('GET', '/customers', null, adminToken);
    const foundDirectCust = listAfterDirect.body?.data?.find((c) => c.email === directEmail);
    if (!foundDirectCust) {
      throw new Error(`Customer from POST /customers (${directEmail}) NOT found in GET /api/customers!`);
    }
    console.log(`✓ VERIFIED: Direct customer "${foundDirectCust.name}" (${foundDirectCust.email}) appears in GET /api/customers!`);

    console.log('\nFinal customer list sample:');
    listAfterDirect.body?.data?.slice(0, 3).forEach((c) => {
      console.log(` - [${c.id}] ${c.name} (${c.email || 'no email'}) - Company: ${c.company || 'N/A'}`);
    });
    console.log(`Total count in list response: ${listAfterDirect.body?.total}`);
    console.log('\nALL BUG 2 VERIFICATIONS PASSED!\n');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    server.close();
    process.exit(1);
  }
}

verifyBug2();
