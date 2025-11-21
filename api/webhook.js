const line = require('@line/bot-sdk');
const axios = require('axios');

// 從環境變數讀取 LINE 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// Vercel 的 Node 函式入口
module.exports = async (req, res) => {
  // 給瀏覽器測試用：GET 的時候回 OK
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const events = (req.body && req.body.events) || [];

  try {
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) {
    console.error('handleEvent error:', err);
    res.status(500).send('Error');
  }
};

// 處理每一個 LINE 事件
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const messageText = (event.message.text || '').trim();
  let replyText;

  if (/^(頭條|國際新聞|news|國際)$/i.test(messageText)) {
    replyText = await getNewsHeadlines();
  } else {
    replyText =
      `你剛剛說：「${messageText}」\n\n` +
      `如果想看最新國際頭條，可以輸入：\n` +
      `- 頭條\n` +
      `- 國際新聞\n` +
      `- news`;
  }

  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

// 呼叫 mediastack 抓新聞
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
        languages: 'en',           // 英文
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
