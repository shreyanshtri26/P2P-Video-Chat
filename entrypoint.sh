#!/bin/sh

# Remove existing symlink/file to prevent self-truncation via redirection
rm -f /etc/nginx/sites-enabled/default

# Replace $PORT in Nginx config with the actual Render PORT env var
envsubst '$PORT' < /etc/nginx/sites-available/default > /etc/nginx/sites-enabled/default

# Start Spring Boot in the background
echo "==> Starting Spring Boot..."
java -jar /app.jar &

# Wait for Spring Boot to be ready on port 8080 before starting Nginx
echo "==> Waiting for Spring Boot to become ready on port 8080..."
until curl -sf http://localhost:8080/ > /dev/null 2>&1; do
  echo "    Spring Boot not ready yet, retrying in 3s..."
  sleep 3
done
echo "==> Spring Boot is ready!"

# Start Nginx in the foreground (keeps container alive)
echo "==> Starting Nginx on port $PORT..."
nginx -g "daemon off;"
