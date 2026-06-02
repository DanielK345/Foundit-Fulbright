# `config` Module Architecture

This package contains all Spring configuration classes for the FoundIt backend. Each class is focused on a single concern and together they define the application's security, real-time messaging, and static resource serving behaviour.

---

## Classes

### `SecurityConfig`
The central HTTP security configuration.

- Disables CSRF (stateless JWT API does not need it).
- Configures **CORS** to allow requests from `localhost:5173` (Vite dev server) and `localhost:3000`, with credentials enabled.
- Enforces **stateless session management** (`SessionCreationPolicy.STATELESS`).
- Defines the public/protected route split:

  | Pattern | Method | Access |
  |---|---|---|
  | `/api/auth/**` | any | public |
  | `/ws/**` | any | public |
  | `/api/items`, `/api/items/**` | GET | public |
  | `/api/users/**` | GET | public |
  | `/uploads/**` | GET | public |
  | `/api/upload` | any | public |
  | everything else | any | authenticated |

- Registers `JwtAuthenticationFilter` before `UsernamePasswordAuthenticationFilter` so every protected request is validated against a JWT before Spring's default auth chain runs.
- Exposes `PasswordEncoder` (BCrypt) and `AuthenticationManager` beans for use in the auth service.

---

### `WebSocketConfig`
Configures the STOMP-over-WebSocket message broker.

- Registers the `/ws` endpoint with SockJS fallback so clients that cannot use native WebSockets still connect.
- Enables the in-memory **simple broker** on destination prefixes `/topic` (broadcast) and `/queue` (point-to-point).
- Sets `/app` as the application destination prefix — messages sent to `/app/...` are routed to `@MessageMapping` controller methods.
- Sets `/user` as the user destination prefix — enables `convertAndSendToUser` for private messaging.

---

### `WebSocketAuthInterceptor`
A `ChannelInterceptor` that authenticates incoming STOMP connections.

- Intercepts the `CONNECT` frame on the inbound channel.
- Reads the `Authorization: Bearer <token>` header from the STOMP frame (not the HTTP handshake headers).
- Validates the JWT with `JwtTokenProvider`; on success, loads the `UserDetails` via `CustomUserDetailsService` and sets a `UsernamePasswordAuthenticationToken` as the STOMP session's principal.
- Any frame whose token is missing or invalid simply lacks a principal, leaving downstream security rules to decide how to handle it.

---

### `WebSocketSecurityConfig`
Wires `WebSocketAuthInterceptor` into the inbound message channel.

- Implements `WebSocketMessageBrokerConfigurer` separately from `WebSocketConfig` to keep the broker topology and security concerns decoupled.
- Registers `WebSocketAuthInterceptor` as the sole inbound channel interceptor via `configureClientInboundChannel`.

---

### `StaticResourceConfig`
Serves user-uploaded files as static resources.

- Reads the upload directory from the `app.upload.dir` property (defaults to `uploads` relative to the working directory).
- Maps the URL pattern `/uploads/**` to the filesystem path `file:<uploadDir>/` so uploaded images can be fetched directly by the browser without going through a controller.

---

## Request Authentication Flow

```
HTTP Request
     │
     ▼
JwtAuthenticationFilter          ← validates Bearer token, sets SecurityContext
     │
     ▼
Spring Security FilterChain      ← checks authorizeHttpRequests rules
     │
     ▼
Controller / Handler

WebSocket CONNECT frame
     │
     ▼
WebSocketAuthInterceptor         ← validates Bearer token in STOMP header
     │
     ▼
STOMP session principal set      ← used by @MessageMapping / convertAndSendToUser
```

---

## Key Dependencies

| Bean / Component | Provided by | Consumed by |
|---|---|---|
| `JwtAuthenticationFilter` | `security` package | `SecurityConfig` |
| `JwtTokenProvider` | `security` package | `WebSocketAuthInterceptor` |
| `CustomUserDetailsService` | `security` package | `WebSocketAuthInterceptor` |
| `PasswordEncoder` (BCrypt) | `SecurityConfig` | `AuthService` |
| `AuthenticationManager` | `SecurityConfig` | `AuthController` / `AuthService` |
