
module.exports = {
  apps: [
    {
      name: "elitetime-backend",
      script: "node",
      args: "dist/src/main.js",
      cwd: "C:\\Apps\\elitetime-backend",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      restart_delay: 4000,
      min_uptime: "10s",
      max_restarts: 10,
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: "4000",
        DATABASE_URL: process.env.DATABASE_URL,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        LDAP_URL: process.env.LDAP_URL,
        LDAP_BIND_DN: process.env.LDAP_BIND_DN,
        LDAP_PWD: process.env.LDAP_PWD,
        LDAP_BASE_DN: process.env.LDAP_BASE_DN,
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        SMTP_FROM: process.env.SMTP_FROM,
        AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
        AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
        GRAPH_SENDER_EMAIL: process.env.GRAPH_SENDER_EMAIL,
        NEXT_ALLOWED_ORIGINS: "http://10.0.100.58,http://10.0.100.58:80,http://localhost:3000",
        FORCE_COLOR: "0",
        TEMP: "C:\\pm2-data\\temp",
        TMP: "C:\\pm2-data\\temp"
      },
      error_file: "C:/Apps/elitetime/logs/backend-error.log",
      out_file: "C:/Apps/elitetime/logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
}
