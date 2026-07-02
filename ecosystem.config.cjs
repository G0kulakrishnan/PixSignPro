// pm2 ecosystem file for PixSign Pro VPS deployment.
// Usage: pm2 start ecosystem.config.cjs --env production
// The .env file at apps/api/.env is loaded by dotenv inside the app on startup.
// pm2 reads env_production block and sets those vars before the process starts.

module.exports = {
  apps: [
    {
      name: 'pixsignpro-api',
      script: 'apps/api/dist/index.js',
      cwd: '/var/www/pixsignpro',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        // Secrets are NOT stored here — they live in apps/api/.env (gitignored).
        // dotenv/config is called inside the app and picks up apps/api/.env
        // because the app's CWD is set to /var/www/pixsignpro/apps/api below.
      },
      // Override cwd for dotenv resolution: dotenv looks for .env in process.cwd()
      // apps/api/.env lives at apps/api/ so set cwd to that directory.
      cwd: '/var/www/pixsignpro/apps/api',
    },
  ],
};
