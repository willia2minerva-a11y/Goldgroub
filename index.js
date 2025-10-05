'use strict'
const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()

// 🔑 Variables (سيتم تعيينها لاحقًا في Render)
const TOKEN = process.env.PAGE_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.VERIFY_TOKEN

app.set('port', (process.env.PORT || 5000))
app.use(bodyParser.json()) // لمعالجة JSON
app.use(bodyParser.urlencoded({ extended: false })) // لمعالجة URL-encoded

// مسار التحقق من Webhook (GET)
app.get('/webhook', function (req, res) {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    console.log("Webhook verified!")
    res.send(req.query['hub.challenge'])
  } else {
    res.send('Error, wrong token or request mode')
  }
})

// مسار استقبال الرسائل (POST)
app.post('/webhook', function (req, res) {
  let data = req.body

  // تأكد أن هذا حدث صفحة
  if (data.object === 'page') {
    data.entry.forEach(function (entry) {
      entry.messaging.forEach(function (event) {
        if (event.message) {
          handleMessage(event)
        } else {
          console.log("Webhook received unknown event: ", event)
        }
      })
    })
    res.sendStatus(200) // يجب إرسال 200 للفيسبوك في كل مرة
  }
})

// 💡 دالة معالجة الرسائل (هنا سيتم بناء منطق الألعاب)
function handleMessage(event) {
  // ⚠️ ملاحظة: في محادثات المجموعات، قد لا يكون لديك sender.id ولكن thread.id
  // تحتاج إلى التحقق مما إذا كانت الرسالة contain event.message.text
  // ومن ثم التحقق من وجود @mention باسم البوت

  let senderId = event.sender.id // قد لا يعمل في المجموعات، تحتاج إلى التحقق من thread_key
  let messageText = event.message.text || ""

  // 1. منطق الرد على المنشن (التفاعل مع المجموعات)
  if (event.message.metadata) {
      // هنا يمكنك التحقق من metadata إذا كنت تستخدم تقنية Group API
  } else if (messageText.includes('@اسم_البوت_الخاص_بك')) {
    // إذا تم ذكر اسم البوت، قم بتحليل الأوامر هنا
    if (messageText.includes('xo ابدأ')) {
      sendTextMessage(senderId, "لعبة X O بدأت! دورك يا @...")
    } else {
      sendTextMessage(senderId, "تم ذكر اسمي! أنا مستعد للعب أو الرد على الأوامر.")
    }
  }
  // هنا نحتاج إلى إضافة منطق الألعاب، وهو الجزء الذي سيتطلب منك التعمق في البرمجة.
}

// 💡 دالة إرسال الرسائل (استخدام Facebook Send API)
function sendTextMessage(recipientId, messageText) {
  let messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  }
  callSendAPI(messageData)
}

// 💡 دالة استدعاء API الإرسال
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v19.0/me/messages',
    qs: { access_token: TOKEN },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Message successfully sent.")
    } else {
      console.error("Failed to send message:", response.statusCode, response.statusMessage, body)
    }
  })
}

// تشغيل الخادم
app.listen(app.get('port'), function () {
  console.log('Node app is running on port', app.get('port'))
})
