// ecosystem.config.cjs (note the .cjs extension!)
module.exports = {
  apps: [
    {
      name: "whatsapp-bot",
      script: "./src/server.js",

      // ========== CLUSTER MODE ==========
      instances: 2,
      exec_mode: "cluster",

      // ========== MEMORY MANAGEMENT ==========
      max_memory_restart: "1G",
      node_args: ["--max-old-space-size=1536", "--gc-interval=100"],

      // ========== AUTO RESTART ==========
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,

      // ========== LOGS ==========
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      merge_logs: true,
      log_type: "json",

      // ========== ENVIRONMENT ==========
      env: {
        NODE_ENV: "production",
        PORT: 3020,
      },

      // ========== PM2 PLUS MONITORING ==========
      instance_var: "INSTANCE_ID",

      // ========== GRACEFUL SHUTDOWN ==========
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // ========== EXPONENTIAL BACKOFF ==========
      exp_backoff_restart_delay: 100,
    },
  ],
};
