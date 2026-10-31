const http = require('http');
const app = require('../src/app');
const env = require('../src/config/env');
const { createClient } = require('@supabase/supabase-js');
const { query } = require('../src/db/pool');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
const PORT = 4099;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const fullPath = '/api' + (path.startsWith('/') ? path : '/' + path);
    const url = new URL(fullPath, `http://127.0.0.1:${PORT}`);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, body: data });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runAcceptanceTests() {
  const server = app.listen(PORT);
  console.log(`Test server running on port ${PORT}...`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    const testStamp = Date.now();
    const customerEmail = `customer_${testStamp}@brightloop.test`;
    const staffEmail = `staff_${testStamp}@brightloop.test`;
    const strongPassword = 'Password@123';

    // 1. Weak password rejected: 8 chars
    const resWeak1 = await request('POST', '/auth/signup', {
      email: `weak1_${testStamp}@brightloop.test`,
      password: 'Pass@12', // 7 chars
      fullName: 'Weak Password User',
    });
    assert(
      resWeak1.status === 400 && resWeak1.body?.error?.code === 'VALIDATION_ERROR',
      'Password shorter than 9 chars rejected with 400 VALIDATION_ERROR'
    );

    // 2. Weak password rejected: missing special character
    const resWeak2 = await request('POST', '/auth/signup', {
      email: `weak2_${testStamp}@brightloop.test`,
      password: 'Password123', // missing special
      fullName: 'Weak Password User',
    });
    assert(
      resWeak2.status === 400 && resWeak2.body?.error?.code === 'VALIDATION_ERROR',
      'Password missing special char rejected with 400 VALIDATION_ERROR'
    );

    // 3. Signup with role: "ADMIN" in body forced to CUSTOMER
    const resSignup = await request('POST', '/auth/signup', {
      email: customerEmail,
      password: strongPassword,
      fullName: 'Test Customer',
      phone: '9876543210',
      role: 'ADMIN', // Injection attempt
    });
    assert(resSignup.status === 201, 'Signup succeeds with 201');
    assert(resSignup.body?.data?.role === 'CUSTOMER', 'Role is forced to CUSTOMER in API response');

    const dbProfile = await query('SELECT role FROM profiles WHERE LOWER(email) = LOWER($1)', [customerEmail]);
    assert(dbProfile.rows[0]?.role === 'CUSTOMER', 'Database role is strictly CUSTOMER');

    // 4. Duplicate email rejected with 409 CONFLICT
    const resDuplicate = await request('POST', '/auth/signup', {
      email: customerEmail.toUpperCase(), // case-insensitive check
      password: strongPassword,
      fullName: 'Duplicate User',
    });
    assert(
      resDuplicate.status === 409 && resDuplicate.body?.error?.code === 'CONFLICT',
      'Duplicate email rejected with 409 CONFLICT'
    );

    // 5. Customer Login via Supabase Auth
    const { data: customerAuth, error: customerAuthErr } = await supabase.auth.signInWithPassword({
      email: customerEmail,
      password: strongPassword,
    });
    assert(!customerAuthErr && customerAuth?.session?.access_token, 'Customer can sign in via Supabase Auth');
    const customerToken = customerAuth?.session?.access_token;

    // 6. GET /auth/me for Customer
    const resCustomerMe = await request('GET', '/auth/me', null, customerToken);
    assert(
      resCustomerMe.status === 200 && resCustomerMe.body?.data?.role === 'CUSTOMER',
      'GET /auth/me returns customer profile'
    );

    // 7. Customer cannot access Admin/Staff routes (GET /users/staff) -> 403
    const resCustForbidden = await request('GET', '/users/staff', null, customerToken);
    assert(
      resCustForbidden.status === 403 && resCustForbidden.body?.error?.code === 'FORBIDDEN',
      'CUSTOMER token gets 403 on admin route GET /users/staff'
    );

    // 8. Admin Login
    const { data: adminAuth, error: adminAuthErr } = await supabase.auth.signInWithPassword({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    });
    assert(!adminAuthErr && adminAuth?.session?.access_token, 'Admin can sign in with seeded credentials');
    const adminToken = adminAuth?.session?.access_token;

    // 9. Admin creates STAFF account (POST /users/staff)
    const resCreateStaff = await request(
      'POST',
      '/users/staff',
      {
        email: staffEmail,
        password: strongPassword,
        fullName: 'Test Staff Member',
      },
      adminToken
    );
    assert(
      resCreateStaff.status === 201 && resCreateStaff.body?.data?.role === 'STAFF',
      'ADMIN can create STAFF account'
    );

    // 10. Staff Login
    const { data: staffAuth, error: staffAuthErr } = await supabase.auth.signInWithPassword({
      email: staffEmail,
      password: strongPassword,
    });
    assert(!staffAuthErr && staffAuth?.session?.access_token, 'STAFF can sign in with created credentials');
    const staffToken = staffAuth?.session?.access_token;

    // 11. STAFF token gets 403 on POST /users/staff
    const resStaffCannotCreate = await request(
      'POST',
      '/users/staff',
      {
        email: `rogue_${testStamp}@brightloop.test`,
        password: strongPassword,
        fullName: 'Rogue Staff',
      },
      staffToken
    );
    assert(
      resStaffCannotCreate.status === 403 && resStaffCannotCreate.body?.error?.code === 'FORBIDDEN',
      'STAFF token gets 403 on POST /users/staff (Admin only)'
    );

    // 12. Staff can create and view customers
    const resCustCreate = await request(
      'POST',
      '/customers',
      {
        name: 'Enterprise Client Co',
        email: `corp_${testStamp}@client.test`,
        company: 'Enterprise Corp',
      },
      staffToken
    );
    assert(resCustCreate.status === 201, 'STAFF can create customer record');

    const resCustList = await request('GET', '/customers?page=1&pageSize=10', null, staffToken);
    assert(
      resCustList.status === 200 && Array.isArray(resCustList.body?.data) && resCustList.body?.total >= 1,
      'STAFF can list customers with pagination and total count'
    );

    // 13. Customer can view and update own profile (/me/customer)
    const resMyCust = await request('GET', '/me/customer', null, customerToken);
    assert(resMyCust.status === 200 && resMyCust.body?.data?.email === customerEmail, 'Customer can view own profile');

    const resUpdateMyCust = await request(
      'PATCH',
      '/me/customer',
      { company: 'Acme Personal' },
      customerToken
    );
    assert(
      resUpdateMyCust.status === 200 && resUpdateMyCust.body?.data?.company === 'Acme Personal',
      'Customer can update own profile'
    );

    console.log(`\n===========================================`);
    console.log(`Acceptance Tests Complete: ${passed} PASSED, ${failed} FAILED`);
    console.log(`===========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runAcceptanceTests();
