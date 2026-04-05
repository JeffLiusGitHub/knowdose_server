#!/usr/bin/env node

/**
 * Quick test script for Apple Login endpoint
 * Run with: node test-apple-login.js
 */

const http = require('http');

// Mock Apple Credential
function generateMockAppleToken(appleUserId = '001234.abcdef1234567.1234', email = 'test@example.com') {
    const payload = {
        iss: 'https://appleid.apple.com',
        aud: 'com.knowdose.app',
        sub: appleUserId,
        email: email,
        email_verified: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
    };

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'mock_signature_for_testing';

    return `${header}.${payloadB64}.${signature}`;
}

function createTestRequest() {
    return {
        identityToken: generateMockAppleToken(),
        user: {
            name: {
                firstName: 'John',
                givenName: 'John',
            },
            email: 'john@example.com',
        },
    };
}

function makeRequest(method, path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 4000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: responseData,
                });
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function runTests() {
    console.log('🍎 Apple Login Backend Test Script\n');

    // Test 1: Health check
    console.log('📊 Test 1: Health Check');
    try {
        const healthRes = await makeRequest('GET', '/health', null);
        console.log(`   Status: ${healthRes.status}`);
        console.log(`   Response: ${healthRes.body}\n`);
    } catch (err) {
        console.error('❌ Health check failed:', err.message);
        console.log('   Make sure the server is running: npm run dev\n');
        process.exit(1);
    }

    // Test 2: Apple Login
    console.log('📊 Test 2: Apple Login');
    try {
        const testData = createTestRequest();
        console.log('   Request Body:');
        console.log(`   ${JSON.stringify(testData, null, 2)}\n`);

        const loginRes = await makeRequest('POST', '/api/users/login/apple', testData);
        console.log(`   Status: ${loginRes.status}`);
        console.log(`   Response: ${loginRes.body}\n`);

        if (loginRes.status === 200) {
            const loginData = JSON.parse(loginRes.body);
            const jwtToken = loginData.token;

            // Test 3: Verify Token
            console.log('📊 Test 3: Verify JWT Token');
            const verifyRes = await makeRequest('POST', '/api/users/verify-token', { token: jwtToken });
            console.log(`   Status: ${verifyRes.status}`);
            console.log(`   Response: ${verifyRes.body}\n`);

            if (verifyRes.status === 200) {
                console.log('✅ All tests passed!');
            }
        }
    } catch (err) {
        console.error('❌ Test failed:', err.message);
        process.exit(1);
    }
}

runTests();
