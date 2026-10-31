const supabaseAdmin = require('../src/lib/supabaseAdmin');
const { query } = require('../src/db/pool');
const env = require('../src/config/env');

async function seedAdmin() {
  const adminEmail = (env.ADMIN_EMAIL || 'admin@brightloop.test').toLowerCase().trim();
  const adminPassword = env.ADMIN_PASSWORD || 'Admin@12345';
  const fullName = 'Brightloop Admin';

  console.log(`Seeding Admin account: ${adminEmail}...`);

  try {
    // 1. Check if profile already exists in DB
    const existingProfile = await query(
      'SELECT id, email, role FROM profiles WHERE LOWER(email) = LOWER($1)',
      [adminEmail]
    );

    let authUserId = null;

    if (existingProfile.rows.length > 0) {
      authUserId = existingProfile.rows[0].id;
      console.log(`Profile already exists with ID: ${authUserId}. Updating role to ADMIN...`);
      await query(
        `UPDATE profiles 
         SET role = 'ADMIN', is_active = true, full_name = $1, updated_at = NOW() 
         WHERE id = $2`,
        [fullName, authUserId]
      );
      // Also update password if needed
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: adminPassword,
        email_confirm: true,
      });
    } else {
      // 2. Check if auth user exists in Supabase Auth
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      const existingAuth = users.find((u) => u.email?.toLowerCase() === adminEmail);

      if (existingAuth) {
        authUserId = existingAuth.id;
        console.log(`Found existing auth user: ${authUserId}`);
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: adminPassword,
          email_confirm: true,
        });
      } else {
        console.log('Creating auth user via Supabase Admin API...');
        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError) throw createError;
        authUserId = created.user.id;
        console.log(`Created new auth user: ${authUserId}`);
      }

      // 3. Insert profile into database
      await query(
        `INSERT INTO profiles (id, email, full_name, role, is_active)
         VALUES ($1, $2, $3, 'ADMIN', true)
         ON CONFLICT (id) DO UPDATE SET role = 'ADMIN', is_active = true`,
        [authUserId, adminEmail, fullName]
      );
    }

    console.log('\n✓ Admin account seeded successfully!');
    console.log('-------------------------------------------');
    console.log('Email:    ', adminEmail);
    console.log('Password: ', adminPassword);
    console.log('Role:      ADMIN');
    console.log('-------------------------------------------');
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed admin account:', err);
    process.exit(1);
  }
}

seedAdmin();

