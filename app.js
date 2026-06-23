// Entry point for Hostinger's Node.js app manager (Phusion Passenger).
// Set this file as the "Application startup file". It boots the compiled
// Express server, which serves both the API and the built client.
async function start() {
  // Optional: ./env.local.js (gitignored) force-sets process.env credentials,
  // so they can't be shadowed by blank panel vars or a missing .env.
  try {
    await import('./env.local.js');
  } catch {
    // No env.local.js — fall back to .env / panel variables.
  }
  await import('./server/dist/index.js');
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
