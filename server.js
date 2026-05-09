const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// লিংকে ঢুকলে এডমিন প্যানেল দেখানোর জন্য
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// UptimeRobot এর পিং এর জন্য
app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(PORT, async () => {
    console.log(`✅ Web server is awake on port ${PORT}`);
    startBot(); 
});

async function startBot() {
    try {
        console.log("⏳ Launching background engine...");
        
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                // 🚨 নিচের এই কমান্ডগুলো ব্রাউজারকে ঘুমাতে দিবে না
                '--disable-background-timer-throttling', 
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });
        
        const page = await browser.newPage();
        
        // 🚨 লটারি ওয়েবসাইট যেন রোবট ভাবতে না পারে, তাই রিয়েল মানুষের ব্রাউজার সেট করা হলো
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // শুধু স্টাইল এবং ছবি অফ করা হলো, API/JS রানিং থাকবে
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if(['image', 'stylesheet', 'media', 'font'].includes(type)){
                req.abort();
            } else {
                req.continue();
            }
        });

        // ব্রাউজারকে বোঝানো যে ট্যাবটি সবসময় ফোকাস করা আছে
        const client = await page.target().createCDPSession();
        await client.send('Page.enable');
        await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });

        console.log("Loading dashboard internally...");
        
        // Firebase যেন ঠিকমতো লোড হতে পারে, তাই domcontentloaded ব্যবহার করা হলো
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log("🚀 BOT IS FULLY LIVE IN BACKGROUND!");
        
        // Render এর লগে (Log) সব মেসেজ দেখার জন্য (কোনো Error আসলে ধরা পড়বে)
        page.on('console', msg => {
            console.log('BROWSER LOG:', msg.text());
        });

        page.on('pageerror', err => {
            console.log('BROWSER ERROR:', err.message);
        });

        browser.on('disconnected', () => {
            console.log('⚠️ Background browser disconnected! Restarting...');
            setTimeout(startBot, 5000);
        });

    } catch (error) {
        console.error("❌ Fatal Error:", error);
        setTimeout(startBot, 10000); 
    }
}
