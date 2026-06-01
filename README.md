# FoundIt! Fulbright

This project aims to build a platform that allows staff and students within the Fulbright community to report lost items or found belongings and reconnect them with their owners. The development will focus on the following core functionalities:

- Reporting lost and found items
- Searching and filtering listings
- Messaging/chat between users
- Smart auto-matching of lost and found items
- Claim submission and verification process

---

## Demo Usage
This is the link to demo [video](https://youtu.be/cgAN8niM9D4?si=iUdNlKG_Fw8qLcqH)

## Completed Features

- User authentication: Register, Login, and Reset Password
- Submit reports for lost or found items
- Browse listings with category filters and keyword search
- Verification-based claim process for valuable items using score-based matching
- Auto-matching engine for lost and found items based on semantic comparison of item name, description, date, and location for each lost/found pair. Matching runs asynchronously in the background after an item is posted.
- Real-time notifications for item matches and new messages
- Real-time user-to-user chat powered by WebSocket
- Delete posted items with ownership control (users can only delete their own posts, and claimed items - cannot be removed)

---

## Project Structure

```
lost_and_found/
├── backend/
│   ├── src/main/java/com/foundit/
│   │   ├── controller/        # REST API endpoints
│   │   ├── service/           # Business logic
│   │   ├── model/             # Database entities
│   │   ├── dto/               # Request / response objects
│   │   ├── repository/        # Database queries
│   │   └── config/            # Security, WebSocket, CORS
│   ├── src/main/resources/
│   │   └── application.properties
│   └── uploads/               # Uploaded images (auto-created at runtime)
│
└── frontend/
    ├── src/
    │   ├── pages/             # Page-level components
    │   ├── components/        # Reusable UI components
    │   ├── api/               # Axios API calls
    │   └── context/           # Auth context (JWT)
    └── vite.config.js         # Dev server + proxy config
```
---

## How to Run the Project

### Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Java JDK | **17–23** | Spring Boot 3.x requires Java 17+. JDK 23 confirmed working. |
| Node.js | 18 | |
| PostgreSQL | 14 | PostgreSQL 18 confirmed working. |
| Maven | 3.6+ | |

> **⚠️ Java Version Mismatch — Common Error**
>
> If you see this error when running Maven:
> ```
> bad class file: spring-boot-3.x.jar(SpringApplication.class)
>   class file has wrong version 61.0, should be 52.0
> ```
> This means Maven is using **Java 8** (class version 52) but Spring Boot 3.x requires **Java 17+** (class version 61).
>
> **Fix on Windows (PowerShell):**
> ```powershell
> $env:JAVA_HOME = "C:\Program Files\Java\jdk-23"
> $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
> java -version   # must show 17, 21, or 23
> mvn spring-boot:run
> ```
>
> **Fix on macOS / Linux:**
> ```bash
> export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-23.jdk/Contents/Home
> export PATH=$JAVA_HOME/bin:$PATH
> mvn spring-boot:run
> ```
>
> To make permanent, add the `JAVA_HOME` export to your shell profile (`.bashrc`, `.zshrc`) or set it in Windows System Environment Variables.


### 1. Clone the repository 

```bash
git clone <your-repo-url>
cd lost_and_found
```

### 2. Database Setup

Make sure your PostgreSQL service is running.

**Windows:** Search for "Services" → find "postgresql-x64-XX" → Start

**macOS:**
```bash
brew services start postgresql
```

**Linux:**
```bash
sudo service postgresql start
```

Create the database user and database. Run each command **separately** (`CREATE DATABASE` cannot run inside a transaction block):

```bash
# Step 1 — create the app user
psql -U postgres -c "CREATE USER admin WITH PASSWORD 'Pkd@0604psql';"

# Step 2 — create the database
psql -U postgres -c "CREATE DATABASE founditdb OWNER admin;"

# Step 3 — grant privileges
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE founditdb TO admin;"
```

> Tables are created automatically when the backend starts (`ddl-auto=update`). No SQL scripts needed.
>
> To use a different user/password, update `spring.datasource.username` and `spring.datasource.password` in `application.properties`.

### 3. Backend

Open `backend/src/main/resources/application.properties` and set your PostgreSQL password:

```properties
spring.datasource.password=YOUR_POSTGRES_PASSWORD
```

Then run:

```bash
cd backend
mvn spring-boot:run
```

> **Windows:** If Maven still picks up the wrong Java, prefix the command:
> ```powershell
> $env:JAVA_HOME = "C:\Program Files\Java\jdk-23"; $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"; mvn spring-boot:run
> ```

Wait for:
```
Started FoundItApplication in X.XXX seconds
```

Backend runs at **http://localhost:8081**

> **Port conflict:** If port 8081 is already in use, change `server.port` in `application.properties` and update the three proxy targets in `frontend/vite.config.js` to match.

### 4 (Optional) Configure Gmail for password reset emails

In the same `application.properties` file, replace the placeholder values:

```properties
spring.mail.username=your-gmail@gmail.com
spring.mail.password=your-gmail-app-password
```

> **How to get a Gmail App Password:**
> Google Account → Security → 2-Step Verification → App Passwords → Generate
>
> If you skip this step, the password reset feature still works — the OTP code will be printed to the **backend console** instead of sent by email.

### 5. Frontend

Open a new terminal:

```bash
cd frontend
```

Intall dependencies

```bash
npm install
```

Start the development
```
npm run dev
```

Frontend is now running at **http://localhost:5173**

### 6. Open the App

Visit **http://localhost:5173** and register a new account to get started.
Register a new account to get started.

> Both terminals must stay open while using the app.
---
