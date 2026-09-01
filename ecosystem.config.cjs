/** PM2 process file. Secrets come from /var/www/solvio/.env, not this file. */
module.exports = {
  apps: [
    {
      name: "solvio",
      cwd: "/var/www/solvio",
      script: "npm",
      args: "run start",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
