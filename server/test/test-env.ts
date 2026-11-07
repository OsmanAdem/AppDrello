// Settings for tests. Imported first by every test file, before any app code,
// so the app finds what it needs without a real database or email account.
process.env['JWT_SECRET'] = 'test-secret-only-used-in-tests';
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/not-used-by-these-tests';
process.env['SMTP_HOST'] = ''; // print emails instead of sending them
