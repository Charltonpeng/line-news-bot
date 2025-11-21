const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

// 從環境變數讀取 LINE 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();

// LINE Webhook 入口
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 處理每一個事件
async function handleEvent(event) {
  // 只處理文字訊息
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const messageText = (event.message.text || '').trim();

  let replyText;

  // 使用者輸入「頭條」「國際新聞」「news」「國際」就抓新聞
  if (/^(頭條|國際新聞|news|國際)$/i.test(messageText)) {
    replyText = await getNewsHeadlines();
  } else {
    // 其他文字就原樣回覆 + 教他可以輸入什麼
    replyText =
      `你剛剛說：「${messageText}」\n\n` +
      `如果想看最新國際頭條，可以輸入：\n` +
      `- 頭條\n` +
      `- 國際新聞\n` +
      `- news`;
  }

  const client = new line.Client(config);
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

// 這個函式真的去叫 mediastack 抓新聞
async function getNewsHeadlines() {
  const apiKey = process.env.MEDIASTACK_API_KEY;
  if (!apiKey) {
    console.error('MEDIASTACK_API_KEY 未設定');
    return '目前新聞服務暫時無法使用，請稍後再試。';
  }

  try {
    const response = await axios.get('http://api.mediastack.com/v1/news', {
      params: {
        access_key: apiKey,
        countries: 'us,gb',        // 美國 + 英國
        languages: 'en',           // 英文新聞
        categories: 'general',     // 一般新聞
        sort: 'published_desc',    // 新到舊
        limit: 5,                  // 只抓 5 則
      },
      timeout: 5000,
    });

    const data = response.data;
    const articles = data.data || [];

    if (!articles.length) {
      return '目前抓不到國際頭條，等一下再試試看。';
    }

    let text = '🌐 最新國際頭條：\n';

    articles.forEach((article, index) => {
      const title = article.title || '（無標題）';
      const source = article.source || '';
      const url = article.url || '';

      text += `\n${index + 1}. ${title}\n`;
      if (source) text += `來源：${source}\n`;
      if (url) text += `${url}\n`;
    });

    return text;
  } catch (err) {
    console.error('取得新聞時發生錯誤：', err.message);
    return '抓取新聞時發生錯誤，請稍後再試。';
  }
}

// 給 Vercel 使用
module.exports = app;
