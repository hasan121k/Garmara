const express = require('express');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, update } = require('firebase/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/ping', (req, res) => res.send('Bot is Alive & Bypassing Firewalls!'));

app.listen(PORT, () => {
    console.log(`✅ Web server is LIVE on port ${PORT}`);
    console.log(`🚀 CLOUDFLARE BYPASS ENGINE STARTED!`);
});

// Firebase Setup
const firebaseConfig = {
    apiKey: "AIzaSyCRDaqKIi2P5Jww0zW0Gdxm2_QXtYmHOQE",
    authDomain: "sihol-3624d.firebaseapp.com",
    databaseURL: "https://sihol-3624d-default-rtdb.firebaseio.com",
    projectId: "sihol-3624d",
    storageBucket: "sihol-3624d.firebasestorage.app",
    messagingSenderId: "844300820855",
    appId: "1:844300820855:web:5d810714448b0e1aff8172"
};

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);
const channelsRef = ref(db, 'channels');

let channelsData = {};
let channelActiveStates = {};

onValue(channelsRef, (snapshot) => {
    channelsData = snapshot.val() || {};
    console.log("🔄 Settings synced with Firebase.");
});

const APIS = {
    '30S': 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    '1M': 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
    '3M': 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
    '5M': 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json'
};

const serverStates = {
    '30S': { p: null, pred: null }, '1M': { p: null, pred: null },
    '3M': { p: null, pred: null }, '5M': { p: null, pred: null }
};

function calculatePrediction(list) {
    const last5 = list.slice(0, 5).map(x => parseInt(x.number) >= 5 ? "BIG" : "SMALL");
    if (last5[0] === last5[1] && last5[1] === last5[2]) return last5[0]; 
    return (last5[0] === "BIG") ? "SMALL" : "BIG";
}

function isTimeAllowed(timesArray) {
    if(!timesArray || timesArray.length === 0) return true; 
    let now = new Date();
    let currentMinutes = now.getHours() * 60 + now.getMinutes();
    let hasValidBoxSet = false;
    for(let box of timesArray) {
        if(box.start && box.end) {
            hasValidBoxSet = true;
            let s = box.start.split(':');
            let e = box.end.split(':');
            let startMin = parseInt(s[0])*60 + parseInt(s[1]);
            let endMin = parseInt(e[0])*60 + parseInt(e[1]);
            if(currentMinutes >= startMin && currentMinutes <= endMin) return true;
        }
    }
    return !hasValidBoxSet;
}

async function tgMsg(token, chat, text) {
    if(!token || !chat || !text) return;
    try { 
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
        }); 
    } catch(e) {}
}

async function tgSticker(token, chat, stickerId) {
    if(!token || !chat || !stickerId) return;
    try { 
        await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ chat_id: chat, sticker: stickerId })
        }); 
    } catch(e) {}
}

