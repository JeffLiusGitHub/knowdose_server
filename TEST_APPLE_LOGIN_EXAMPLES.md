/**
 * Test examples for Apple Login endpoint
 * Use these with Postman or your test framework
 */

import {
    createMockAppleCredential,
    generateMockAppleToken,
    mockAppleCredentials,
    decodeMockAppleToken,
} from './__mocks__/appleAuthMocks';

/**
 * Example 1: Test with a new user
 * Copy this JSON to Postman and POST to http://localhost:4000/api/users/login/apple
 */
export const testExample1_NewUser = mockAppleCredentials.newUser;
// Expected response: { ok: true, token: "...", userId: "apple_...", user: {...} }

/**
 * Example 2: Test with minimal data
 * Some users might not provide all information
 */
export const testExample2_MinimalUser = mockAppleCredentials.minimalUser;

/**
 * Example 3: Create custom mock for specific testing
 */
export function createCustomTestCredential(email: string, firstName: string) {
    return createMockAppleCredential({
        user: {
            name: { firstName, givenName: firstName },
            email: email,
        },
    });
}

/**
 * Example 4: Test token generation
 */
export function demonstrateTokenGeneration() {
    const token = generateMockAppleToken({
        appleUserId: '001234.abcdef1234567.1234',
        email: 'test@example.com',
        expiresIn: 600,
    });

    console.log('Generated Mock Token:', token);

    // Decode to inspect
    const decoded = decodeMockAppleToken(token);
    console.log('Decoded Token:', decoded);
}

/**
 * Postman Test Requests
 * Copy these JSON bodies directly into Postman
 */

export const postmanTests = {
    /**
     * TEST 1: New User Registration
     * Method: POST
     * URL: http://localhost:4000/api/users/login/apple
     * Body:
     */
    test1_NewUser: {
        identityToken: generateMockAppleToken({
            appleUserId: '001234.newuser123.1234',
            email: 'alice@example.com',
        }),
        user: {
            name: {
                firstName: 'Alice',
                givenName: 'Alice',
            },
            email: 'alice@example.com',
        },
    },

    /**
     * TEST 2: Returning User (same email)
     * Method: POST
     * URL: http://localhost:4000/api/users/login/apple
     * Body:
     */
    test2_ReturningUser: {
        identityToken: generateMockAppleToken({
            appleUserId: '001234.returninguser456.1234',
            email: 'alice@example.com', // Same email as test 1
        }),
        user: {
            name: {
                firstName: 'Alice',
                givenName: 'Alice',
            },
            email: 'alice@example.com',
        },
    },

    /**
     * TEST 3: User with different Apple ID (new account)
     * Method: POST
     * URL: http://localhost:4000/api/users/login/apple
     * Body:
     */
    test3_DifferentAppleId: {
        identityToken: generateMockAppleToken({
            appleUserId: '001234.differentapple789.1234',
            email: 'bob@example.com',
        }),
        user: {
            name: {
                firstName: 'Bob',
                givenName: 'Bob',
            },
            email: 'bob@example.com',
        },
    },

    /**
     * TEST 4: Verify JWT Token
     * Method: POST
     * URL: http://localhost:4000/api/users/verify-token
     * Body:
     * (Note: Replace with actual JWT token from TEST 1 response)
     */
    test4_VerifyToken: (jwtToken: string) => ({
        token: jwtToken,
    }),

    /**
     * TEST 5: Invalid Token (should fail with 401)
     * Method: POST
     * URL: http://localhost:4000/api/users/verify-token
     * Body:
     */
    test5_InvalidToken: {
        token: 'invalid.token.here',
    },
};

/**
 * Usage Instructions for Postman:
 *
 * 1. SETUP:
 *    - Start your backend: npm run dev
 *    - Open Postman
 *    - Create new request
 *
 * 2. TEST APPLE LOGIN (TEST 1):
 *    - Method: POST
 *    - URL: http://localhost:4000/api/users/login/apple
 *    - Headers: Content-Type: application/json
 *    - Body (use postmanTests.test1_NewUser JSON):
 *    {
 *      "identityToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IkFCQzEyM1hZWjc4OSIsInR5cCI6IkpXVCJ9...",
 *      "user": {
 *        "name": {
 *          "firstName": "Alice",
 *          "givenName": "Alice"
 *        },
 *        "email": "alice@example.com"
 *      }
 *    }
 *    - Expected: 200 response with JWT token
 *
 * 3. SAVE JWT TOKEN:
 *    - Copy the "token" from TEST 1 response
 *    - Save it for TEST 4
 *
 * 4. VERIFY TOKEN (TEST 4):
 *    - Method: POST
 *    - URL: http://localhost:4000/api/users/verify-token
 *    - Body:
 *    {
 *      "token": "<JWT_TOKEN_FROM_TEST_1>"
 *    }
 *    - Expected: 200 response with userId and expiresIn
 *
 * 5. TEST AUTHORIZATION HEADER:
 *    - Any request with header: Authorization: Bearer <JWT_TOKEN>
 *    - The middleware will automatically extract req.userId
 */

/**
 * Integration Test Example (using fetch/chai/jest)
 */
export async function integrationTestExample() {
    const baseUrl = 'http://localhost:4000';

    // Step 1: Apple Login
    const loginResponse = await fetch(`${baseUrl}/api/users/login/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postmanTests.test1_NewUser),
    });

    const loginData = await loginResponse.json();
    console.log('Login Response:', loginData);

    if (!loginResponse.ok) {
        console.error('Login failed:', loginData);
        return;
    }

    const jwtToken = loginData.token;
    console.log('JWT Token:', jwtToken);

    // Step 2: Verify Token
    const verifyResponse = await fetch(`${baseUrl}/api/users/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: jwtToken }),
    });

    const verifyData = await verifyResponse.json();
    console.log('Verify Response:', verifyData);

    if (verifyResponse.ok) {
        console.log('✅ Token is valid! Expires in:', verifyData.expiresIn, 'seconds');
    }
}
