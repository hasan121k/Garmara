import express from 'express';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";
import path from 'path';
import { fileURLToPath } from 'url';

// ==========================================
// 1. EXPRESS SERVER SETUP (For Render 24/7)
// ==========================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// এই অংশটি আপনার index.html (অ্যাডমিন প্যানেল) শো করাবে লিংকে গেলে
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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

// Keep local data in sync with Firebase Admin Panel
onValue(channelsRef, (snapshot) => {
    channelsData = snapshot.val() || {};
    console.log("🔄 Firebase Data Synced!");
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
    } catch (e) {
        console.error("Prediction Error:", e.message);
        return "BIG"; // Fallback
    }
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text: text })
        });
    } catch (e) { console.error("TG Msg Error:", e.message); }
}

async function tgSticker(token, chat, stickerId) {
    if (!token || !chat || !stickerId) return;
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, sticker: stickerId })
        });
    } catch (e) { console.error("TG Sticker Error:", e.message); }
}

async function processPeriodChange(server, oldPeriod, actualSize, newPrediction, nextPeriodStr) {
    for (let key in channelsData) {
        let c = channelsData[key];

        if (!channelActiveStates[key]) channelActiveStates[key] = { martingaleActive: false, warningsSent: {} };
        let internalState = channelActiveStates[key];

        if (c.isActive && c.server === server && c.botToken && c.chatId) {
            let inTime = isTimeAllowed(c.times);
            if (!inTime && !internalState.martingaleActive) continue;

            let oldPred = serverStates[server].pred;
            let isWin = false;
            let targetReached = false;

            if (oldPred) {
                isWin = (oldPred === actualSize);

                if (isWin) {
                    internalState.martingaleActive = false;

                    if (c.stopOnWinTarget) {
                        let newWinCount = (c.currentWins || 0) + 1;
                        if (newWinCount >= c.targetWins) {
                            c.isActive = false;
                            update(ref(db, 'channels/' + key), { isActive: false, currentWins: 0 });
                            targetReached = true;
                        } else {
                            c.currentWins = newWinCount;
                            update(ref(db, 'channels/' + key), { currentWins: newWinCount });
                        }
                    }

                    if (oldPred === 'BIG') {
                        await tgMsg(c.botToken, c.chatId, c.bigMsg);
                        await tgSticker(c.botToken, c.chatId, c.bSticker1);
                        await tgSticker(c.botToken, c.chatId, c.bSticker2);
                        await tgSticker(c.botToken, c.chatId, c.bSticker3);
                    } else {
                        await tgMsg(c.botToken, c.chatId, c.smallMsg);
                        await tgSticker(c.botToken, c.chatId, c.sSticker1);
                        await tgSticker(c.botToken, c.chatId, c.sSticker2);
                        await tgSticker(c.botToken, c.chatId, c.sSticker3);
                    }

                    if (targetReached && c.endMsg) {
                        await tgMsg(c.botToken, c.chatId, c.endMsg);
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

            if (!inTime && isWin) {
                if (c.endMsg) await tgMsg(c.botToken, c.chatId, c.endMsg);
                continue;
            }

            let signalText = c.signalMsg.replace(/{period}/g, nextPeriodStr).replace(/{signal}/g, newPrediction);
            await tgMsg(c.botToken, c.chatId, signalText);
        }
    }
    serverStates[server].pred = newPrediction;
}

async function fetchServerData(server) {
    try {
        const res = await fetch(APIS[server] + '?t=' + Date.now());
        const data = await res.json();
        const latest = data.data.list[0];
        const actualPeriod = latest.issueNumber;
        const actualSize = parseInt(latest.number) >= 5 ? "BIG" : "SMALL";
        let state = serverStates[server];

        if (!state.p) {
            state.p = actualPeriod;
            state.pred = calculatePrediction(data.data.list);
        }
        else if (state.p !== actualPeriod) {
            let newPred = calculatePrediction(data.data.list);
            let nextPeriodStr = (BigInt(actualPeriod) + 1n).toString();
            await processPeriodChange(server, state.p, actualSize, newPred, nextPeriodStr);
            state.p = actualPeriod;
        }
    } catch (e) {
        // Silent catch to prevent server crash during API downtime
    }
}

// Check every 3 seconds
setInterval(() => {
    fetchServerData('30S'); 
    fetchServerData('1M');
    fetchServerData('3M'); 
    fetchServerData('5M');
}, 3000);

// ==========================================
// 4. 30 MINUTE WARNING CHECKER
// ==========================================
setInterval(() => {
    try {
        let now = new Date();
        let currentMinutes = now.getHours() * 60 + now.getMinutes();
        let todayStr = now.toDateString();

        for (let key in channelsData) {
            let c = channelsData[key];
            if (!c.botToken || !c.chatId || !c.warningMsg || !c.times) continue;

            if (!channelActiveStates[key]) channelActiveStates[key] = { warningsSent: {} };
            let state = channelActiveStates[key];
            if (!state.warningsSent) state.warningsSent = {};

            c.times.forEach((box, index) => {
                if (box.start) {
                    let s = box.start.split(':');
                    let startMin = parseInt(s[0]) * 60 + parseInt(s[1]);

                    if (startMin - currentMinutes === 30) {
                        if (state.warningsSent[index] !== todayStr) {
                            tgMsg(c.botToken, c.chatId, c.warningMsg);
                            state.warningsSent[index] = todayStr;
                        }
                    }
                }
            });
        }
    } catch (e) { console.error("Warning Interval Error:", e.message); }
}, 60000); // Check every 60 seconds
