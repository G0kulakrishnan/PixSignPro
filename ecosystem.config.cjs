// pm2 ecosystem file for PixSign Pro VPS deployment.
// Deploy steps:
//   git pull origin main
//   npm install
//   npm run build          (builds packages/db then apps/api)
//   pm2 reload ecosystem.config.cjs --env production

module.exports = {
  apps: [
    {
      name: 'pixsignpro-api',
      script: 'dist/index.js',
      cwd: '/var/www/pixsignpro/apps/api',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        // Secrets live in apps/api/.env (gitignored) — loaded by dotenv inside the app.
      },
    },
  ],
};
