#!/bin/sh

# Remove existing symlink/file to prevent self-truncation via redirection
rm -f /etc/nginx/sites-enabled/default

# Replace $PORT in Nginx config with the actual Render PORT env var
envsubst '$PORT' < /etc/nginx/sites-available/default > /etc/nginx/sites-enabled/default

# Start Spring Boot in the background
java -jar /app.jar &

# Start Nginx in the foreground
nginx -g "daemon off;"
