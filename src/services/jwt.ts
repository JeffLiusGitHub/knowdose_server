import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface TokenPayload {
    userId: string;
    iat?: number;
    exp?: number;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: string, expiresIn: string | number = '7d'): string {
    const options: SignOptions = { expiresIn: expiresIn as any };
    return jwt.sign({ userId }, JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Middleware to verify JWT token from Authorization header
 * Sets req.userId if token is valid
 */
export function verifyJWTMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(); // Token is optional, middleware just extracts if present
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    try {
        const decoded = verifyToken(token);
        req.userId = decoded.userId;
        next();
    } catch (err: any) {
        console.error('JWT verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid or expired JWT token' });
    }
}
