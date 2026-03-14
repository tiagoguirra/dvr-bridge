module.exports = {
  apps: [
    {
      name: 'dvr-proxy',
      script: 'npm',
      args: 'start',
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
