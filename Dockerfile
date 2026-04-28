## Build stage
FROM maven:3.8.4-jdk-11-slim AS build
WORKDIR /app
COPY pom.xml .
COPY src/ /app/src/
RUN mvn clean package -DskipTests

# Step : Package image
FROM eclipse-temurin:11-jdk

# Install Nginx and gettext (for envsubst)
RUN apt-get update && apt-get install -y nginx gettext && rm -rf /var/lib/apt/lists/*

# Copy Spring Boot Jar
COPY --from=build /app/target/*.jar app.jar

# Copy Nginx Config
COPY nginx/nginx-render.conf /etc/nginx/sites-available/default

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN sed -i -e 's/\r$//' /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]