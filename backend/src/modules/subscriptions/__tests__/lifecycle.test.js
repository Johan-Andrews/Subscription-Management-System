const assert = require('assert');
const { transition, ALLOWED_TRANSITIONS } = require('../subscription.lifecycle');

async function runTests() {
  console.log('Running Lifecycle Service Unit Tests...');

  // Mock DB client
  function createMockClient(initialSub) {
    let currentSub = { ...initialSub };
    const history = [];

    return {
      currentSub,
      history,
      query: async (sql, params) => {
        if (sql.includes('FOR UPDATE OF s')) {
          return { rows: [currentSub] };
        }
        if (sql.includes('UPDATE subscriptions')) {
          currentSub = {
            ...currentSub,
            status: params[0],
            is_paused: params[1],
            next_billing_date: params[2],
            expiry_date: params[3],
            closed_at: params[4],
            quotation_valid_until: params[5],
          };
          return { rows: [currentSub] };
        }
        if (sql.includes('INSERT INTO subscription_status_history')) {
          history.push({
            subscription_id: params[0],
            from_status: params[1],
            to_status: params[2],
            action: params[3],
            changed_by: params[4],
          });
          return { rows: [{ id: 'hist-1' }] };
        }
        return { rows: [] };
      },
    };
  }

  const adminUser = { id: 'admin-1', role: 'ADMIN' };
  const customerUser = { id: 'cust-user-1', role: 'CUSTOMER', customerId: 'cust-1' };
  const otherCustomer = { id: 'cust-user-2', role: 'CUSTOMER', customerId: 'cust-2' };

  // 1. Confirm: QUOTATION -> CONFIRMED, sets next_billing_date = start_date
  {
    const client = createMockClient({
      id: 'sub-1',
      customer_id: 'cust-1',
      status: 'QUOTATION',
      start_date: '2026-11-01',
      is_paused: false,
      plan_closable: true,
      plan_pausable: true,
      plan_renewable: true,
    });

    const updated = await transition(client, 'sub-1', 'confirm', adminUser);
    assert.strictEqual(updated.status, 'CONFIRMED');
    assert.strictEqual(updated.next_billing_date, '2026-11-01');
    assert.strictEqual(client.history.length, 1);
    assert.strictEqual(client.history[0].to_status, 'CONFIRMED');
    console.log('✔ Transition confirm sets next_billing_date = start_date and writes history');
  }

  // 2. Reject illegal jump: DRAFT -> ACTIVE must throw 409
  {
    const client = createMockClient({
      id: 'sub-2',
      customer_id: 'cust-1',
      status: 'DRAFT',
      is_paused: false,
    });

    let threw = false;
    try {
      await transition(client, 'sub-2', 'activate', adminUser);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.statusCode, 409);
      assert(err.message.includes('CONFIRMED'));
    }
    assert(threw, 'Should throw 409 on illegal jump DRAFT -> ACTIVE');
    console.log('✔ Illegal jump DRAFT -> ACTIVE rejected with 409 CONFLICT');
  }

  // 3. Early close without plan.closable must throw 403
  {
    const client = createMockClient({
      id: 'sub-3',
      customer_id: 'cust-1',
      status: 'ACTIVE',
      expiry_date: '2026-12-31',
      is_paused: false,
      plan_closable: false,
    });

    let threw = false;
    try {
      await transition(client, 'sub-3', 'close', adminUser);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.statusCode, 403);
      assert(err.message.includes('does not allow early closing'));
    }
    assert(threw, 'Should throw 403 when closing early without plan.closable');
    console.log('✔ Early close without plan.closable rejected with 403 FORBIDDEN');
  }

  // 4. Pause requires plan.pausable
  {
    const client = createMockClient({
      id: 'sub-4',
      customer_id: 'cust-1',
      status: 'ACTIVE',
      is_paused: false,
      plan_pausable: false,
    });

    let threw = false;
    try {
      await transition(client, 'sub-4', 'pause', adminUser);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.statusCode, 403);
    }
    assert(threw, 'Should throw 403 when pausing unpausable plan');
    console.log('✔ Pause on unpausable plan rejected with 403');
  }

  // 5. Customer cannot access or transition someone else's subscription
  {
    const client = createMockClient({
      id: 'sub-5',
      customer_id: 'cust-1',
      status: 'ACTIVE',
      is_paused: false,
      plan_pausable: true,
    });

    let threw = false;
    try {
      await transition(client, 'sub-5', 'pause', otherCustomer);
    } catch (err) {
      threw = true;
      assert.strictEqual(err.statusCode, 404);
    }
    assert(threw, 'Other customer accessing subscription should get 404');
    console.log('✔ Cross-customer access rejected with 404');
  }

  console.log('\nAll lifecycle tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Lifecycle tests failed:', err);
  process.exit(1);
});

