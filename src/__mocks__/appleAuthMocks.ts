/**
 * Mock ASAuthorizationAppleIDCredential for testing
 * Simulates the response from Apple Sign In on iOS/macOS
 */

export interface MockAppleCredential {
    identityToken: string;
    user?: {
        name?: {
            firstName?: string;
            familyName?: string;
            givenName?: string;
        };
        email?: string;
        email_verified?: boolean;
    };
}

/**
 * Generate a mock Apple identity token (JWT format)
 * This is what your backend receives from the Apple Sign In flow
 */
export function generateMockAppleToken(options?: {
    appleUserId?: string;
    email?: string;
    expiresIn?: number;
}): string {
    const appleUserId = options?.appleUserId || '001234.abcdef1234567.1234';
    const email = options?.email || 'user@example.com';
    const expiresIn = options?.expiresIn || 600; // 10 minutes

    // Mock header (not cryptographically valid, just for structure)
    const header = {
        alg: 'RS256',
        kid: 'ABC123XYZ789',
        typ: 'JWT',
    };

    // Mock payload - this is what gets decoded by apple-signin-auth
    const payload = {
        iss: 'https://appleid.apple.com',
        aud: 'com.knowdose.app',
        sub: appleUserId, // Apple's unique user ID
        c_hash: 'c_hash_value_here',
        email: email,
        email_verified: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresIn,
    };

    // Mock signature (not real, just for format)
    const signature =
        'mock_signature_not_cryptographically_valid_for_testing_only';

    // Encode as base64url
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Mock ASAuthorizationAppleIDCredential response
 * This is what your iOS app would send to login/apple endpoint
 */
export function createMockAppleCredential(
    options?: Partial<MockAppleCredential>
): MockAppleCredential {
    const appleUserId = '001234.abcdef1234567.1234';
    const email = options?.user?.email || 'user@example.com';

    return {
        identityToken:
            options?.identityToken || generateMockAppleToken({ appleUserId, email }),
        user: {
            name: {
                firstName: options?.user?.name?.firstName || 'John',
                familyName: options?.user?.name?.familyName || 'Doe',
                givenName: options?.user?.name?.givenName || 'John',
            },
            email: email,
            email_verified: options?.user?.email_verified ?? true,
            ...options?.user,
        },
    };
}

/**
 * Mock credentials for different test scenarios
 */
export const mockAppleCredentials = {
    /**
     * Standard new user
     */
    newUser: createMockAppleCredential({
        user: {
            name: {
                firstName: 'Jane',
                givenName: 'Jane',
            },
            email: 'jane.doe@example.com',
        },
    }),

    /**
     * User with minimal data
     */
    minimalUser: createMockAppleCredential({
        user: {
            email: 'minimal@example.com',
        },
    }),

    /**
     * User without email
     */
    noEmail: createMockAppleCredential({
        user: {
            name: {
                firstName: 'NoEmail',
                givenName: 'NoEmail',
            },
            email: undefined,
        },
    }),

    /**
     * Returning user (same Apple ID)
     */
    returningUser: createMockAppleCredential({
        user: {
            name: {
                firstName: 'Returning',
                givenName: 'Returning',
            },
            email: 'returning@example.com',
        },
    }),
};

/**
 * Decode mock Apple token for inspection (for testing/debugging)
 */
export function decodeMockAppleToken(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }

        const payload = JSON.parse(
            Buffer.from(parts[1], 'base64url').toString('utf-8')
        );
        return payload;
    } catch (err) {
        console.error('Failed to decode mock token:', err);
        return null;
    }
}
