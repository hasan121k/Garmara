const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Render-কে দেখানোর জন্য HTML ফাইল সার্ভ করা
app.use(express.static(__dirname));

app.listen(PORT, async () => {
    console.log(`✅ Web server started on port ${PORT}`);
    
    try {
        console.log("⏳ Starting background browser...");
        // সার্ভারের ভেতর অদৃশ্য ব্রাউজার ওপেন করা
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        
        const page = await browser.newPage();
        
        // আপনার index.html ফাইলটি রান করা
        await page.goto(`http://localhost:${PORT}/index.html`);
        console.log("🚀 BOT IS LIVE! Running 24/7 in background.");
        
        // ব্রাউজারের কোনো মেসেজ বা Error কনসোলে দেখার জন্য
        page.on('console', msg => console.log('BOT LOG:', msg.text()));

    } catch (error) {
        console.error("❌ Error launching browser:", error);
    }
});
