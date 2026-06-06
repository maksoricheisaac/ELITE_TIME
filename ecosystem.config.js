module.exports = {
  apps: [
    {
      name: "elitetime-frontend",
      cwd: "C:/APPS/ELITE_TIME/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      windowsHide: true,           
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0"
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 5000
    },
    {
      name: "elitetime-backend",
      cwd: "C:/APPS/ELITE_TIME/backend",
      script: "dist/src/main.js",
      windowsHide: true,           
      env: {
        NODE_ENV: "production",
        PORT: "4000"
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 5000
    }
  ]
}