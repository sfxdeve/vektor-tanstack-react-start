async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Vektor Admin";
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .dev.vars or env");
    process.exit(1);
  }
  console.log(`To seed admin, run:
  curl -X POST http://localhost:5173/api/auth/sign-up/email -H "content-type: application/json" -H "Origin: http://localhost:5173" -d '{"email":"${email}","password":"${password}","name":"${name}"}'
Then manually set role to 'admin' via wrangler d1 execute:
  npx wrangler d1 execute DB --local --command "UPDATE user SET role='admin' WHERE email='${email}'"
  # then re-login to get admin session
`);
}

void main();
