'use strict'
const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios')
const mongoose = require('mongoose') // ✨ استدعاء Mongoose

const app = express()

// 🔑 المتغيرات
const TOKEN = process.env.PAGE_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.VERIFY_TOKEN
const MONGO_URI = process.env.MONGO_URI // ✨ رابط MongoDB من Render
const BOT_NAME = 'بوت'
// ---------------------------
// 1. الاتصال بقاعدة البيانات (MongoDB)
// ---------------------------
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('MongoDB Connected Successfully!'))
        .catch(err => console.error('MongoDB Connection Error:', err));
}

// ---------------------------
// 2. تعريف نموذج اللعبة (Game Schema)
// ---------------------------
// سنخزن حالة اللعبة لكل محادثة (threadId)
const gameSchema = new mongoose.Schema({
    threadId: { type: String, required: true, unique: true }, // معرف المحادثة (المجموعة)
    board: { type: [String], default: ['', '', '', '', '', '', '', '', ''] }, // حالة اللوحة (9 خانات)
    currentPlayer: { type: String, default: 'X' }, // من دوره
    isActive: { type: Boolean, default: false }, // هل اللعبة نشطة؟
    players: { type: Object, default: {} } // لتخزين IDs اللاعبين (مثال: { 'X': '12345', 'O': '67890' })
});
const Game = mongoose.model('Game', gameSchema);


// ---------------------------
// 3. إعداد الخادم والـ Webhook
// ---------------------------
app.set('port', (process.env.PORT || 5000))
app.use(bodyParser.json()) 
app.use(bodyParser.urlencoded({ extended: false }))

// مسار التحقق (GET /webhook)
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge'])
  } else {
    res.sendStatus(403)
  }
})

// مسار استقبال الرسائل (POST /webhook)
app.post('/webhook', (req, res) => {
  const data = req.body
  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message) {
          handleMessage(event)
        }
      })
    })
    res.sendStatus(200) 
  } else {
      res.sendStatus(404)
  }
})

// ---------------------------
// 4. دالة معالجة الرسائل (اللعبة هنا)
// ---------------------------
async function handleMessage(event) {
  const senderId = event.sender.id;
  // في مجموعات الماسنجر، قد نحتاج لاستخدام thread_key أو ببساطة senderId كمعرف مبدئي
  const threadId = event.thread_key || senderId; 
  const messageText = event.message.text ? event.message.text.toLowerCase().trim() : "";

  // الرد فقط إذا تم ذكر البوت أو كانت محادثة فردية
  if (messageText.includes(BOT_NAME.toLowerCase()) || threadId === senderId) {
    
    // إزالة اسم البوت من الأمر
    const command = messageText.replace(BOT_NAME.toLowerCase(), '').trim();

    if (command === 'xo ابدأ') {
        await handleStartGame(threadId, senderId);
    } else if (command.match(/^xo [1-9]$/)) {
        const move = parseInt(command.split(' ')[1]);
        await handleMove(threadId, senderId, move);
    } else {
        // رسالة ترحيبية أو تعليمات عامة
        sendTextMessage(threadId, "أهلاً! أنا بوت الألعاب. لبدء لعبة X O، اكتب: " + BOT_NAME + " xo ابدأ");
    }
  }
}

// ---------------------------
// منطق لعبة X O
// ---------------------------

async function handleStartGame(threadId, senderId) {
    try {
        let game = await Game.findOne({ threadId });
        
        if (game && game.isActive) {
            return sendTextMessage(threadId, "اللعبة نشطة بالفعل. دور اللاعب " + game.currentPlayer + ".\n" + displayBoard(game.board));
        }

        // بدء لعبة جديدة
        game = await Game.findOneAndUpdate(
            { threadId },
            { 
                isActive: true, 
                board: ['', '', '', '', '', '', '', '', ''], 
                currentPlayer: 'X',
                players: { 'X': senderId, 'O': null } // تعيين اللاعب X
            },
            { upsert: true, new: true }
        );

        sendTextMessage(threadId, `بدأت لعبة X O جديدة! أنت اللاعب X. اكتب ${BOT_NAME} xo 1-9 لوضع حركتك.\n` + displayBoard(game.board));

    } catch (e) {
        console.error("Error starting game:", e);
        sendTextMessage(threadId, "عفواً، حدث خطأ أثناء بدء اللعبة.");
    }
}

