/**
 * PM2 process list for all 7 Oli backend services on the production VPS.
 *
 * Usage (see DEPLOY-HOSTINGER-VPS.md for the full runbook):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup systemd   # then run the command it prints, then `pm2 save` again
 *
 * Each service loads its own .env file via Node's built-in --env-file flag
 * (Node 20.6+/22 support this natively — no dotenv dependency needed,
 * consistent with the zero-npm-dependency approach used throughout this
 * repo). Make sure you've copied each <service>/.env.example to
 * <service>/.env and filled in real values BEFORE starting these (see
 * DEPLOY-HOSTINGER-VPS.md step 5).
 */
module.exports = {
  apps: [
    {
      name: "admin-auth",
      cwd: __dirname + "/admin-auth",
      script: "server/index.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "licensing",
      cwd: __dirname + "/licensing",
      script: "server/index.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "olisalestrack-sync",
      cwd: __dirname + "/olisalestrack-sync",
      script: "server/index.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "oliflow-executor",
      cwd: __dirname + "/oliflow-executor",
      script: "server/index.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "oliops-backend",
      cwd: __dirname + "/oliops-backend",
      script: "server/index.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "olicommerce-backend",
      cwd: __dirname + "/olicommerce-backend",
      script: "server/index.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "integration-server",
      cwd: __dirname + "/integration-server",
      script: "server.js",
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
  ],
};
