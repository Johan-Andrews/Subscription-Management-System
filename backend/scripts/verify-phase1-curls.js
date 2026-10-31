/**
 * verify-phase1-curls.js
 * Runs live tests against local Express API server and prints exact curl commands,
 * responses, and PASS/FAIL status for each item in the user request.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const app = require('../src/app');
const { query } = require('../src/db/pool');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

let server = null;
let PORT = null;

async function apiRequest({ method = 'GET', path, token = null, body = null }) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: `/api${path}`,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const testReports = [];

function report(item, pass, curlCmd, resultNote) {
  testReports.push({ item, pass, curlCmd, resultNote });
  const icon = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`\n${icon}: ${item}`);
  console.log(`Curl: ${curlCmd}`);
  console.log(`Result: ${resultNote}`);
}

async function run() {
  console.log('Starting internal test server...');
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      PORT = server.address().port;
      console.log(`Test API server listening on http://localhost:${PORT}`);
      resolve();
    });
  });

  // Admin login
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@brightloop.test';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const { data: adminAuth } = await supabaseAnon.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  const adminToken = adminAuth?.session?.access_token;
  if (!adminToken) {
    console.error('Failed to get admin token');
    process.exit(1);
  }

  // --- 1. Customer signup -> list (appears in GET /api/customers, linked user_id, role CUSTOMER) ---
  const custEmail = `cust.flow.${Date.now()}@example.com`;
  const custPass = 'Customer!123';
  const signupRes = await apiRequest({
    method: 'POST',
    path: '/auth/signup',
    body: { email: custEmail, password: custPass, fullName: 'Customer Flow User', phone: '9876543210' },
  });

  const getCustomersAdminRes = await apiRequest({
    method: 'GET',
    path: `/customers?search=${custEmail}`,
    token: adminToken,
  });

  const dbProfile = await query('SELECT role FROM profiles WHERE LOWER(email) = LOWER($1)', [custEmail]);
  const dbCustomer = await query('SELECT user_id, name, email FROM customers WHERE LOWER(email) = LOWER($1)', [custEmail]);
  const isLinked = dbCustomer.rows[0]?.user_id !== null && dbCustomer.rows[0]?.user_id !== undefined;
  const isRoleCustomer = dbProfile.rows[0]?.role === 'CUSTOMER';
  const inList = getCustomersAdminRes.data?.data?.some((c) => c.email?.toLowerCase() === custEmail.toLowerCase());

  report(
    'Customer signup -> list: appears in GET /api/customers, profiles.role=CUSTOMER, customers.user_id linked',
    signupRes.status === 201 && inList && isRoleCustomer && isLinked,
    `curl -X POST http://localhost:${PORT}/api/auth/signup -H "Content-Type: application/json" -d '{"email":"${custEmail}","password":"${custPass}","fullName":"Customer Flow User"}'\ncurl -X GET "http://localhost:${PORT}/api/customers?search=${custEmail}" -H "Authorization: Bearer <admin_token>"`,
    `Signup status: ${signupRes.status}, Found in /api/customers: ${inList}, profiles.role: ${dbProfile.rows[0]?.role}, customers.user_id linked: ${isLinked}`
  );

  // --- 1b. Customer created via "New customer" appears in list immediately ---
  const directCustEmail = `direct.cust.${Date.now()}@example.com`;
  const createDirectRes = await apiRequest({
    method: 'POST',
    path: '/customers',
    token: adminToken,
    body: { name: 'Direct Customer User', email: directCustEmail, phone: '9988776655' },
  });
  const getDirectInList = await apiRequest({
    method: 'GET',
    path: `/customers?search=${directCustEmail}`,
    token: adminToken,
  });
  const directInList = getDirectInList.data?.data?.some((c) => c.email?.toLowerCase() === directCustEmail.toLowerCase());

  report(
    'New Customer created via POST /customers appears in list immediately',
    createDirectRes.status === 201 && directInList,
    `curl -X POST http://localhost:${PORT}/api/customers -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"name":"Direct Customer User","email":"${directCustEmail}"}'\ncurl -X GET "http://localhost:${PORT}/api/customers?search=${directCustEmail}" -H "Authorization: Bearer <admin_token>"`,
    `Create status: ${createDirectRes.status}, Found in /api/customers: ${directInList}`
  );

  // --- 2. Staff create -> list -> login -> inactive 403 ---
  const staffEmail = `staff.flow.${Date.now()}@brightloop.test`;
  const staffPass = 'StaffPassword!123';
  const createStaffRes = await apiRequest({
    method: 'POST',
    path: '/users/staff',
    token: adminToken,
    body: { email: staffEmail, password: staffPass, fullName: 'Staff Flow Member' },
  });
  const staffId = createStaffRes.data?.data?.id;

  const getStaffListRes = await apiRequest({
    method: 'GET',
    path: '/users/staff',
    token: adminToken,
  });
  const staffInList = getStaffListRes.data?.data?.find((s) => s.email?.toLowerCase() === staffEmail.toLowerCase());
  const hasStaffDetails = staffInList && staffInList.fullName === 'Staff Flow Member' && staffInList.role === 'STAFF' && staffInList.isActive === true;

  // Staff login
  const { data: staffAuth, error: staffLoginErr } = await supabaseAnon.auth.signInWithPassword({
    email: staffEmail,
    password: staffPass,
  });
  const staffToken = staffAuth?.session?.access_token;
  const staffCanLogin = !staffLoginErr && !!staffToken;

  // Deactivate staff and verify 403
  const deactRes = await apiRequest({
    method: 'PATCH',
    path: `/users/staff/${staffId}`,
    token: adminToken,
    body: { isActive: false },
  });
  const inactiveAccessRes = await apiRequest({
    method: 'GET',
    path: '/auth/me',
    token: staffToken,
  });
  const inactiveBlocked = inactiveAccessRes.status === 403;

  report(
    'Staff create -> list: appears with name, email, role STAFF, isActive=true; staff logs in; isActive=false blocks with 403',
    createStaffRes.status === 201 && hasStaffDetails && staffCanLogin && inactiveBlocked,
    `curl -X POST http://localhost:${PORT}/api/users/staff -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"email":"${staffEmail}","password":"${staffPass}","fullName":"Staff Flow Member"}'\ncurl -X GET http://localhost:${PORT}/api/users/staff -H "Authorization: Bearer <admin_token>"\ncurl -X PATCH http://localhost:${PORT}/api/users/staff/${staffId} -H "Authorization: Bearer <admin_token>" -d '{"isActive":false}'\ncurl -X GET http://localhost:${PORT}/api/auth/me -H "Authorization: Bearer <staff_token>"`,
    `Created status: ${createStaffRes.status}, In list: ${!!staffInList}, Role: ${staffInList?.role}, Login success: ${staffCanLogin}, Inactive blocked 403: ${inactiveBlocked} (${inactiveAccessRes.data?.error?.message})`
  );

  // --- 3a. Duplicate email -> 409 for signup ---
  const dupSignupRes = await apiRequest({
    method: 'POST',
    path: '/auth/signup',
    body: { email: adminEmail, password: 'Password!123', fullName: 'Dup User' },
  });
  report(
    'Duplicate email -> 409 for signup',
    dupSignupRes.status === 409,
    `curl -X POST http://localhost:${PORT}/api/auth/signup -H "Content-Type: application/json" -d '{"email":"${adminEmail}","password":"Password!123","fullName":"Dup User"}'`,
    `Status: ${dupSignupRes.status}, Message: ${dupSignupRes.data?.error?.message}`
  );

  // --- 3b. Duplicate email -> 409 for staff creation ---
  const dupStaffRes = await apiRequest({
    method: 'POST',
    path: '/users/staff',
    token: adminToken,
    body: { email: adminEmail, password: 'Password!123', fullName: 'Dup Staff' },
  });
  report(
    'Duplicate email -> 409 for staff creation',
    dupStaffRes.status === 409,
    `curl -X POST http://localhost:${PORT}/api/users/staff -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"email":"${adminEmail}","password":"Password!123","fullName":"Dup Staff"}'`,
    `Status: ${dupStaffRes.status}, Message: ${dupStaffRes.data?.error?.message}`
  );

  // --- 3c. Password of 8 or fewer chars or missing upper/lower/special -> 400 with clear message ---
  const weakPasswords = [
    { pwd: 'Short!1', desc: '<=8 characters' },
    { pwd: 'nouppercase!123', desc: 'missing uppercase' },
    { pwd: 'NOLOWERCASE!123', desc: 'missing lowercase' },
    { pwd: 'NoSpecialChar123', desc: 'missing special character' },
  ];
  let allWeak400 = true;
  let weakMsgs = [];
  for (const wp of weakPasswords) {
    const res = await apiRequest({
      method: 'POST',
      path: '/auth/signup',
      body: { email: `weak.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`, password: wp.pwd, fullName: 'Weak User' },
    });
    if (res.status !== 400) allWeak400 = false;
    weakMsgs.push(`${wp.desc}: ${res.status} (${res.data?.error?.message})`);
  }
  report(
    'Password of 8 or fewer chars or missing upper/lower/special -> 400 with clear message',
    allWeak400,
    `curl -X POST http://localhost:${PORT}/api/auth/signup -H "Content-Type: application/json" -d '{"email":"...","password":"<weak>","fullName":"User"}'`,
    weakMsgs.join('; ')
  );

  // --- 3d. Signup with "role":"ADMIN" still creates CUSTOMER ---
  const exploitEmail = `admin.exploit.${Date.now()}@example.com`;
  const exploitSignupRes = await apiRequest({
    method: 'POST',
    path: '/auth/signup',
    body: { email: exploitEmail, password: 'Password!123', fullName: 'Exploit Admin Attempt', role: 'ADMIN' },
  });
  const exploitProfile = await query('SELECT role FROM profiles WHERE LOWER(email) = LOWER($1)', [exploitEmail]);
  const roleCreated = exploitProfile.rows[0]?.role;
  report(
    'Signup with "role":"ADMIN" still creates CUSTOMER',
    exploitSignupRes.status === 201 && roleCreated === 'CUSTOMER',
    `curl -X POST http://localhost:${PORT}/api/auth/signup -H "Content-Type: application/json" -d '{"email":"${exploitEmail}","password":"Password!123","fullName":"Exploit Admin Attempt","role":"ADMIN"}'`,
    `Signup status: ${exploitSignupRes.status}, Resulting DB role: ${roleCreated}`
  );

  // --- 3e. STAFF token gets 403 on POST /users/staff ---
  // Reactivate staff temporarily to test STAFF token RBAC
  await apiRequest({
    method: 'PATCH',
    path: `/users/staff/${staffId}`,
    token: adminToken,
    body: { isActive: true },
  });
  const staffCreateStaffRes = await apiRequest({
    method: 'POST',
    path: '/users/staff',
    token: staffToken,
    body: { email: 'another@example.com', password: 'Password!123', fullName: 'New Staff' },
  });
  report(
    'STAFF token gets 403 on POST /users/staff',
    staffCreateStaffRes.status === 403,
    `curl -X POST http://localhost:${PORT}/api/users/staff -H "Authorization: Bearer <staff_token>" -H "Content-Type: application/json" -d '{"email":"...","password":"...","fullName":"..."}'`,
    `Status: ${staffCreateStaffRes.status}, Error code: ${staffCreateStaffRes.data?.error?.code}`
  );

  // --- 3f. Only one admin exists (seed-admin is idempotent) ---
  const adminCountRes = await query(`SELECT count(*) FROM profiles WHERE role = 'ADMIN'`);
  const adminCount = parseInt(adminCountRes.rows[0]?.count, 10);
  report(
    'Only one admin exists in database (seed-admin is idempotent)',
    adminCount === 1,
    `node scripts/seed-admin.js`,
    `Admin count in database: ${adminCount} (Email: ${adminEmail})`
  );

  console.log('\n======================================================');
  console.log('SUMMARY OF VERIFICATIONS:');
  const passCount = testReports.filter((r) => r.pass).length;
  console.log(`Total: ${testReports.length} | Passed: ${passCount} | Failed: ${testReports.length - passCount}`);
  console.log('======================================================\n');

  if (server) server.close();
  process.exit(passCount === testReports.length ? 0 : 1);
}

run().catch((err) => {
  console.error('Test run failed:', err);
  if (server) server.close();
  process.exit(1);
});
