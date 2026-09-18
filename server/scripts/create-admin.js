import { pool } from "../db.js";
import { hashPassword } from "../lib/security.js";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 12) {
  console.error(
    'Usage: npm run admin:create -- "Owner Name" owner@example.com "password-of-12-or-more-characters"',
  );
  process.exitCode = 1;
} else {
  const passwordHash = await hashPassword(password);
  await pool.query(
    "INSERT INTO users (name,email,password_hash,role,email_verified_at) VALUES ($1,lower($2),$3,'admin',now())",
    [name.trim(), email.trim(), passwordHash],
  );
  console.log(`Administrator created for ${email.trim().toLowerCase()}.`);
}
await pool.end();
