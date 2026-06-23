// Entry point for Hostinger's Node.js app manager (Phusion Passenger).
// Set this file as the "Application startup file". It boots the compiled
// Express server, which serves both the API and the built client.
import('./server/dist/index.js').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
