/** PM2 process file. Secrets come from /var/www/solvio/.env, not this file. */
module.exports = {
  apps: [
    {
      name: "solvio",
      cwd: "/var/www/solvio",
      script: "server.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
