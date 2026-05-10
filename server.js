const express = require('express');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, update } = require('firebase/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/ping', (req, res) => res.send('Bot is Alive & Working 24/7!'));

app.listen(PORT, () => {
    console.log(`✅ Web server is LIVE on port ${PORT}`);
    console.log(`🚀 24/7 BACKGROUND ENGINE STARTED!`);
});

// আপনার দেওয়া 400ms delay for stickers
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// আপনার দেওয়া হুবহু প্রেডিকশন লজিক
function calculatePrediction(list) {
    const last5 = list.slice(0, 5).map(x => parseInt(x.number) >= 5 ? "BIG" : "SMALL");
    if (last5[0] === last5[1] && last5[1] === last5[2]) return last5[0]; 
    return (last5[0] === "BIG") ? "SMALL" : "BIG";
}

// আপনার দেওয়া Midnight crossing fix সহ টাইমার লজিক
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
            
            if (startMin <= endMin) {
                if(currentMinutes >= startMin && currentMinutes <= endMin) return true;
            } else { 
                if(currentMinutes >= startMin || currentMinutes <= endMin) return true;
            }
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
    if(!token || !chat || !stickerId || stickerId.trim() === '') return;
    try { 
        await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ chat_id: chat, sticker: stickerId.trim() })
        }); 
    } catch(e) {}
}

// আপনার দেওয়া lastSentPeriod এর হুবহু লজিক এবং sleep 400ms লজিক
async function processPeriodChange(server, oldPeriod, actualSize, newPrediction, nextPeriodStr) {
    const channelTasks = [];

    for (let key in channelsData) {
        let c = channelsData[key];
        
        if (c.isActive && c.server === server && c.botToken && c.chatId) {
            
            channelTasks.push((async () => {
                if(!channelActiveStates[key]) {
                    channelActiveStates[key] = { 
                        martingaleActive: false, 
                        warningsSent: {},
                        lastSentPeriod: null, 
                        lastSentPred: null
                    };
                }
                let internalState = channelActiveStates[key];

                let inTime = isTimeAllowed(c.times);
                let hasUnresolvedSignal = (internalState.lastSentPeriod === oldPeriod);

                if (!inTime && !internalState.martingaleActive && !hasUnresolvedSignal) {
                    return; 
                }

                let isWin = false;
                let targetReached = false;

                if (hasUnresolvedSignal) {
                    isWin = (internalState.lastSentPred === actualSize);
                    
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

                        if (internalState.lastSentPred === 'BIG') {
                            if (c.bigMsg) await tgMsg(c.botToken, c.chatId, c.bigMsg);
                            await sleep(400); 
                            if (c.bSticker1) { await tgSticker(c.botToken, c.chatId, c.bSticker1); await sleep(400); }
                            if (c.bSticker2) { await tgSticker(c.botToken, c.chatId, c.bSticker2); await sleep(400); }
                            if (c.bSticker3) { await tgSticker(c.botToken, c.chatId, c.bSticker3); }
                        } else {
                            if (c.smallMsg) await tgMsg(c.botToken, c.chatId, c.smallMsg);
                            await sleep(400);
                            if (c.sSticker1) { await tgSticker(c.botToken, c.chatId, c.sSticker1); await sleep(400); }
                            if (c.sSticker2) { await tgSticker(c.botToken, c.chatId, c.sSticker2); await sleep(400); }
                            if (c.sSticker3) { await tgSticker(c.botToken, c.chatId, c.sSticker3); }
                        } 
                        
                        if ((targetReached || !inTime) && c.endMsg) {
                            await sleep(400);
                            await tgMsg(c.botToken, c.chatId, c.endMsg);
                        }

                    } else {
                        internalState.martingaleActive = true; 
                        if (c.sendLoss) {
                            if (c.lossMsg) await tgMsg(c.botToken, c.chatId, c.lossMsg);
                            await sleep(400);
                            if (c.lossSticker) await tgSticker(c.botToken, c.chatId, c.lossSticker);
                        }
                    }
                }

                if (!c.isActive) return; 
                
                if (!inTime && !internalState.martingaleActive) {
                    return; 
                }

                await sleep(400);
                let signalText = (c.signalMsg || '').replace(/{period}/g, nextPeriodStr).replace(/{signal}/g, newPrediction);
                await tgMsg(c.botToken, c.chatId, signalText);

                internalState.lastSentPeriod = nextPeriodStr;
                internalState.lastSentPred = newPrediction;

            })());
        }
    }
    
    await Promise.all(channelTasks);
}

// 🔥 Anti-Block Proxy System (লটারি সাইট যেন ব্লক করতে না পারে)
async function safeFetch(url) {
    const timeUrl = url + '?t=' + Date.now();
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(timeUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(timeUrl)}`,
        timeUrl
    ];

    for (let proxyUrl of proxies) {
        try {
            let res = await fetch(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }});
            if (res.ok) {
                let data = await res.json();
                if (data && data.data && data.data.list) return data;
            }
        } catch(e) {}
    }
    return null;
}

// আপনার দেওয়া হুবহু fetchServerData লজিক
async function fetchServerData(server) {
    try {
        const data = await safeFetch(APIS[server]);
        if (!data) return; 

        const latest = data.data.list[0];
        const actualPeriod = latest.issueNumber;
        const actualSize = parseInt(latest.number) >= 5 ? "BIG" : "SMALL";
        let state = serverStates[server];

        if (!state.p) {
            state.p = actualPeriod;
            state.pred = calculatePrediction(data.data.list);
        } 
        else if (state.p !== actualPeriod) {
            let oldPred = state.pred; 
            state.p = actualPeriod;   
            let newPred = calculatePrediction(data.data.list);
            state.pred = newPred;     
            
            let nextPeriodStr = (BigInt(actualPeriod) + 1n).toString();
            
            processPeriodChange(server, actualPeriod, actualSize, newPred, nextPeriodStr);
        }
    } catch (e) { }
}

// প্রতি 4 সেকেন্ডে ডাটা চেক করবে (প্রক্সি সেফটির জন্য)
setInterval(() => {
    fetchServerData('30S'); fetchServerData('1M'); 
    fetchServerData('3M'); fetchServerData('5M');
}, 4000);

// ==========================================
// ⏳ 30 MINUTE WARNING CHECKER (আপনার দেওয়া হুবহু লজিক)
// ==========================================
setInterval(() => {
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
                
                let diff = startMin - currentMinutes;
                if (diff < 0) diff += 1440; 

                if (diff === 30) {
                    if (state.warningsSent[index] !== todayStr) {
                        tgMsg(c.botToken, c.chatId, c.warningMsg);
                        state.warningsSent[index] = todayStr;
                    }
                }
            }
        });
    }
}, 60000); 

process.on('uncaughtException', err => {});
process.on('unhandledRejection', err => {});