async function processPeriodChange(server, oldPeriod, actualSize, newPrediction, nextPeriodStr) {
    for (let key in channelsData) {
        let c = channelsData[key];
        if(!channelActiveStates[key]) channelActiveStates[key] = { martingaleActive: false };
        let internalState = channelActiveStates[key];

        if (c.isActive && c.server === server && c.botToken && c.chatId) {
            let inTime = isTimeAllowed(c.times);
            if (!inTime && !internalState.martingaleActive) continue; 

            let oldPred = serverStates[server].pred;
            let isWin = false;

            if (oldPred) {
                isWin = (oldPred === actualSize);
                if (isWin) {
                    internalState.martingaleActive = false; 
                    if (c.stopOnWinTarget) {
                        let newWinCount = (c.currentWins || 0) + 1;
                        if (newWinCount >= c.targetWins) {
                            c.isActive = false; 
                            update(ref(db, 'channels/' + key), { isActive: false, currentWins: 0 });
                        } else update(ref(db, 'channels/' + key), { currentWins: newWinCount });
                    }
                    if (oldPred === 'BIG') {
                        await tgMsg(c.botToken, c.chatId, c.bigMsg);
                        if(c.bSticker1) await tgSticker(c.botToken, c.chatId, c.bSticker1);
                        if(c.bSticker2) await tgSticker(c.botToken, c.chatId, c.bSticker2);
                        if(c.bSticker3) await tgSticker(c.botToken, c.chatId, c.bSticker3);
                    } else {
                        await tgMsg(c.botToken, c.chatId, c.smallMsg);
                        if(c.sSticker1) await tgSticker(c.botToken, c.chatId, c.sSticker1);
                        if(c.sSticker2) await tgSticker(c.botToken, c.chatId, c.sSticker2);
                        if(c.sSticker3) await tgSticker(c.botToken, c.chatId, c.sSticker3);
                    }
                } else {
                    internalState.martingaleActive = true; 
                    if (c.sendLoss) {
                        await tgMsg(c.botToken, c.chatId, c.lossMsg);
                        if(c.lossSticker) await tgSticker(c.botToken, c.chatId, c.lossSticker);
                    }
                }
            }
            if (!c.isActive) continue; 
            let signalText = (c.signalMsg || '').replace(/{period}/g, nextPeriodStr).replace(/{signal}/g, newPrediction);
            await tgMsg(c.botToken, c.chatId, signalText);
            console.log(`✅ Signal sent to channel: ${c.name}`);
        }
    }
    serverStates[server].pred = newPrediction;
}

// 🔥 রিয়েল হ্যাক: গ্লোবাল প্রক্সি রাউটিং (কোনো সাইট ব্লক করতে পারবে না)
async function safeFetch(url) {
    const timeUrl = url + '?t=' + Date.now();
    
    // আমি এখানে ৩টা আলাদা আলাদা বাইপাস সার্ভার সেট করেছি। একটা ফেল মারলে আরেকটা দিয়ে আনবে।
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(timeUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(timeUrl)}`,
        timeUrl // ডিরেক্ট রিকোয়েস্ট (যদি কখনো আনব্লক হয়)
    ];

    for (let proxyUrl of proxies) {
        try {
            let res = await fetch(proxyUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' }
            });
            if (res.ok) {
                let data = await res.json();
                if (data && data.data && data.data.list) return data; // ডাটা পেলে সাথে সাথে রিটার্ন করবে
            }
        } catch(e) {
            // এরর আসলে কোনো মেসেজ দিবে না, চুপচাপ পরের প্রক্সি দিয়ে ট্রাই করবে
        }
    }
    return null;
}

async function fetchServerData(server) {
    try {
        const data = await safeFetch(APIS[server]);
        if (!data) return; // ডাটা না পেলে ক্র্যাশ করবে না

        const latest = data.data.list[0];
        const actualPeriod = latest.issueNumber;
        const actualSize = parseInt(latest.number) >= 5 ? "BIG" : "SMALL";
        let state = serverStates[server];

        if (!state.p) {
            state.p = actualPeriod;
            state.pred = calculatePrediction(data.data.list);
        } else if (state.p !== actualPeriod) {
            let newPred = calculatePrediction(data.data.list);
            let nextPeriodStr = (BigInt(actualPeriod) + 1n).toString();
            await processPeriodChange(server, state.p, actualSize, newPred, nextPeriodStr);
            state.p = actualPeriod;
        }
    } catch (e) { }
}

// 24/7 Engine Loop (টাইম একটু বাড়িয়ে দিলাম যাতে প্রক্সি সার্ভার রাগ না করে)
setInterval(() => {
    fetchServerData('30S'); fetchServerData('1M'); 
    fetchServerData('3M'); fetchServerData('5M');
}, 4500);

// ক্র্যাশ রোধ করার সুরক্ষা কবচ
process.on('uncaughtException', err => {});
process.on('unhandledRejection', err => {});
