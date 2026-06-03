# ---- Build stage ----
FROM maven:3.9-eclipse-temurin-23-alpine AS builder

WORKDIR /app

# Cache dependencies before copying source
COPY pom.xml .
RUN mvn -B dependency:go-offline -q

COPY src ./src
RUN mvn -B clean package -DskipTests -q

# ---- Runtime stage ----
FROM eclipse-temurin:23-jre-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring
USER spring

COPY --from=builder /app/target/foundit-backend-1.0.0.jar app.jar

# Upload directory (mount a volume in production)
RUN mkdir -p uploads

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
