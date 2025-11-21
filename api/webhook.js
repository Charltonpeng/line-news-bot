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
// 處理每一個事件
async function handleEvent(event) {
  // 只處理文字訊息
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const messageText = (event.message.text || '').trim();

  let topic = null;

  // 一般國際頭條
  if (/^(頭條|國際新聞|news|國際)$/i.test(messageText)) {
    topic = 'top';
  }
  // 政治新聞
  else if (/^(政治|politics)$/i.test(messageText)) {
    topic = 'politics';
  }
  // 商業／金融新聞
  else if (/^(business|商業|金融|finance)$/i.test(messageText)) {
    topic = 'business';
  }

  let replyText;

  if (topic) {
    // 有對到其中一個指令，就去抓對應新聞
    replyText = await getNewsHeadlines(topic);
  } else {
    // 其他文字就原樣回覆 + 教他可以輸入什麼
    replyText =
      `你剛剛說：「${messageText}」\n\n` +
      `目前支援的指令有：\n` +
      `- 頭條 / 國際新聞 / news / 國際（綜合國際頭條）\n` +
      `- 政治 / politics（國際政治）\n` +
      `- 金融 / business（商業／金融）`;
  }

  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}


// 呼叫 mediastack 抓新聞
// 用 NewsAPI 抓新聞
async function getNewsHeadlines(topic = 'top') {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    console.error('NEWSAPI_KEY 未設定');
    return '目前新聞服務暫時無法使用，請稍後再試。';
  }

  try {
    // 共用查詢參數
    const params = {
      apiKey,
      language: 'en', // 英文新聞
      pageSize: 5,    // 只抓 5 則
      // 指定幾家主流媒體（不能和 country 一起用）
      sources: 'associated-press,bbc-news,cnn,reuters,the-washington-post',
    };

    // 依照不同主題，加上關鍵字過濾
    if (topic === 'politics') {
      // 政治相關
      params.q = 'politics OR election OR government';
    } else if (topic === 'business') {
      // 商業／金融相關
      params.q = 'business OR finance OR market OR economy';
    }
    // topic === 'top' 的時候，不加 q，純看各家媒體頭條

    const response = await axios.get('https://newsapi.org/v2/top-headlines', {
      params,
      timeout: 5000,
    });

    const articles = response.data.articles || [];

    if (!articles.length) {
      return '目前抓不到符合條件的新聞，等一下再試試看。';
    }

    // 不同主題用不同開頭
    let titlePrefix = '🌐 最新國際頭條：\n';
    if (topic === 'politics') {
      titlePrefix = '🗳 最新國際政治：\n';
    } else if (topic === 'business') {
      titlePrefix = '💹 最新商業／金融：\n';
    }

    let text = titlePrefix;

    articles.forEach((article, index) => {
      const title = article.title || '（無標題）';
      const source = (article.source && article.source.name) || '';
      const url = article.url || '';

      text += `\n${index + 1}. ${title}\n`;
      if (source) text += `來源：${source}\n`;
      if (url) text += `${url}\n`;
    });

    return text;
  } catch (err) {
    console.error('取得新聞時發生錯誤（NewsAPI）：', err.response?.data || err.message);
    return '抓取新聞時發生錯誤，請稍後再試。';
  }
}
