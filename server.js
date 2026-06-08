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
    console.log(`🚀 MULTI-CHANNEL BACKGROUND ENGINE STARTED!`);
});

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
let sentSignalsLog = {}; 

onValue(channelsRef, (snapshot) => {
    channelsData = snapshot.val() || {};
    console.log(`🔄 Channels Synced! Total Channels in DB: ${Object.keys(channelsData).length}`);
});

const APIS = {
    '30S': 'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    '1M': 'https://draw.ar-lottery02.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
    '3M': 'https://draw.ar-lottery02.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
    '5M': 'https://draw.ar-lottery02.com/WinGo/WinGo_5M/GetHistoryIssuePage.json'
};

// কনকারেন্সি লকিং সিস্টেম
const serverStates = {
    '30S': { p: null, pred: null, isFetching: false }, 
    '1M': { p: null, pred: null, isFetching: false },
    '3M': { p: null, pred: null, isFetching: false }, 
    '5M': { p: null, pred: null, isFetching: false }
};

function calculatePrediction(list) {
    const last5 = list.slice(0, 5).map(x => parseInt(x.number) >= 5 ? "BIG" : "SMALL");
    if (last5[0] === last5[1] && last5[1] === last5[2]) return last5[0]; 
    return (last5[0] === "BIG") ? "SMALL" : "BIG";
}

// চেক করবে এই সার্ভারটি ডাটাবেজে কোনো সচল চ্যানেলের জন্য প্রয়োজন কি না
function isServerNeeded(server) {
    for (let key in channelsData) {
        let c = channelsData[key];
        if (c.isActive && c.server === server) {
            return true; // সচল চ্যানেল পাওয়া গেছে
        }
    }
    return false; // এই সার্ভারের কোনো সচল চ্যানেল নেই
}

// Timezone & Format Fix
function isTimeAllowed(timesRaw) {
    if(!timesRaw) return true; 
    let timesArray = Array.isArray(timesRaw) ? timesRaw : Object.values(timesRaw);
    if(timesArray.length === 0) return true;

    let now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Dhaka"}));
    let currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    let hasValidBoxSet = false;

    for(let box of timesArray) {
        if(box && box.start && box.end) {
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

// Telegram Message Sender
async function tgMsg(token, chat, text) {
    if(!token || !chat || !text) return;
    try { 
        let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
        }); 
        let json = await res.json();
        if(!json.ok) {
            console.log(`⚠️ Telegram Warning [${chat}]:`, json.description);
        } else {
            console.log(`📩 Message sent to Telegram [${chat}]`);
        }
    } catch(e) {
        console.log(`❌ Telegram API Request Failed:`, e.message);
    }
}

async function tgSticker(token, chat, stickerId) {
    if(!token || !chat || !stickerId || stickerId.trim() === '') return;
    try { 
        let res = await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ chat_id: chat, sticker: stickerId.trim() })
        }); 
    } catch(e) {}
}

async function processPeriodChange(server, oldPeriod, actualSize, newPrediction, nextPeriodStr) {
    const channelTasks = [];

    for (let key in channelsData) {
        let c = channelsData[key];
        
        if (c.isActive && c.server === server && c.botToken && c.chatId) {
            
            // ফায়ারবেস ও মেমোরি ডুপ্লিকেট লক
            if (c.lastSentPeriod === nextPeriodStr) {
                continue; 
            }

            let sentinelKey = `${c.chatId}_${nextPeriodStr}`;
            if (sentSignalsLog[sentinelKey]) {
                continue; 
            }
            sentSignalsLog[sentinelKey] = true;

            update(ref(db, `channels/${key}`), { lastSentPeriod: nextPeriodStr });

            console.log(`📡 Processing channel [${c.name}] for server ${server}...`);
            channelTasks.push((async () => {
                try {
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
                    if (!inTime && !internalState.martingaleActive) return; 

                    await sleep(400);
                    let signalText = (c.signalMsg || '').replace(/{period}/g, nextPeriodStr).replace(/{signal}/g, newPrediction);
                    await tgMsg(c.botToken, c.chatId, signalText);

                    internalState.lastSentPeriod = nextPeriodStr;
                    internalState.lastSentPred = newPrediction;
                    
                } catch(err) {
                    console.log(`❌ Error processing channel [${c.name}]:`, err.message);
                }
            })());
        }
    }
    
    await Promise.all(channelTasks);
}

