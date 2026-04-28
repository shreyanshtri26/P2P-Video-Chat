## Build stage
FROM maven:3.8.4-jdk-11-slim AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline

COPY src/ /app/src/
RUN mvn clean package -DskipTests

# Step : Package image
FROM openjdk:11-jdk-slim

# Install Nginx and gettext (for envsubst)
RUN apt-get update && apt-get install -y nginx gettext && rm -rf /var/lib/apt/lists/*

# Copy Spring Boot Jar
COPY --from=build /app/target/*.jar app.jar

# Copy Nginx Config
COPY nginx/nginx-railway.conf /etc/nginx/sites-available/default

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]