async function handleMove(threadId, senderId, move) {
    const game = await Game.findOne({ threadId });

    if (!game || !game.isActive) {
        return sendTextMessage(threadId, `لا توجد لعبة نشطة. اكتب ${BOT_NAME} xo ابدأ لبدء واحدة.`);
    }

    const index = move - 1;

    // التحقق من دور اللاعب
    if (game.players[game.currentPlayer] !== senderId) {
        // هنا يمكننا تسجيل اللاعب O إذا لم يكن مسجلاً بعد
        if (game.players['O'] === null && game.currentPlayer === 'O' && game.players['X'] !== senderId) {
             game.players['O'] = senderId;
             await game.save();
        } else {
             return sendTextMessage(threadId, `هذا ليس دورك! دور اللاعب ${game.currentPlayer}.`);
        }
    }

    // التحقق من صحة الحركة
    if (index < 0 || index >= 9 || game.board[index] !== '') {
        return sendTextMessage(threadId, "حركة غير صالحة. اختر خانة فارغة بين 1 و 9.\n" + displayBoard(game.board));
    }

    // تطبيق الحركة
    game.board[index] = game.currentPlayer;
    
    // التحقق من الفوز
    const winner = checkWinner(game.board);
    if (winner) {
        game.isActive = false;
        await game.save();
        return sendTextMessage(threadId, `🎉🎉 اللاعب ${winner} فاز! اكتب ${BOT_NAME} xo ابدأ للعب مرة أخرى.\n` + displayBoard(game.board));
    }
    
    // التحقق من التعادل
    if (game.board.every(cell => cell !== '')) {
        game.isActive = false;
        await game.save();
        return sendTextMessage(threadId, `تعادل! لا توجد خانات فارغة. اكتب ${BOT_NAME} xo ابدأ للعب مرة أخرى.\n` + displayBoard(game.board));
    }

    // تغيير الدور
    game.currentPlayer = (game.currentPlayer === 'X') ? 'O' : 'X';
    
    await game.save();

    sendTextMessage(threadId, `دور اللاعب ${game.currentPlayer} الآن.\n` + displayBoard(game.board));
}

function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // الصفوف
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // الأعمدة
        [0, 4, 8], [2, 4, 6],           // الأقطار
    ];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; // الفائز (X أو O)
        }
    }
    return null;
}

function displayBoard(board) {
    // تنسيق لوحة بسيطة لعرضها في الرسالة
    let display = "";
    for (let i = 0; i < 9; i++) {
        display += (board[i] || (i + 1)); // عرض X أو O أو الرقم (للتوجيه)
        if ((i + 1) % 3 === 0) {
            display += "\n";
            if (i < 8) display += "----------\n";
        } else {
            display += " | ";
        }
    }
    return display;
}

// ---------------------------
// 5. دالة إرسال الرسائل (باستخدام Axios)
// ---------------------------
function sendTextMessage(recipientId, messageText) {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  }

  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${TOKEN}`;

  axios.post(url, messageData)
    // ... (منطق الردود والـ catchs كما في الكود السابق)

    .then(response => {
      if (response.status === 200) {
        console.log("Message successfully sent to:", recipientId);
      } else {
        console.error("API response status was not 200:", response.status, response.data);
      }
    })
    .catch(error => {
      console.error("Failed to send message via Axios. Error details:", error.response ? error.response.data : error.message);
    });
}


// تشغيل الخادم
app.listen(app.get('port'), function () {
  console.log('Node app is running on port', app.get('port'))
})
