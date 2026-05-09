import express from 'express';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";
import path from 'path';

// ==========================================
// 1. EXPRESS SERVER SETUP
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// ==========================================
// 2. FIREBASE SETUP
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCRDaqKIi2P5Jww0zW0Gdxm2_QXtYmHOQE",
    authDomain: "sihol-3624d.firebaseapp.com",
    databaseURL: "https://sihol-3624d-default-rtdb.firebaseio.com",
    projectId: "sihol-3624d",
    storageBucket: "sihol-3624d.firebasestorage.app",
    messagingSenderId: "844300820855",
    appId: "1:844300820855:web:5d810714448b0e1aff8172"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const channelsRef = ref(db, 'channels');

let channelsData = {};
let channelActiveStates = {};

onValue(channelsRef, (snapshot) => {
    channelsData = snapshot.val() || {};
    console.log(`🔄 Firebase Data Synced! Active Channels: ${Object.keys(channelsData).length}`);
});

// ==========================================
// 3. CORE BOT LOGIC
// ==========================================
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
    try {
        const last5 = list.slice(0, 5).map(x => parseInt(x.number) >= 5 ? "BIG" : "SMALL");
        if (last5[0] === last5[1] && last5[1] === last5[2]) return last5[0];
        return (last5[0] === "BIG") ? "SMALL" : "BIG";
    } catch (e) { return "BIG"; }
}

function isTimeAllowed(timesArray) {
    if (!timesArray || timesArray.length === 0) return true;
    let now = new Date();
    let currentMinutes = now.getHours() * 60 + now.getMinutes();
    let hasValidBoxSet = false;
    for (let box of timesArray) {
        if (box.start && box.end) {
            hasValidBoxSet = true;
            let s = box.start.split(':');
            let e = box.end.split(':');
            let startMin = parseInt(s[0]) * 60 + parseInt(s[1]);
            let endMin = parseInt(e[0]) * 60 + parseInt(e[1]);
            if (currentMinutes >= startMin && currentMinutes <= endMin) return true;
        }
    }
    return !hasValidBoxSet;
}

async function tgMsg(token, chat, text) {
    if (!token || !chat || !text) return;
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text: text })
        });
    } catch (e) {}
}

async function tgSticker(token, chat, stickerId) {
    if (!token || !chat || !stickerId) return;
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, sticker: stickerId })
        });
    } catch (e) {}
}

async function processPeriodChange(server, oldPeriod, actualSize, newPrediction, nextPeriodStr, oldPred) {
    console.log(`🎰 [${server}] Period ${oldPeriod} Result: ${actualSize} | Next Pred: ${newPrediction}`);
    
    for (let key in channelsData) {
        let c = channelsData[key];
        if (!channelActiveStates[key]) channelActiveStates[key] = { martingaleActive: false };
        let internalState = channelActiveStates[key];

        if (c.isActive && c.server === server && c.botToken && c.chatId) {
            let inTime = isTimeAllowed(c.times);
            if (!inTime && !internalState.martingaleActive) continue;

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
                            if (c.endMsg) await tgMsg(c.botToken, c.chatId, c.endMsg);
                        } else {
                            update(ref(db, 'channels/' + key), { currentWins: newWinCount });
                        }
                    }

                    if (oldPred === 'BIG') {
                        await tgMsg(c.botToken, c.chatId, c.bigMsg);
                        await tgSticker(c.botToken, c.chatId, c.bSticker1);
                    } else {
                        await tgMsg(c.botToken, c.chatId, c.smallMsg);
                        await tgSticker(c.botToken, c.chatId, c.sSticker1);
                    }
                } else {
                    internalState.martingaleActive = true;
                    if (c.sendLoss) {
                        await tgMsg(c.botToken, c.chatId, c.lossMsg);
                        await tgSticker(c.botToken, c.chatId, c.lossSticker); 
                    }
                }
            }

            if (!c.isActive) continue;
            if (!inTime && isWin) continue;

            let signalText = c.signalMsg.replace(/{period}/g, nextPeriodStr).replace(/{signal}/g, newPrediction);
            await tgMsg(c.botToken, c.chatId, signalText);
            console.log(`📤 Message Sent to Channel for [${server}]`);
        }
    }
}

// ==========================================
// 100% GUARANTEED GOOGLE BYPASS LOGIC
// ==========================================

// 👇 নিচে আপনার গুগলের লিংকটি দিন (ইনভার্টেড কমা " " এর ভেতরে)
const GOOGLE_PROXY = "https://script.google.com/macros/s/AKfycbxnsAQJqFn9ECFMyEpsbrB6DkSjZPT5oR8dqHs5QNoOoZXi3WGZS2MKROAon1BfSKvd/exec"; 

async function fetchServerData(server) {
    if (GOOGLE_PROXY === "এখানে_আপনার_গুগল_লিংক_দিন" || GOOGLE_PROXY === "") {
        console.log(`⚠️ Google Link Missing! Please add it in server.js`);
        return;
    }

    try {
        const targetUrl = APIS[server] + '?t=' + Date.now();
        const fetchUrl = GOOGLE_PROXY + "?url=" + encodeURIComponent(targetUrl);
        
        const res = await fetch(fetchUrl);
        const data = await res.json();
        
        if (!data || !data.data || !data.data.list) throw new Error("Invalid format from Google Proxy");

        const latest = data.data.list[0];
        const actualPeriod = latest.issueNumber;
        const actualSize = parseInt(latest.number) >= 5 ? "BIG" : "SMALL";
        let state = serverStates[server];

        if (!state.p) {
            state.p = actualPeriod;
            state.pred = calculatePrediction(data.data.list);
            console.log(`✅ [${server}] Connected via Google! Waiting for next period...`);
        }
        else if (state.p !== actualPeriod) {
            let oldPeriod = state.p;
            let oldPred = state.pred; 
            
            let newPred = calculatePrediction(data.data.list);
            let nextPeriodStr = (BigInt(actualPeriod) + 1n).toString();
            
            state.p = actualPeriod;
            state.pred = newPred;

            processPeriodChange(server, oldPeriod, actualSize, newPred, nextPeriodStr, oldPred);
        }
    } catch (e) {
        console.error(`❌ Fetch Error [${server}]:`, e.message);
    }
}

setInterval(() => { fetchServerData('30S'); }, 7000);   
setInterval(() => { fetchServerData('1M'); }, 10000);  
setInterval(() => { fetchServerData('3M'); }, 15000);  
setInterval(() => { fetchServerData('5M'); }, 20000);
