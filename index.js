'use strict'
const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios') // استخدام axios بدلاً من request
const app = express()

// 🔑 المتغيرات (سيتم قراءتها من إعدادات Render)
const TOKEN = process.env.PAGE_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.VERIFY_TOKEN
const BOT_NAME = 'بوت غولد'

app.set('port', (process.env.PORT || 5000))
app.use(bodyParser.json()) 
app.use(bodyParser.urlencoded({ extended: false }))

// ---------------------------
// 1. مسار التحقق من Webhook (GET)
// ---------------------------
app.get('/webhook', function (req, res) {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log("Webhook verified!")
    res.send(req.query['hub.challenge'])
  } else {
    // إذا فشل التحقق، تأكد من أن VERIFY_TOKEN في Render مطابق لما في Meta
    console.error("Verification failed. Tokens do not match.");
    res.sendStatus(403)
  }
})

// ---------------------------
// 2. مسار استقبال الرسائل (POST)
// ---------------------------
app.post('/webhook', function (req, res) {
  let data = req.body
  
  if (data.object === 'page') {
    data.entry.forEach(function (entry) {
      entry.messaging.forEach(function (event) {
        if (event.message) {
          handleMessage(event)
        } else {
          console.log("Webhook received unknown event type: ", event)
        }
      })
    })
    // ⚠️ مهم: يجب إرسال 200 بسرعة لتجنب إعادة إرسال فيسبوك لنفس الحدث
    res.sendStatus(200) 
  } else {
      res.sendStatus(404)
  }
})

// ---------------------------
// 3. دالة معالجة الرسائل (Game Logic Here)
// ---------------------------
function handleMessage(event) {
  const senderId = event.sender.id // معرف المرسل الفردي (قد يكون غير موثوق به في المجموعات)
  const threadId = event.thread_key || senderId; // استخدام thread_key للمجموعات إذا كان متاحًا
  const messageText = event.message.text || ""

  console.log(`Received message from ${threadId}: ${messageText}`);

  // 🚩 منطق الرد على المنشن في المجموعات (قد يكون event.message.mentions)
  // أو ببساطة البحث عن اسم البوت في النص
  if (messageText.includes(BOT_NAME)) {
    
    let responseText = "مرحباً! أنا جاهز للعب. اكتب 'xo ابدأ' لبدء اللعبة."
    
    // مثال منطق الأوامر
    if (messageText.includes('xo ابدأ')) {
        responseText = "لعبة X O بدأت! دورك."
    } else if (messageText.includes('!echo')) {
        // أمر اختبار الصدى
        responseText = `صدى: ${messageText.replace(BOT_NAME, '').replace('!echo', '').trim()}`
    }
    
    sendTextMessage(threadId, responseText)
  
  } else if (event.message && !event.message.is_echo) {
      // منطق الرد في المحادثات الفردية (للتأكد من أن البوت يعمل 1-to-1)
      // يمكنك تعطيل هذا إذا كان تركيزك فقط على المجموعات
      sendTextMessage(senderId, "أهلاً! للتفاعل معي في المجموعات، تأكد من ذكر اسمي (@" + BOT_NAME + ").")
  }
}


// ---------------------------
// 4. دالة إرسال الرسائل (باستخدام Axios)
// ---------------------------
function sendTextMessage(recipientId, messageText) {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  }

  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${TOKEN}`;

  axios.post(url, messageData)
    .then(response => {
      if (response.status === 200) {
        console.log("Message successfully sent to:", recipientId);
      } else {
        console.error("API response status was not 200:", response.status, response.data);
      }
    })
    .catch(error => {
      // تفاصيل الخطأ تساعد في تحديد المشكلة (مثل رمز وصول غير صحيح)
      console.error("Failed to send message via Axios. Error details:", error.response ? error.response.data : error.message);
    });
}


// تشغيل الخادم
app.listen(app.get('port'), function () {
  console.log('Node app is running on port', app.get('port'))
})
