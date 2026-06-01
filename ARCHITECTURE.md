# FoundIt — Complete Architecture Guide
### For Beginners: How It's Built, Why It's Built That Way, and How to Build It From Scratch

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [The Layered Architecture](#2-the-layered-architecture)
3. [The Database Design — Thinking in Tables](#3-the-database-design--thinking-in-tables)
4. [Entities — Java Objects That Map to Tables](#4-entities--java-objects-that-map-to-tables)
5. [Repositories — The Database Access Layer](#5-repositories--the-database-access-layer)
6. [DTOs — What You Send and Receive Over HTTP](#6-dtos--what-you-send-and-receive-over-http)
7. [Services — The Brain of the Application](#7-services--the-brain-of-the-application)
8. [Controllers — The HTTP Front Door](#8-controllers--the-http-front-door)
9. [Security — JWT Authentication](#9-security--jwt-authentication)
10. [Real-Time Features — WebSocket and STOMP](#10-real-time-features--websocket-and-stomp)
11. [The Matching Engine](#11-the-matching-engine)
12. [The Claim Workflow](#12-the-claim-workflow)
13. [How to Design It From Scratch](#13-how-to-design-it-from-scratch)
14. [Full API Reference](#14-full-api-reference)
15. [Project File Map](#15-project-file-map)

---

## 1. The Big Picture

This is a **Lost & Found platform** for a university campus. Students can:
- Post items they lost or found
- Get auto-matched with potential counterparts
- Chat with each other in real time
- Verify and claim items they believe belong to them
- Get real-time notifications for all of the above

The system has two sides that talk to each other over HTTP:

```
┌──────────────────────────────────┐        HTTP / WebSocket
│  FRONTEND  (React + Vite)        │ ◄──────────────────────► BACKEND (Spring Boot)
│  runs at localhost:5173          │                           runs at localhost:8081
│  JavaScript / JSX                │                           Java
└──────────────────────────────────┘                           │
                                                               ▼
                                                       PostgreSQL Database
                                                       (tables on disk)
```

**The backend is what this guide focuses on.** The frontend just calls it via HTTP calls.

---

## 2. The Layered Architecture

Spring Boot applications are almost always organized in **4 layers**, each with a distinct responsibility. Think of it as a relay race — a request passes through each layer in order:

```
HTTP Request from Frontend
         │
         ▼
┌─────────────────────────────┐
│        CONTROLLER           │  ← Receives HTTP. Extracts data. Calls service.
│  (e.g. ItemController)      │    Has no business logic.
└────────────┬────────────────┘
             │  calls
             ▼
┌─────────────────────────────┐
│         SERVICE             │  ← Business logic lives here. Validates rules.
│  (e.g. ItemService)         │    Calls repository. Converts Entity ↔ DTO.
└────────────┬────────────────┘
             │  calls
             ▼
┌─────────────────────────────┐
│        REPOSITORY           │  ← Talks to the database. Nothing else.
│  (e.g. ItemRepository)      │    Spring Data generates the SQL for you.
└────────────┬────────────────┘
             │  loads/saves
             ▼
┌─────────────────────────────┐
│    ENTITY (MODEL)           │  ← Java class that represents one database table row.
│  (e.g. Item.java)           │    Fields = columns. Annotations tell Hibernate the schema.
└─────────────────────────────┘
```

**The golden rule:** No layer may skip a layer. A Controller must never query the database directly. A Service must never handle HTTP headers. This separation keeps everything testable and maintainable.

---

## 3. The Database Design — Thinking in Tables

### How to figure out what tables you need

Start from the **nouns** in your requirements. Every real-world "thing" you need to store usually becomes its own table.

Requirements said:
- "Students can register and log in" → need a **users** table
- "Students can post lost or found items" → need an **items** table
- "Items get auto-matched" → need a **matchings** table (to store each match pair)
- "Students can claim an item" → need a **claim_requests** table (to track who claimed what)
- "Students can chat" → need a **chat_messages** table
- "Students get notifications" → need a **notifications** table
- "Students get password reset emails" → need a **password_reset_tokens** table
- "Track what actions a user took" → need a **user_history** table

That gives you **8 tables**.

### Relationships between tables

After listing the tables, ask: *how do they relate to each other?*

| Relationship | Meaning | Example |
|---|---|---|
| **One-to-Many** | One row in A owns many rows in B | One `User` posts many `Items` |
| **Many-to-One** | Many rows in B belong to one in A | Many `Items` belong to one `User` |
| **Many-to-Many** | Each row in A can relate to many in B and vice versa | Handled via a join table (we use `Match` for lost+found items) |

### The full schema drawn out

```
users
  id (PK)
  name
  email (unique)
  student_id
  password (bcrypt hash)
  profile_picture
  created_at

items
  id (PK)
  user_id (FK → users.id)        ← the person who posted it
  name
  item_type  (LOST / FOUND)
  status     (LOST / FOUND / CLAIMED)
  description
  location_found
  category
  image_url
  date_posted
  date_event
  claimant_id                    ← user id of whoever claimed it
  is_public                      ← whether reporter's name is shown publicly

matchings
  id (PK)
  lost_item_id (FK → items.id)
  found_item_id (FK → items.id)
  similarity_score (float)

claim_requests
  id (PK)
  item_id (FK → items.id)
  claimant_id (FK → users.id)
  status (PENDING / APPROVED / REJECTED)
  created_at
  UNIQUE(item_id, claimant_id)   ← one person can only claim each item once

chat_messages
  id (PK)
  sender_id (FK → users.id)
  recipient_id (FK → users.id)
  content (TEXT)
  sent_at
  read (boolean)
  sender_is_anonymous (boolean)
  related_item_id                ← which item the conversation is about (can be null)

notifications
  id (PK)
  user_id (FK → users.id)       ← who receives this notification
  match_id (FK → matchings.id, nullable)
  message
  chat_sender_id
  chat_sender_name
  related_item_id
  status (UNREAD / READ)
  timestamp

password_reset_tokens
  id (PK)
  email
  code (6-digit OTP)
  expires_at

user_history
  id (PK)
  user_id (FK → users.id)
  item_id (FK → items.id, nullable)
  action_type (e.g. "REGISTERED", "POSTED_LOST", "CLAIMED_ITEM")
  timestamp
```

> **Key insight:** You don't write these SQL `CREATE TABLE` statements manually. Instead, you write Java classes (Entities) annotated with `@Entity`, and Hibernate generates the tables automatically when the app starts — because `spring.jpa.hibernate.ddl-auto=update` is set.

---

## 4. Entities — Java Objects That Map to Tables

An **Entity** is a Java class with special annotations that tell Hibernate "this class is a database table". Each field becomes a column.

### Annotation cheat sheet

| Annotation | What it does |
|---|---|
| `@Entity` | This class is a table |
| `@Table(name = "items")` | Override the table name |
| `@Id` | This field is the primary key |
| `@GeneratedValue(strategy = GenerationType.IDENTITY)` | Auto-increment: DB assigns the ID |
| `@Column(unique = true, nullable = false)` | Add constraints to a column |
| `@Column(columnDefinition = "TEXT")` | Use TEXT type (for long strings) |
| `@Enumerated(EnumType.STRING)` | Store enum as a string like "LOST", not a number |
| `@ManyToOne(fetch = FetchType.LAZY)` | Foreign key. LAZY = don't load related object unless asked |
| `@JoinColumn(name = "user_id")` | The foreign key column name |
| `@CreationTimestamp` | Automatically set to current time when row is created |

### Lombok annotations (code generation)

| Annotation | What it generates |
|---|---|
| `@Data` | All getters, setters, `equals`, `hashCode`, `toString` |
| `@Builder` | A builder pattern: `Item.builder().name("Phone").build()` |
| `@NoArgsConstructor` | Empty constructor (required by Hibernate) |
| `@AllArgsConstructor` | Constructor with all fields |

### The User entity

```java
@Entity
@Table(name = "users")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class User implements UserDetails {   // ← implements Spring Security interface
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(unique = true, nullable = false)
    private String email;                    // ← used as the "username" for login

    private String password;                 // ← stored as bcrypt hash, never plain text
    ...
}
```

`User` implements `UserDetails` — a Spring Security interface. This means Spring Security can use `User` objects directly for authentication without any adapter. The methods like `getUsername()`, `isAccountNonExpired()` etc. are required by that interface.

### The Item entity

```java
@Enumerated(EnumType.STRING)
private ItemStatus itemType;   // LOST or FOUND — what type was it reported as

@Enumerated(EnumType.STRING)
private ItemStatus status;     // current state: LOST, FOUND, or CLAIMED
```

Notice `itemType` and `status` both use the same `ItemStatus` enum but mean different things:
- `itemType` = what was it originally reported as (never changes)
- `status` = current state (changes to CLAIMED when someone claims it)

---

## 5. Repositories — The Database Access Layer

A **Repository** is an interface that Spring Data JPA implements automatically. You declare the methods you need — Spring generates the SQL.

```java
@Repository
public interface ItemRepository extends JpaRepository<Item, Long> {
    // Spring auto-generates: SELECT * FROM items WHERE status != ? ORDER BY date_posted DESC
    List<Item> findByStatusNotOrderByDatePostedDesc(ItemStatus status);

    // Spring auto-generates: SELECT * FROM items WHERE user_id = ? ORDER BY date_posted DESC
    List<Item> findByUserIdOrderByDatePostedDesc(Long userId);
}
```

### How Spring Data method naming works

The method name is the query. Spring parses it:

| Method name | Generated SQL |
|---|---|
| `findByEmail(String email)` | `WHERE email = ?` |
| `findByStatusNot(ItemStatus s)` | `WHERE status != ?` |
| `findByStatusAndCategoryIgnoreCase(...)` | `WHERE status = ? AND LOWER(category) = LOWER(?)` |
| `existsByEmail(String email)` | `SELECT COUNT(*) > 0 WHERE email = ?` |
| `deleteByEmail(String email)` | `DELETE WHERE email = ?` |
| `OrderByDatePostedDesc` | `ORDER BY date_posted DESC` |

### Custom JPQL queries

When the auto-naming isn't enough, use `@Query` with JPQL (Java Persistence Query Language — like SQL but uses class names, not table names):

```java
@Query("SELECT i FROM Item i WHERE i.status <> :claimed AND " +
       "(LOWER(i.name) LIKE LOWER(CONCAT('%', :kw, '%')) OR " +
       "LOWER(i.description) LIKE LOWER(CONCAT('%', :kw, '%')))")
List<Item> searchByKeyword(@Param("kw") String keyword, @Param("claimed") ItemStatus claimed);
```

Note: `Item` is the class name, `items` is the table name. JPQL uses the class.

For complex queries that JPQL can't easily express, `nativeQuery = true` lets you write plain SQL:

```java
@Query(value = "SELECT CASE WHEN sender_id = :uid THEN recipient_id ELSE sender_id END ...",
       nativeQuery = true)
List<Object[]> findConversationPartnerAndItemIds(@Param("uid") Long userId);
```

### Why not just use the database directly?

The repository pattern gives you:
1. **Database independence** — swap PostgreSQL for MySQL, change one line in `pom.xml`
2. **Testability** — easily mock repositories in unit tests
3. **Zero boilerplate** — Spring writes the SQL so you don't have to

---

## 6. DTOs — What You Send and Receive Over HTTP

A **DTO (Data Transfer Object)** is a plain Java class with just fields and getters/setters. It carries data between layers.

### Why DTOs instead of sending Entities directly?

This is a critical design decision. Consider `User`:
```
User entity has: id, name, email, password (hashed), profilePicture, createdAt
```

If you return the `User` entity directly from an API:
- The `password` hash gets sent to the browser — **security risk**
- `@ManyToOne` relationships could cause infinite JSON loops
- Adding a field to the response format would also change the database schema

DTOs fix all of this. You control exactly what gets serialized.

### Request DTOs (incoming data)

Used when the **client sends data** to the server:

```java
// RegisterRequest.java — what the browser sends when a user signs up
@Data
public class RegisterRequest {
    @NotBlank private String name;
    @Email private String email;
    private String studentId;
    @Size(min = 6) private String password;
}
```

Validation annotations like `@NotBlank`, `@Email`, `@Size` are checked automatically when the controller uses `@Valid @RequestBody`. If they fail, Spring returns 400 Bad Request automatically.

```java
// ItemRequest.java — what the browser sends when posting a lost/found item
@Data
public class ItemRequest {
    @NotBlank private String name;
    private String description;
    private String category;
    private String locationFound;
    private String imageUrl;
    private LocalDate dateEvent;
    private boolean isPublic = true;
}
```

### Response DTOs (outgoing data)

Used when the **server sends data** back to the browser:

```java
// ItemResponse.java — what the API returns for each item
@Data @Builder @AllArgsConstructor @NoArgsConstructor
public class ItemResponse {
    private Long id;
    private String name;
    private String description;
    // ... all the safe fields
    private String reporterName;         // null if isPublic = false
    private String reporterEmail;        // null if isPublic = false
    private Boolean currentUserHasPendingClaim;   // computed, not in DB
    private Integer pendingClaimCount;            // computed, not in DB
}
```

Notice `currentUserHasPendingClaim` and `pendingClaimCount` — these don't exist as database columns. They're computed in the service layer and included in the response. This is why you need a DTO: the response shape is richer than the database shape.

### Full DTO inventory

| DTO | Direction | Purpose |
|---|---|---|
| `RegisterRequest` | In | New user registration |
| `LoginRequest` | In | Email + password login |
| `AuthResponse` | Out | JWT token + user info after login/register |
| `ItemRequest` | In | Create or update an item |
| `ItemResponse` | Out | Full item data with computed fields |
| `ClaimVerificationRequest` | In | Claimer's description for valuable item verification |
| `ClaimVerificationResponse` | Out | Verification result + score + item |
| `ClaimRequestResponse` | Out | Details of a pending claim request |
| `ChatMessageRequest` | In | Message content + optional itemId |
| `ChatMessageResponse` | Out | Message with sender name, anonymity flag |
| `ConversationSummary` | Out | Sidebar entry: last message, unread count |
| `NotificationResponse` | Out | Notification with match/item references |
| `UserProfileResponse` | Out | Public user info (no password) |
| `UpdateProfileRequest` | In | Name + profile picture update |
| `HistoryResponse` | Out | One action log entry |
| `ForgotPasswordRequest` | In | Email for password reset |
| `VerifyResetCodeRequest` | In | Email + 6-digit OTP |
| `ResetPasswordRequest` | In | Email + code + new password |

---

## 7. Services — The Brain of the Application

Services contain all the **business logic** — the rules that make this app do what it's supposed to do. Nothing else should contain business rules.

### The @Service annotation

```java
@Service
@RequiredArgsConstructor  // Lombok: generates constructor for all final fields
public class ItemService {
    private final ItemRepository itemRepository;    // injected by Spring
    private final UserRepository userRepository;   // injected by Spring
    // ...
}
```

`@RequiredArgsConstructor` combined with `private final` fields means Spring automatically **injects** (provides) the dependencies. You don't `new` anything manually. This is called **Dependency Injection** — one of Spring's core features.

### Transactions

```java
@Transactional
public ItemResponse createItem(ItemRequest req, ItemStatus itemType, Long userId) { ... }

@Transactional(readOnly = true)
public List<ItemResponse> getItems(...) { ... }
```

`@Transactional` wraps the method in a database transaction. If any exception is thrown inside, all database changes are rolled back. `readOnly = true` tells Hibernate to skip dirty-checking on loaded entities, which improves performance for read-only queries.

### AuthService — User registration and login

```
Register flow:
1. Validate email ends with @fulbright.edu.vn
2. Check email is not already registered
3. Hash the password with BCrypt
4. Save the User
5. Log "REGISTERED" in user_history
6. Generate and return a JWT token

Login flow:
1. Find user by email
2. Compare submitted password with stored bcrypt hash
3. Generate and return a JWT token
```

Notice: passwords are **never stored in plain text**. `BCryptPasswordEncoder` turns "mypassword" into something like `$2a$10$eImiTXuWVxfM37uY4JANjQ...` — a one-way hash. You can verify, but you can't reverse it.

### ItemService — The largest and most complex service

Key responsibilities:
- Create items (lost or found) and trigger the matching engine
- Browse/search/filter items
- Handle two types of claim workflows (valuable vs non-valuable)
- Ownership checks before edit/delete
- Cascading deletes (remove notifications, matches, history when an item is deleted)
- The `toResponse()` mapper that converts an `Item` entity to an `ItemResponse` DTO

The `toResponse()` method is important to understand:

```java
public ItemResponse toResponse(Item item, Long currentUserId) {
    boolean pub = item.isPublic();

    // Query DB to check if current user has a pending claim
    boolean currentUserHasPendingClaim = currentUserId != null
        && claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(...);

    // Count all pending claims for this item
    int pendingClaimCount = claimRequestRepository.findByItemIdAndStatus(...).size();

    return ItemResponse.builder()
        // Only include reporter name/email if item is public
        .reporterName(pub ? item.getUser().getName() : null)
        .reporterEmail(pub ? item.getUser().getEmail() : null)
        // ... etc
        .build();
}
```

This method is called every time an item needs to be returned in an API response. It shows how a DTO is assembled from multiple sources (the entity + extra DB queries + conditional logic).

### MatchingService — The auto-matching engine

When a new item is posted, `MatchingService.findMatchesForItem()` runs automatically:

```
1. Get all existing items of the OPPOSITE type (if new item is LOST, get all FOUND items)
2. Skip items that are already CLAIMED
3. For each candidate, calculate Jaccard similarity:
   - Build a "bag of words" from name + description + location
   - Remove stop words (the, a, is, for, etc.)
   - Remove short words (< 3 chars)
   - Jaccard similarity = |intersection| / |union|
4. If similarity >= 0.60 (60%), save a Match record
5. Send notifications to both users: "Potential match found!"
```

**Jaccard similarity** example:
- Lost item text tokens: `{phone, black, samsung, library}`
- Found item text tokens: `{samsung, black, phone, cafeteria}`
- Intersection: `{phone, black, samsung}` — 3 words
- Union: `{phone, black, samsung, library, cafeteria}` — 5 words
- Score: 3/5 = 0.60 → Match!

### NotificationService — Delivering notifications

Two delivery channels:
1. **Database**: Every notification is saved to the `notifications` table
2. **WebSocket push**: The notification is also immediately pushed to the user's browser in real time via `SimpMessagingTemplate`

```java
private void pushToUser(User user, NotificationResponse response) {
    messagingTemplate.convertAndSendToUser(
        user.getEmail(),       // the user's "channel name"
        "/queue/notifications", // the specific destination
        response);             // the payload (automatically serialized to JSON)
}
```

If the user is offline, they still get the notification from the database next time they load the page.

### ChatService — Real-time messaging

Each conversation is identified by `(senderId, recipientId, itemId)`. The `itemId` allows separate conversation threads for different items — you can chat with the same person about two different items in separate threads.

The **anonymity feature**: If a user posted an item with `isPublic = false`, their name is hidden. The chat shows "Anonymous Member" instead. The anonymity is tracked per-message with `senderIsAnonymous`.

---

## 8. Controllers — The HTTP Front Door

A Controller is decorated with `@RestController` and maps HTTP routes to service method calls. Controllers should be thin — just extract data from the request, call the service, and return the result.

### URL mapping annotations

```java
@RestController
@RequestMapping("/api/items")   // base path for all methods in this class
public class ItemController {

    @GetMapping                 // GET /api/items
    @GetMapping("/{id}")        // GET /api/items/42
    @PostMapping("/lost")       // POST /api/items/lost
    @PutMapping("/{id}")        // PUT /api/items/42
    @DeleteMapping("/{id}")     // DELETE /api/items/42
}
```

### Extracting data from requests

```java
@GetMapping
public ResponseEntity<List<ItemResponse>> getItems(
    @RequestParam(required = false) String status,     // ?status=LOST
    @RequestParam(required = false) String category,   // ?category=Electronics
    @AuthenticationPrincipal User currentUser) {       // the logged-in user (from JWT)
    ...
}

@PostMapping("/lost")
public ResponseEntity<ItemResponse> reportLost(
    @Valid @RequestBody ItemRequest request,           // JSON body → ItemRequest object
    @AuthenticationPrincipal User currentUser) {       // logged-in user
    ...
}
```

`@AuthenticationPrincipal User currentUser` — Spring automatically extracts the currently authenticated `User` object from the security context (which was populated by the JWT filter). No manual session lookups needed.

### ResponseEntity

`ResponseEntity<T>` wraps the response with a status code:

```java
return ResponseEntity.ok(result);          // 200 OK with body
return ResponseEntity.noContent().build(); // 204 No Content (for DELETE)
return ResponseEntity.badRequest().body(Map.of("message", "...")); // 400
```

### Full API route table

| Method | URL | Auth? | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Get JWT token |
| POST | `/api/auth/forgot-password` | No | Send OTP email |
| POST | `/api/auth/verify-reset-code` | No | Verify OTP |
| POST | `/api/auth/reset-password` | No | Set new password |
| GET | `/api/items` | Optional | Browse all items (filter/search) |
| GET | `/api/items/{id}` | Optional | Get one item |
| POST | `/api/items/lost` | Yes | Report lost item |
| POST | `/api/items/found` | Yes | Report found item |
| GET | `/api/items/my` | Yes | My posted items |
| PUT | `/api/items/{id}` | Yes | Edit my item |
| DELETE | `/api/items/{id}` | Yes | Delete my item |
| POST | `/api/items/{id}/claim/simple` | Yes | Request simple claim (non-valuable) |
| POST | `/api/items/{id}/claim/verify` | Yes | Verify claim (valuable item) |
| GET | `/api/items/{id}/claims` | Yes | View pending claims (finder only) |
| POST | `/api/items/{id}/claims/{claimId}/approve` | Yes | Approve a claim |
| POST | `/api/items/{id}/recover` | Yes | Mark lost item as self-recovered |
| POST | `/api/items/{fId}/match/{lId}/approve` | Yes | Approve via match |
| GET | `/api/matches/item/{itemId}` | Yes | Get match suggestions for item |
| GET | `/api/notifications` | Yes | Get all notifications |
| PUT | `/api/notifications/{id}/read` | Yes | Mark notification read |
| GET | `/api/notifications/unread-count` | Yes | Unread count badge |
| GET | `/api/messages/{partnerId}` | Yes | Get conversation |
| POST | `/api/messages/{recipientId}` | Yes | Send message |
| GET | `/api/conversations` | Yes | Conversation list (sidebar) |
| GET | `/api/users/me` | Yes | My profile |
| PUT | `/api/users/me` | Yes | Update profile |
| POST | `/api/users/me/change-password` | Yes | Change password |
| GET | `/api/users/me/history` | Yes | Activity history |
| GET | `/api/users/{id}` | No | View another user's profile |
| POST | `/api/upload` | No | Upload an image file |

---

## 9. Security — JWT Authentication

### The problem: HTTP is stateless

Every HTTP request is independent. The server doesn't remember who made the previous request. So how does it know who you are?

Traditional answer: **Sessions** — server stores who's logged in, gives you a session cookie.
Modern answer (used here): **JWT (JSON Web Token)** — server gives you a signed token. You send it with every request.

### What is a JWT?

A JWT is a string made of 3 parts separated by dots: `header.payload.signature`

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyQGZ1bGJyaWdodC5lZHUudm4iLCJ1c2VySWQiOjF9.SIGNATURE
     header                        payload                                  signature
```

The payload (when decoded) contains:
```json
{
  "sub": "user@fulbright.edu.vn",   ← the user's email (subject)
  "userId": 1,                        ← custom claim
  "iat": 1700000000,                  ← issued at
  "exp": 1700086400                   ← expires at (24 hours later)
}
```

The signature is a cryptographic hash of header + payload using a secret key. Only the server knows the secret key, so only the server can generate valid tokens. If someone tampers with the payload, the signature won't match.

### The authentication flow

```
1. User logs in → POST /api/auth/login with {email, password}
2. Server verifies password with BCrypt
3. Server generates JWT: Jwts.builder().subject(email).signWith(secretKey).compact()
4. Server returns JWT to browser
5. Browser stores JWT (in localStorage or memory)

Later, for every protected request:
6. Browser sends: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
7. JwtAuthenticationFilter intercepts the request
8. Filter extracts token from header
9. Filter validates token (signature check + expiry check)
10. Filter loads User from database using email from token
11. Filter puts User into SecurityContext
12. Controller method receives User via @AuthenticationPrincipal
```

### The JWT filter (JwtAuthenticationFilter)

```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(request, response, filterChain) {
        // 1. Extract "Bearer xxxxx" from Authorization header
        String token = extractTokenFromRequest(request);

        // 2. If token is present and valid:
        if (token != null && jwtTokenProvider.validateToken(token)) {
            String email = jwtTokenProvider.getEmailFromToken(token);
            UserDetails user = userDetailsService.loadUserByUsername(email);
            // 3. Create authentication object and store in security context
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities())
            );
        }
        // 4. Continue processing the request
        filterChain.doFilter(request, response);
    }
}
```

This filter runs on **every single HTTP request** before it reaches the controller.

### SecurityConfig — What's public, what's protected

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()   // CORS preflight
    .requestMatchers("/api/auth/**").permitAll()              // login/register: no token needed
    .requestMatchers("/ws/**").permitAll()                    // WebSocket handshake
    .requestMatchers(HttpMethod.GET, "/api/items", "/api/items/**").permitAll() // browse items: public
    .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()  // view images: public
    .anyRequest().authenticated()                             // everything else: need JWT
)
```

### Password hashing with BCrypt

BCrypt is a one-way hash function with a built-in cost factor (makes it slow — that's the point). The same password hashed twice will produce different strings (because of a random salt), but `passwordEncoder.matches(plain, hashed)` always works.

```java
// When registering:
user.setPassword(passwordEncoder.encode("mypassword"));
// Stored: "$2a$10$eImiTXuWVxfM37uY4JANjQulHm7kJnGnmC0u7yX4nklK2tZC..."

// When logging in:
boolean correct = passwordEncoder.matches("mypassword", user.getPassword());
// Returns: true
```

---

## 10. Real-Time Features — WebSocket and STOMP

### Why WebSocket?

HTTP is **request-response**: the browser asks, the server answers. The browser can't receive data unless it asks first.

WebSocket is a **persistent two-way connection**: once connected, the server can push data to the browser at any time. This is what makes chat and live notifications work without polling.

### STOMP — a messaging protocol on top of WebSocket

Raw WebSocket sends strings. STOMP adds structure: topics, subscriptions, message routing. Spring's `SimpMessagingTemplate` uses STOMP.

### WebSocket configuration

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig {
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")          // browser connects here
                .withSockJS();               // fallback for browsers without WebSocket
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue"); // in-memory broker
        registry.setApplicationDestinationPrefixes("/app");    // messages TO server
        registry.setUserDestinationPrefix("/user");            // messages TO specific user
    }
}
```

### How real-time notifications work

```
1. Browser connects to ws://localhost:8081/ws (sends JWT in STOMP header)
2. WebSocketAuthInterceptor reads JWT, authenticates user
3. Browser subscribes to: /user/queue/notifications
4. When server calls messagingTemplate.convertAndSendToUser(email, "/queue/notifications", data):
   Spring routes the message to the browser subscribed under that email
5. Browser receives the notification JSON and shows it instantly
```

The same mechanism is used for chat messages, routed to `/user/queue/messages`.

### WebSocket JWT authentication (WebSocketAuthInterceptor)

The standard HTTP `JwtAuthenticationFilter` doesn't run for WebSocket connections. So there's a separate `ChannelInterceptor` that reads the JWT from the STOMP `CONNECT` frame headers:

```java
public Message<?> preSend(Message<?> message, MessageChannel channel) {
    StompHeaderAccessor accessor = ...;
    if (StompCommand.CONNECT.equals(accessor.getCommand())) {
        String token = accessor.getFirstNativeHeader("Authorization").substring(7);
        // Authenticate and set principal on the connection
        accessor.setUser(auth);
    }
    return message;
}
```

---

## 11. The Matching Engine

The auto-matching engine runs every time a new item is posted. It's the feature that makes this platform smarter than a simple bulletin board.

### Algorithm: Jaccard Similarity

Jaccard similarity measures the overlap between two sets.

$$\text{Jaccard}(A, B) = \frac{|A \cap B|}{|A \cup B|}$$

Steps:
1. Take the item's `name + description + location` as a single text
2. Split into individual words (tokens)
3. Remove stop words (`the`, `a`, `for`, `and`, etc.)
4. Remove words with 3 or fewer characters
5. Each item becomes a **set of keywords**
6. Compare the sets of a LOST item and a FOUND item
7. If overlap ≥ 60%, they're considered a potential match

### Why async (`@Async`)?

```java
@Async
@Transactional
public void findMatchesForItem(Item newItem) { ... }
```

Matching could take time if there are thousands of items. `@Async` tells Spring to run this in a background thread so the HTTP response (`createItem`) returns immediately without waiting for matching to finish. The user gets their response in milliseconds; matching happens behind the scenes.

---

## 12. The Claim Workflow

Claiming is the most complex feature. There are two different flows based on whether the item is "valuable":

### Non-valuable items (simple claim)

```
Claimant clicks "I Found This" →
  POST /api/items/{id}/claim/simple
    → Create ClaimRequest (status=PENDING)
    → Notify finder: "[Name] wants to claim [item name]"

Finder sees pending claim →
  GET /api/items/{id}/claims
    → Returns list of pending ClaimRequests

Finder approves →
  POST /api/items/{id}/claims/{claimId}/approve
    → Set approved ClaimRequest status=APPROVED
    → Set all other pending claims status=REJECTED
    → Set item status=CLAIMED
    → Set item.claimantId = claimant's userId
```

### Valuable items (score-based verification)

```
Claimant submits description form →
  POST /api/items/{id}/claim/verify
  with body: { name, location, description }

Service runs matchesClaim() scoring:
  +40 pts if claimant's description contains item's name (or vice versa)
  +30 pts if location descriptions overlap
  +30 pts if ≥30% of description keywords match

Score ≥ 50:
  → Create ClaimRequest (status=PENDING)
  → Notify claimant: "High chance match. Finder has been notified."
  → Notify finder: "[Name] has verified to claim this item."

Score < 50:
  → Notify claimant: "Your claim did not match our records."
  → No ClaimRequest created
```

---

## 13. How to Design It From Scratch

This section walks through the **design thinking process** you'd use if you were starting this project from a blank page.

### Step 1: Understand the requirements

Write down what the app must do in plain English:
- Users must be able to create accounts and log in
- Users can report a lost item or a found item
- Items should be browsable by anyone
- The system should suggest potential matches between lost and found items
- Claimers should be able to claim an item by verifying they own it
- Users should be able to chat privately
- All important events should trigger in-app notifications

### Step 2: Identify the nouns → your entities

Underline the nouns in the requirements. Each significant noun is usually a table:
- **User** → `users` table
- **Item** → `items` table
- **Match** → `matchings` table (to store match pairs)
- **Claim** → `claim_requests` table
- **Message** → `chat_messages` table
- **Notification** → `notifications` table
- **Password reset** → `password_reset_tokens` table
- **History/Audit log** → `user_history` table

### Step 3: Identify relationships

For each pair of entities, ask: "Does A know about B? Does B know about A? How many?"

- A User posts many Items → `Item` has a `user_id` foreign key (Many-to-One)
- A Match links one LOST Item to one FOUND Item → `Match` has two foreign keys: `lost_item_id` and `found_item_id`
- A ClaimRequest links an Item and a User → has both `item_id` and `claimant_id`
- A Notification belongs to a User → has `user_id`

### Step 4: Design the Entity classes

For each entity:
1. What are the required fields? What's optional?
2. What type is each field? (`String`, `Long`, `LocalDateTime`, `enum`?)
3. What constraints exist? (unique, not null, min length?)
4. What's the primary key? (always use auto-increment `Long id`)

Then annotate:
- `@Entity`, `@Table` on the class
- `@Id`, `@GeneratedValue` on the id
- `@Column` for constraints
- `@Enumerated(EnumType.STRING)` for enums
- `@ManyToOne @JoinColumn` for foreign keys
- `@CreationTimestamp` for auto timestamps

### Step 5: Design the DTOs

For each entity, ask:
- What does the client send to CREATE one? → Request DTO
- What does the server return when the client READS one? → Response DTO
- Are they the same? Almost never — the response usually has more (computed) fields and fewer (sensitive) fields

Draw the difference:

```
ItemRequest (client → server):     ItemResponse (server → client):
  name                               id
  description                        name
  category                           description
  locationFound                      category
  imageUrl                           locationFound
  dateEvent                          imageUrl
  isPublic                           datePosted         ← server sets this
                                     status             ← server sets this
                                     reporterName       ← conditionally hidden
                                     currentUserHasPendingClaim  ← computed
                                     pendingClaimCount  ← computed
```

### Step 6: Design the Services

For each major feature, create a service:
- `AuthService` — registration, login, password reset
- `ItemService` — CRUD + claim workflows (most complex)
- `MatchingService` — auto-matching algorithm
- `NotificationService` — send and read notifications
- `ChatService` — messages and conversations

Inside each service, list the operations as methods. For each method, think:
- What inputs does it need?
- What database queries does it make?
- What business rules does it enforce? (ownership, status checks, duplicates)
- What does it return?
- Should it be transactional?

### Step 7: Design the Controllers

Group routes by resource:
- `/api/auth/**` → AuthController
- `/api/items/**` → ItemController
- `/api/matches/**` → MatchController
- `/api/notifications/**` → NotificationController
- `/api/messages/**` and `/api/conversations` → ChatController
- `/api/users/**` → UserController
- `/api/upload` → FileUploadController

Each method in a controller:
1. Has an HTTP method annotation (`@GetMapping`, `@PostMapping`, etc.)
2. Extracts parameters from path, query, body, or auth principal
3. Calls exactly ONE service method
4. Returns a `ResponseEntity`

### Step 8: Add security

Decide:
- Which endpoints are public? (browse items, login, register)
- Which require authentication? (post item, claim, chat, profile)

Implement:
1. `User` implements `UserDetails`
2. `CustomUserDetailsService` loads user by email
3. `JwtTokenProvider` generates and validates JWTs
4. `JwtAuthenticationFilter` intercepts every request
5. `SecurityConfig` defines the rules and hooks everything together

### Step 9: Add WebSocket for real-time features

Decide which events need real-time push:
- New notification → push to recipient
- New chat message → push to recipient

Implement:
1. `WebSocketConfig` — register the `/ws` endpoint, configure broker
2. `WebSocketAuthInterceptor` — authenticate STOMP connections with JWT
3. `SimpMessagingTemplate` — inject into services to push messages

---

## 14. Full API Reference

See Section 8 (Controllers) for the complete API route table.

### Authentication header format
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyQGZ1b...
```

### Common response codes
| Code | Meaning |
|---|---|
| 200 OK | Success with body |
| 204 No Content | Success, no body (delete) |
| 400 Bad Request | Invalid input or business rule violation |
| 401 Unauthorized | No token or invalid token |
| 403 Forbidden | Valid token but insufficient permission |
| 404 Not Found | Resource doesn't exist |

### Error response format
```json
{ "message": "You can only delete your own items" }
```

---

## 15. Project File Map

```
backend/src/main/java/com/foundit/
│
├── FoundItApplication.java             ← Entry point: @SpringBootApplication
│
├── model/                              ← LAYER 1: Entities (database tables)
│   ├── User.java                       ← users table, implements UserDetails
│   ├── Item.java                       ← items table
│   ├── ItemStatus.java                 ← enum: LOST / FOUND / CLAIMED
│   ├── Match.java                      ← matchings table (auto-match pairs)
│   ├── ClaimRequest.java               ← claim_requests table
│   ├── ClaimRequestStatus.java         ← enum: PENDING / APPROVED / REJECTED
│   ├── ChatMessage.java                ← chat_messages table
│   ├── Notification.java               ← notifications table
│   ├── NotificationStatus.java         ← enum: UNREAD / READ
│   ├── UserHistory.java                ← user_history table (audit log)
│   └── PasswordResetToken.java         ← password_reset_tokens table
│
├── repository/                         ← LAYER 2: Data access (Spring Data JPA)
│   ├── UserRepository.java
│   ├── ItemRepository.java
│   ├── MatchRepository.java
│   ├── ClaimRequestRepository.java
│   ├── ChatMessageRepository.java
│   ├── NotificationRepository.java
│   ├── UserHistoryRepository.java
│   └── PasswordResetTokenRepository.java
│
├── dto/                                ← Data Transfer Objects (request/response shapes)
│   ├── [See Section 6 for full list]
│
├── service/                            ← LAYER 3: Business logic
│   ├── AuthService.java                ← register, login, password reset
│   ├── ItemService.java                ← CRUD, claim workflows, toResponse()
│   ├── MatchingService.java            ← Jaccard similarity auto-matching
│   ├── NotificationService.java        ← create + push notifications
│   └── ChatService.java                ← messages, conversation list
│
├── controller/                         ← LAYER 4: HTTP endpoints
│   ├── AuthController.java             ← /api/auth/**
│   ├── ItemController.java             ← /api/items/**
│   ├── MatchController.java            ← /api/matches/**
│   ├── NotificationController.java     ← /api/notifications/**
│   ├── ChatController.java             ← /api/messages/**, /api/conversations
│   ├── UserController.java             ← /api/users/**
│   └── FileUploadController.java       ← /api/upload
│
├── security/                           ← JWT implementation
│   ├── JwtTokenProvider.java           ← generate, validate, read JWT
│   ├── JwtAuthenticationFilter.java    ← runs on every HTTP request
│   └── CustomUserDetailsService.java   ← loads User by email for Spring Security
│
├── config/                             ← Spring configuration beans
│   ├── SecurityConfig.java             ← security rules, CORS, BCrypt bean
│   ├── WebSocketConfig.java            ← STOMP broker, /ws endpoint
│   └── WebSocketAuthInterceptor.java   ← JWT auth for WebSocket connections
│
└── exception/
    └── GlobalExceptionHandler.java     ← @RestControllerAdvice: catches exceptions
                                           across all controllers, returns JSON errors
```

---

## Quick Reference: Key Concepts

| Concept | What it is | Where in this project |
|---|---|---|
| `@Entity` | Java class = database table | `model/` package |
| `@Repository` | Database query interface | `repository/` package |
| `JpaRepository<T, ID>` | Provides CRUD methods for free | Every repository extends this |
| DTO | Data shape for HTTP; separate from entity | `dto/` package |
| `@Service` | Business logic class | `service/` package |
| `@RestController` | HTTP route handler | `controller/` package |
| `@Transactional` | Wraps method in a DB transaction | Service methods |
| `@RequiredArgsConstructor` | Auto-generates DI constructor | Services, controllers |
| JWT | Signed token that proves who you are | `security/` package |
| BCrypt | One-way password hashing | `SecurityConfig`, `AuthService` |
| `@AuthenticationPrincipal` | Injects the logged-in User into a method | Controller parameters |
| WebSocket + STOMP | Persistent connection for real-time push | `config/` + `service/` |
| `@Async` | Run method in a background thread | `MatchingService` |
| Jaccard similarity | Set overlap metric for text matching | `MatchingService` |
| `@RestControllerAdvice` | Global exception handler | `exception/` package |
