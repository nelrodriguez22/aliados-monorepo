# Build stage
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# Copy gradle wrapper and build files
COPY gradle gradle
COPY gradlew .
COPY build.gradle .
COPY settings.gradle .

# Download dependencies (cached layer)
RUN ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src src

# Build application
RUN ./gradlew clean build -x test --no-daemon

# Runtime stage
FROM eclipse-temurin:21-jre
WORKDIR /app

# Copy jar from build stage
COPY --from=build /app/build/libs/aliados-web-backend-0.0.1-SNAPSHOT.jar app.jar

# Expose port (Railway ignora esto pero es buena práctica)
EXPOSE 8080

# Run application
CMD ["java", "-Dserver.port=${PORT}", "-jar", "app.jar"]