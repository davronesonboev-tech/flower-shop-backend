require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');

// 1. НАСТРОЙКИ
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// ID Тети и Твой
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => Number(id));

app.use(cors());
app.use(express.json());

// 2. КОМАНДЫ БОТА
bot.start((ctx) => {
  ctx.reply('👋 Привет! Я бот магазина цветов.\nЯ буду присылать сюда новые заказы для обработки. 🌸\n\nВаш ID: ' + ctx.from.id);
});

// 3. API ДЛЯ САЙТА
app.post('/api/create-order', async (req, res) => {
  try {
    const { cart, clientData, totalPrice } = req.body;

    console.log('Новый заказ от:', clientData.name);

    const date = new Date().toLocaleDateString('ru-RU');
    
    const itemsList = cart.map((item, i) => 
      `${i + 1}. ${item.name} (${item.quantity} шт.)`
    ).join('\n');

    let messageText = `🔥 <b>НОВЫЙ ЗАКАЗ</b>\n\n`;
    messageText += `👤 <b>Клиент:</b> ${clientData.name}\n`;
    messageText += `📱 <b>Тел:</b> ${clientData.phone}\n`;
    
    if (clientData.isGift) {
      messageText += `🎁 <b>ЭТО ПОДАРОК!</b>\n`;
      messageText += `Кому: ${clientData.recipientName} (${clientData.recipientPhone})\n`;
    }

    if (clientData.address) {
      if (clientData.address.includes('http')) {
         const urlMatch = clientData.address.match(/(https?:\/\/[^\s]+)/g);
         const url = urlMatch ? urlMatch[0] : '#';
         messageText += `📍 <b>Адрес:</b> <a href="${url}">Открыть на карте 🗺</a>\n`;
         const note = clientData.address.replace(url, '').replace('📍 Геолокация (нажмите чтобы открыть):', '').trim();
         if (note) messageText += `(Инфо: ${note})\n`;
      } else {
         messageText += `📍 <b>Адрес:</b> ${clientData.address}\n`;
      }
    }

    messageText += `\n🛒 <b>Корзина:</b>\n${itemsList}\n\n`;
    messageText += `💰 <b>ИТОГО: ${new Intl.NumberFormat('ru-RU').format(totalPrice)} сум</b>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Принять', 'status_accepted'),
        Markup.button.callback('❌ Отклонить', 'status_rejected')
      ],
      [
        Markup.button.url('📞 Написать клиенту', `https://t.me/${clientData.phone.replace(/\D/g, '')}`)
      ]
    ]);

    for (const adminId of ADMIN_IDS) {
      if (!adminId) continue;
      try {
        if (cart[0]?.image_url) {
            await bot.telegram.sendPhoto(adminId, cart[0].image_url, {
                caption: messageText,
                parse_mode: 'HTML',
                ...keyboard
            });
        } else {
            await bot.telegram.sendMessage(adminId, messageText, {
                parse_mode: 'HTML',
                ...keyboard
            });
        }
      } catch (e) {
        console.error(`Не удалось отправить админу ${adminId}:`, e.message);
      }
    }

    res.json({ success: true, message: 'Order sent' });

  } catch (error) {
    console.error('Ошибка обработки заказа:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. ОБРАБОТКА КНОПОК
bot.action('status_accepted', (ctx) => {
  const originalCaption = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text;
  ctx.editMessageCaption(
    originalCaption + '\n\n✅ <b>ЗАКАЗ ПРИНЯТ В РАБОТУ</b>',
    { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚚 Передан курьеру', 'status_delivery')]
        ])
    }
  ).catch(() => {}); 
  ctx.answerCbQuery('Отлично! Работаем.');
});

bot.action('status_rejected', (ctx) => {
    const originalCaption = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text;
    ctx.editMessageCaption(
      originalCaption + '\n\n❌ <b>ЗАКАЗ ОТКЛОНЕН</b>',
      { parse_mode: 'HTML' }
    ).catch(() => {});
    ctx.answerCbQuery('Заказ отменен.');
  });

bot.action('status_delivery', (ctx) => {
    const originalCaption = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text;
    ctx.editMessageCaption(
      originalCaption + '\n\n🚚 <b>КУРЬЕР В ПУТИ</b>',
      { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏁 Доставлено (Финиш)', 'status_done')]
        ])
      } 
    ).catch(() => {});
    ctx.answerCbQuery('Курьер поехал!');
});

bot.action('status_done', (ctx) => {
    const originalCaption = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text;
    ctx.editMessageCaption(
      originalCaption + '\n\n🏁 <b>ВЫПОЛНЕНО УСПЕШНО</b>',
      { parse_mode: 'HTML' }
    ).catch(() => {});
    ctx.answerCbQuery('Ура! Заказ закрыт.');
});

// 5. ЗАПУСК
bot.launch().then(() => {
    console.log('🤖 Бот запущен и готов к работе!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер слушает порт ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
