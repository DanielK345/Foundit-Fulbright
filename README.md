# FoundIt! Fulbright

A lost-and-found platform for the Fulbright University community. Students and staff can report lost or found items, chat with each other, and let the auto-matching engine reconnect belongings with their owners.

---

##Backend url (Deployed on Render, so wait for server spin-up before running Frontend): https://foundit-backend-zwc1.onrender.com

##Frontend url (Deployed on Vercel): https://foundit-frontend-one.vercel.app/

## Demo

[Watch the demo video](https://youtu.be/cgAN8niM9D4?si=iUdNlKG_Fw8qLcqH)

---

## Features

- User authentication: Register, Login, Reset Password (email OTP)
- Submit and browse lost/found item reports with category filters and keyword search
- Auto-matching engine — asynchronously compares lost/found pairs using item name, description, date, and location (Jaccard similarity ≥ 0.60)
- Verification-based claim process with score-based matching
- Real-time user-to-user chat via WebSocket (STOMP + SockJS)
- Real-time notifications for matches and new messages
- Delete your own posts (claimed items are protected)

---

## Project Structure

```
FounditFulbright/
├── backend/
│   ├── src/main/java/com/foundit/
│   │   ├── controller/        # REST API endpoints
│   │   ├── service/           # Business logic
│   │   ├── model/             # JPA entities
│   │   ├── dto/               # Request / response objects
│   │   ├── repository/        # Spring Data JPA queries
│   │   ├── security/          # JWT provider + filter
│   │   └── config/            # Security, WebSocket, CORS, static files
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

## Prerequisites

| Tool | Required Version | Download |
|------|-----------------|----------|
| Java JDK | **17 – 23** | [Oracle JDK 23](https://www.oracle.com/java/technologies/downloads/#java23) · [Eclipse Temurin 21 LTS](https://adoptium.net/temurin/releases/?version=21) |
| Maven | 3.6+ | Bundled with most IDEs, or [maven.apache.org](https://maven.apache.org/download.cgi) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| PostgreSQL | 14+ | [postgresql.org](https://www.postgresql.org/download/) |

> **Recommended JDK:** [Eclipse Temurin 21 LTS](https://adoptium.net/temurin/releases/?version=21) (free, open-source, long-term support) or [Oracle JDK 23](https://www.oracle.com/java/technologies/downloads/#java23) — both confirmed working.

---

## ⚠️ JDK Version Mismatch — Read This First

Spring Boot 3.x requires **Java 17 or higher**. If your system has an older Java (e.g. Java 8 installed by Oracle tools or other software), Maven will silently use it and the build will fail with one of these errors:

**Error 1 — wrong class file version:**
```
bad class file: ...spring-boot-3.x.jar
class file has wrong version 61.0, should be 52.0
```
Class version 52 = Java 8. Class version 61 = Java 17. This means Maven is using Java 8.

**Error 2 — release version not supported:**
```
error: release version 23 not supported
```
Maven found a Java that is too old to compile the source.

### How to check which Java Maven is using

```bash
mvn -version
```

The output includes `Java version: X.X.X`. If it shows `1.8` or `8`, you need to point Maven to a newer JDK.

### Fix — Windows (PowerShell, current session only)

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-23"   # adjust path to your JDK
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
java -version   # must show 17, 21, or 23
mvn -version    # must also show 17, 21, or 23
```

### Fix — Windows (permanent, all future terminals)

**Option A — PowerShell profile** (recommended):

```powershell
# Run once; takes effect in every new terminal after this
Add-Content $PROFILE "`n# Java 23`n`$env:JAVA_HOME = 'C:\Program Files\Java\jdk-23'`n`$env:PATH = `"`$env:JAVA_HOME\bin;`$env:PATH`""
```

Then **restart VS Code** (or open a new terminal) for the profile to load.

**Option B — Windows System Environment Variables** (GUI):

1. Open **Start** → search **"Edit the system environment variables"**
2. Click **Environment Variables**
3. Under **User variables**, click **New**:
   - Variable name: `JAVA_HOME`
   - Variable value: `C:\Program Files\Java\jdk-23`
4. Find the `Path` variable → **Edit** → **New** → add `%JAVA_HOME%\bin` at the top
5. Click OK on all dialogs, then restart your terminal

### Fix — macOS / Linux (current session)

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-23.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
java -version
```

**Make permanent:** add the two `export` lines to `~/.zshrc` (macOS) or `~/.bashrc` (Linux), then run `source ~/.zshrc`.

---

## Running the Project

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd FounditFulbright
```

### 2. Install the correct JDK

Download and install **JDK 21 LTS** (recommended) or JDK 23 from one of the links in the Prerequisites table above. After installing, set `JAVA_HOME` using the steps in the section above, then confirm:

```bash
java -version   # should print 21 or 23
mvn -version    # Java version line should match
```

### 3. Start PostgreSQL and create the database

**Windows:** Open **Services** (Win + R → `services.msc`) → find `postgresql-x64-XX` → Start

**macOS:**
```bash
brew services start postgresql
```

**Linux:**
```bash
sudo service postgresql start
```

Create the app user and database. Run each command **separately** (`CREATE DATABASE` cannot run inside a transaction block):

```bash
# Step 1 — create the app user
psql -U postgres -c "CREATE USER admin WITH PASSWORD 'Pkd@0604psql';"

# Step 2 — create the database
psql -U postgres -c "CREATE DATABASE founditdb OWNER admin;"

# Step 3 — grant privileges
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE founditdb TO admin;"
```

> Tables are created automatically when the backend starts (`spring.jpa.hibernate.ddl-auto=update`). No SQL migration scripts needed.

If you want to use a different database user or password, update these lines in `backend/src/main/resources/application.properties`:

```properties
spring.datasource.username=admin
spring.datasource.password=Pkd@0604psql
```

### 4. Configure and start the backend

Open `backend/src/main/resources/application.properties` and confirm the datasource credentials match what you created above.

Then, from the project root:

```bash
cd backend
mvn spring-boot:run
```

Wait for this line in the output:
```
Started FoundItApplication in X.XXX seconds
```

The backend is now running at **http://localhost:8081**.

> **Port conflict:** If port 8081 is already in use:
> - Change `server.port` in `application.properties`
> - Update the three proxy targets in `frontend/vite.config.js` to the new port

### 5. (Optional) Enable Gmail for password reset emails

In `application.properties`, replace the placeholder values:

```properties
spring.mail.username=your-gmail@gmail.com
spring.mail.password=your-gmail-app-password
```

**How to get a Gmail App Password:**
Google Account → Security → 2-Step Verification → App Passwords → Generate

> If you skip this step the feature still works — the OTP code is printed to the **backend console** instead of sent by email.

### 6. Start the frontend

Open a **new terminal** (keep the backend terminal running):

```bash
cd frontend
npm install
npm run dev
```

Frontend is now running at **http://localhost:5173**.

### 7. Open the app

Visit **http://localhost:5173** and register a new account to get started.

> Both terminals (backend + frontend) must stay open while using the app.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `class file has wrong version 61.0, should be 52.0` | Maven using Java 8 | Set `JAVA_HOME` to JDK 17+ (see above) |
| `release version 23 not supported` | Maven using a Java older than the source level | Set `JAVA_HOME` to JDK 23 |
| `Port 8081 was already in use` | A previous backend process is still running | Kill the process: `Get-NetTCPConnection -LocalPort 8081 \| Stop-Process -Force` (Windows) or `lsof -ti:8081 \| xargs kill` (macOS/Linux) |
| `Connection to localhost:5432 refused` | PostgreSQL is not running | Start the PostgreSQL service (Step 3 above) |
| `password authentication failed for user "admin"` | Wrong DB password in `application.properties` | Re-check `spring.datasource.password` |
---
