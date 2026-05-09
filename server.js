const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ১. আপনার লিংকে ঢুকলেই যেন মেইন HTML ফাইল (এডমিন প্যানেল) দেখায়
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// (UptimeRobot এর জন্য একটি হিডেন লিংক, যাতে সার্ভার না ঘুমায়)
app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(PORT, async () => {
    console.log(`✅ Web server is awake on port ${PORT}`);
    startBot(); // ব্যাকগ্রাউন্ড বট স্টার্ট করা হলো
});

// ব্যাকগ্রাউন্ডে বট চালানোর মূল ইঞ্জিন (২৪/৭ চলবে)
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
                '--single-process'
            ]
        });
        
        const page = await browser.newPage();
        
        // শুধু ছবি আর ডিজাইন অফ করা হলো (RAM বাঁচানোর জন্য), কিন্তু JS/Firebase চালু থাকবে
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'media', 'font'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue(); // JS এবং API চলতে দেওয়া হলো
            }
        });

        // ব্রাউজারকে বোঝানো যে ট্যাবটি সবসময় ওপেন আছে
        const client = await page.target().createCDPSession();
        await client.send('Page.enable');
        await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });

        console.log("Loading your admin panel internally for 24/7 operation...");
        
        // সার্ভারের ভেতর সে আপনার এডমিন প্যানেলটি রান করে রাখবে
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
        console.log("🚀 BOT IS FULLY LIVE IN BACKGROUND!");
        
        page.on('console', msg => {
            if(msg.text().includes('System Check') || msg.text().includes('Error')) {
                console.log('BOT LOG:', msg.text());
            }
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
