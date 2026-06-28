#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const publicDir = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Route for root - serve professional dashboard
    if (req.url === '/' || req.url === '/dashboard.html') {
        const filePath = path.join(publicDir, 'dashboard.html');

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error reading file: ' + err.message);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else if (req.url === '/index.html') {
        const filePath = path.join(publicDir, 'index.html');

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error reading file: ' + err.message);
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - File Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║  🚀 Job Scraper Dashboard Server Started           ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  📱 Dashboard URL: http://localhost:${PORT}        ║
║                                                    ║
║  ✨ Features:                                      ║
║    • View all jobs from Firebase                   ║
║    • Search by title or company                    ║
║    • Filter by job source (6 sources)              ║
║    • Filter by location (Remote, etc.)             ║
║    • View job details and skills                   ║
║    • Click through to job listings                 ║
║                                                    ║
║  📊 Job Sources:                                   ║
║    • RemoteOK (49 jobs)                            ║
║    • AngelList (5 jobs)                            ║
║    • Indeed (3 jobs)                               ║
║    • Glassdoor (4 jobs)                            ║
║    • LinkedIn (documented)                         ║
║    • InstaHyre (4 jobs)                            ║
║                                                    ║
║  💾 Database: Firebase Firestore                   ║
║  🔄 Auto-refresh: Every 30 seconds                 ║
║                                                    ║
║  Press Ctrl+C to stop server                       ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);

    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log('📂 Public folder:', publicDir);
});
