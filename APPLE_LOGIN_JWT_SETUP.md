# Apple Login with JWT Integration

This document describes the Apple Sign In authentication integration with JWT token generation for the KnowDose backend.

## Setup

### Environment Variables

Add the following environment variables to your `.env` file:

```env
# Apple Sign In Configuration
APPLE_APP_ID=com.knowdose.app  # Your Apple App ID (Bundle ID)
JWT_SECRET=your-very-secure-random-secret-key-change-in-production

# Firebase Configuration (already configured)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

**IMPORTANT:** Change `JWT_SECRET` to a strong random string in production. For development, a default is provided but should NOT be used in production.

## API Endpoints

### 1. Apple Login
**POST** `/api/users/login/apple`

Authenticate a user with Apple Sign In and receive a JWT token.

**Request Body:**
```json
{
  "identityToken": "eyJhbGciOiJIUzI1NiIsInR5cCI...",  // Apple identity token from client
  "user": {
    "name": {
      "firstName": "John",
      "givenName": "John"
    },
    "email": "user@example.com"
  }
}
```

**Response (Success - 200):**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "apple_123456789",
  "user": {
    "email": "user@example.com",
    "displayName": "John",
    "appleUserId": "123456789"
  }
}
```

**Response (Error - 400/401/500):**
```json
{
  "error": "Invalid or expired Apple identity token"
}
```

### 2. Verify JWT Token
**POST** `/api/users/verify-token`

Verify if a JWT token is still valid and get its expiration info.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Success - 200):**
```json
{
  "ok": true,
  "userId": "apple_123456789",
  "expiresIn": 604800  // seconds remaining
}
```

**Response (Error - 401):**
```json
{
  "error": "Invalid or expired token"
}
```

## Using JWT Tokens

### Client-Side Implementation

After successful Apple login, store the returned JWT token:

```javascript
// After receiving token from /api/users/login/apple
localStorage.setItem('authToken', response.token);
```

When making authenticated requests, include the token in the Authorization header:

```javascript
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`
};

fetch('/api/users/verify-token', {
  method: 'POST',
  headers: headers,
  body: JSON.stringify({ token: localStorage.getItem('authToken') })
});
```

### Server-Side Usage

The JWT middleware is automatically applied to all requests. The decoded user ID is available in `req.userId`:

```typescript
// In route handlers
router.get('/profile', (req, res) => {
  const userId = req.userId; // Available if JWT was provided
  // Use userId to fetch user data from database
});
```

To require JWT authentication on a specific route:

```typescript
router.get('/protected', (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Continue with authenticated request
});
```

## JWT Token Details

- **Algorithm:** HS256 (HMAC with SHA-256)
- **Expiration:** 7 days (configurable via `generateToken` function)
- **Payload:**
  ```json
  {
    "userId": "apple_123456789",
    "iat": 1704067200,  // issued at
    "exp": 1704672000   // expires at
  }
  ```

## User Data Storage

### Firebase Authentication
- User is created/retrieved in Firebase Auth with email and Apple UID
- Unique Firebase UID is used as the primary identifier

### Firestore Database
User profile data is stored under:
```
/artifacts/{APP_ID}/users/{firebaseUserId}/
  {
    "email": "user@example.com",
    "displayName": "John",
    "appleUserId": "123456789",
    "loginMethod": "apple",
    "lastLogin": "2024-01-01T12:00:00Z"
  }
```

## Handling Existing Users

If a user logs in with Apple using an email that already exists in the system:
1. The existing Firebase user is retrieved
2. The Apple sign-in is linked to that user
3. The user profile is updated with Apple information
4. A new JWT token is issued for the existing user

If it's a new user:
1. A new Firebase user is created with UID format: `apple_<APPLEID>`
2. User profile is created in Firestore
3. A JWT token is issued

## Security Considerations

1. **JWT_SECRET:** Change in production to a strong, random value (min 32 characters)
2. **Token Expiration:** Tokens expire after 7 days; clients should refresh periodically
3. **HTTPS Only:** Always use HTTPS in production
4. **CORS:** Configure CORS appropriately for your frontend domain
5. **Apple App ID:** Ensure the `APPLE_APP_ID` environment variable matches your actual Apple App ID

## Troubleshooting

### "Invalid or expired Apple identity token"
- Verify the identity token is freshly generated from Apple Sign In
- Check that `APPLE_APP_ID` matches your Apple App ID configuration
- Ensure the token hasn't already been processed (Apple tokens can only be used once)

### "Missing JWT_SECRET"
- Add `JWT_SECRET` to your `.env` file
- Default value is provided for development but will show a warning

### "Invalid or expired JWT token"
- Check that the token is being sent in the correct format: `Bearer <token>`
- Verify the token hasn't expired (check `expiresIn` from `/verify-token`)
- Ensure `JWT_SECRET` in environment matches what was used to sign the token

## Testing

### Test the Apple Login Endpoint

```bash
curl -X POST http://localhost:4000/api/users/login/apple \
  -H "Content-Type: application/json" \
  -d '{
    "identityToken": "<APPLE_IDENTITY_TOKEN>",
    "user": {
      "name": {"firstName": "Test"},
      "email": "test@example.com"
    }
  }'
```

### Test JWT Verification

```bash
curl -X POST http://localhost:4000/api/users/verify-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<JWT_TOKEN_FROM_LOGIN>"
  }'
```

## Files Modified

- **src/routes/users.ts** - Added Apple login endpoint and JWT verification
- **src/services/jwt.ts** - NEW JWT utility service
- **src/index.ts** - Added JWT middleware to all routes
- **package.json** - Added `jsonwebtoken` and `apple-signin-auth` dependencies
