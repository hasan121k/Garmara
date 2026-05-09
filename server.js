const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ১. UptimeRobot এর জন্য একটি হালকা রুট (যাতে সার্ভার কখনো না ঘুমায়)
app.get('/', (req, res) => {
    res.send('🤖 Ultimate VIP Bot is Running 24/7 in Background!');
});

// ২. আপনার HTML ফাইলটি /app রুটে লুকিয়ে রাখা হলো
app.use('/app', express.static(__dirname));

app.listen(PORT, async () => {
    console.log(`✅ Web server is awake on port ${PORT}`);
    startBot(); // বট স্টার্ট করার ফাংশন কল করা হলো
});

// বট চালানোর মূল ইঞ্জিন
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
        
        // ফালতু জিনিস লোড হওয়া বন্ধ করা হলো (RAM বাঁচানোর জন্য)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        // 🚨 সবচেয়ে জরুরি কোড: ব্রাউজারকে বোঝানো যে ট্যাবটি সবসময় ওপেন আছে
        const client = await page.target().createCDPSession();
        await client.send('Page.enable');
        await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });

        console.log("Loading dashboard internally...");
        
        // সার্ভারের ভেতর আপনার ফাইলটি রান হলো
        await page.goto(`http://localhost:${PORT}/app/index.html`, { waitUntil: 'networkidle2' });
        console.log("🚀 BOT IS FULLY LIVE! It will never stop now.");
        
        // কনসোল লগ দেখার জন্য
        page.on('console', msg => {
            if(msg.text().includes('System Check') || msg.text().includes('Error')) {
                console.log('BOT LOG:', msg.text());
            }
        });

        // 🚨 অটো-রিস্টার্ট: ব্রাউজার কোনো কারণে ক্র্যাশ করলে আবার চালু হবে
        browser.on('disconnected', () => {
            console.log('⚠️ Background browser disconnected! Restarting automatically...');
            setTimeout(startBot, 5000);
        });

    } catch (error) {
        console.error("❌ Fatal Error:", error);
        // Error খেলেও থেমে থাকবে না, আবার চেষ্টা করবে
        setTimeout(startBot, 10000); 
    }
}