// আত্ম-নিরাময়কারী (Self-Healing) মাল্টি-প্রক্সি ইঞ্জিন
async function safeFetch(url) {
    const timeUrl = url + '?t=' + Date.now();
    const encodedUrl = encodeURIComponent(timeUrl);
    
    // গুগল লিমিট শেষ হলে ২, ৩ ও ৪ নম্বর প্রক্সি ব্যাকআপ হিসেবে স্বয়ংক্রিয়ভাবে কাজ করবে
    const proxies = [
        `https://script.google.com/macros/s/AKfycbyKdJNB9kSmVg9Ye70z93knOaBQhkRUxkiis_fT9E6HGhRhxtJKkU1kpbvGDeCc5IQq3g/exec?url=${encodedUrl}`,
        `https://corsproxy.io/?url=${encodedUrl}`,
        `https://autumn-sun-c0ee.habiburrahman009000.workers.dev/?url=${encodedUrl}`,
        `https://api.allorigins.win/raw?url=${encodedUrl}`
    ];

    for (let i = 0; i < proxies.length; i++) {
        let proxyUrl = proxies[i];
        try {
            let res = await fetch(proxyUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: AbortSignal.timeout(10000) // ১০ সেকেন্ড টাইমআউট
            });
            
            if (res.ok) {
                let text = await res.text();
                
                if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                    let data = JSON.parse(text);
                    if (data && data.data && data.data.list) {
                        if (i > 0) {
                            console.log(`⚠️ Primary Google Proxy (Limit exceeded/Failed). Backup Proxy ${i} Succeeded!`);
                        }
                        return data;
                    }
                }
            }
        } catch(e) {
            // পরবর্তী ব্যাকআপ প্রক্সি ট্রাই করবে
        }
    }
    return null;
}

async function fetchServerData(server) {
    // যদি এই সার্ভারের কোনো একটিভ চ্যানেল ডাটাবেজে না থাকে, তবে রিকোয়েস্ট স্কিপ করে কোটা বাঁচাবে
    if (!isServerNeeded(server)) {
        return; 
    }

    let state = serverStates[server];
    if (state.isFetching) return; 
    
    state.isFetching = true;
    try {
        const data = await safeFetch(APIS[server]);
        if (!data) {
            console.log(`❌ [${server}] API-তে ডেটা পাওয়া যায়নি (Proxy Connection Issue)`);
            state.isFetching = false;
            return; 
        }

        const latest = data.data.list[0];
        const actualPeriod = latest.issueNumber;
        const actualSize = parseInt(latest.number) >= 5 ? "BIG" : "SMALL";

        if (!state.p) {
            state.p = actualPeriod;
            state.pred = calculatePrediction(data.data.list);
            console.log(`📡 [${server}] Initialized. Start Period: ${actualPeriod}, Next Prediction: ${state.pred}`);
        } 
        else if (state.p !== actualPeriod) {
            let oldPred = state.pred; 
            state.p = actualPeriod;   
            let newPred = calculatePrediction(data.data.list);
            state.pred = newPred;     
            
            let nextPeriodStr = (BigInt(actualPeriod) + 1n).toString();
            console.log(`⚡ [${server}] Period Changed! Old: ${actualPeriod} (${actualSize}). New Signal: ${newPred}`);
            
            processPeriodChange(server, actualPeriod, actualSize, newPred, nextPeriodStr);
        }
        state.isFetching = false;
    } catch (e) {
        state.isFetching = false;
        console.log(`⚠️ [${server}] Fetch Error:`, e.message);
    }
}

// স্মার্ট ডিস্ট্রিবিউটেড টাইম চেকার (কোটা সেভিং ইন্টারভাল)
setInterval(() => fetchServerData('30S'), 6000);   // 30S চেক হবে প্রতি ৬ সেকেন্ডে
setInterval(() => fetchServerData('1M'), 12000);   // 1M চেক হবে প্রতি ১২ সেকেন্ডে
setInterval(() => fetchServerData('3M'), 30000);   // 3M চেক হবে প্রতি ৩০ সেকেন্ডে
setInterval(() => fetchServerData('5M'), 45000);   // 5M চেক হবে প্রতি ৪৫ সেকেন্ডে

// 30 MIN WARNING CHECKER
setInterval(() => {
    let now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Dhaka"}));
    let currentMinutes = now.getHours() * 60 + now.getMinutes();
    let todayStr = now.toDateString();

    for (let key in channelsData) {
        let c = channelsData[key];
        
        if (!c.botToken || !c.chatId || !c.warningMsg || !c.times) continue;

        if (!channelActiveStates[key]) channelActiveStates[key] = { warningsSent: {} };
        let state = channelActiveStates[key];
        if (!state.warningsSent) state.warningsSent = {};

        let timesArray = Array.isArray(c.times) ? c.times : Object.values(c.times);

        timesArray.forEach((box, index) => {
            if (box && box.start) {
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
