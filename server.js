/**
 * ГЛАВНЫЙ МОЗГ: СЕРВЕР И БОТ (Node.js + Telegraf)
 * Этот код ты зальешь на Railway.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');

// 1. НАСТРОЙКИ
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// ID Тети и Твой (чтобы бот знал, кому слать заказы)
// В Railway в переменных окружения добавим ADMIN_ID
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => Number(id));

app.use(cors()); // Разрешаем запросы с сайта
app.use(express.json());

// 2. КОМАНДЫ БОТА
bot.start((ctx) => {
  ctx.reply('Привет! Я бот магазина цветов. Я буду присылать сюда новые заказы. 🌸');
});

// 3. API ДЛЯ САЙТА (Сюда прилетают заказы)
app.post('/api/create-order', async (req, res) => {
  try {
    const { cart, clientData, totalPrice } = req.body;

    console.log('Новый заказ:', clientData.name);

    // Формируем текст сообщения
    const date = new Date().toLocaleDateString('ru-RU');
    
    // Собираем список товаров
    const itemsList = cart.map((item, i) => 
      `${i + 1}. ${item.name} (${item.quantity} шт.)`
    ).join('\n');

    // Формируем красивый чек
    let messageText = `🔥 <b>НОВЫЙ ЗАКАЗ</b>\n\n`;
    messageText += `👤 <b>Клиент:</b> ${clientData.name}\n`;
    messageText += `📱 <b>Тел:</b> ${clientData.phone}\n`;
    
    if (clientData.isGift) {
      messageText += `🎁 <b>ЭТО ПОДАРОК!</b>\n`;
      messageText += `Кому: ${clientData.recipientName} (${clientData.recipientPhone})\n`;
    }

    if (clientData.address) {
      // Если это геолокация (ссылка), делаем её кликабельной
      if (clientData.address.includes('http')) {
         messageText += `📍 <b>Адрес:</b> <a href="${clientData.address}">Открыть на карте</a>\n`;
      } else {
         messageText += `📍 <b>Адрес:</b> ${clientData.address}\n`;
      }
    }

    messageText += `\n🛒 <b>Корзина:</b>\n${itemsList}\n\n`;
    messageText += `💰 <b>ИТОГО: ${new Intl.NumberFormat('ru-RU').format(totalPrice)} сум</b>`;

    // Клавиатура для админа
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Принять', 'status_accepted'),
        Markup.button.callback('❌ Отклонить', 'status_rejected')
      ],
      [
        Markup.button.url('📞 Позвонить клиенту', `https://t.me/${clientData.phone.replace(/\D/g, '')}`)
      ]
    ]);

    // Отправляем всем админам
    for (const adminId of ADMIN_IDS) {
      try {
        // Если у первого товара есть фото, отправляем как фото с подписью
        if (cart[0]?.image_url) {
            await bot.telegram.sendPhoto(adminId, cart[0].image_url, {
                caption: messageText,
                parse_mode: 'HTML',
                ...keyboard
            });
        } else {
            // Иначе просто текст
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

// 4. ОБРАБОТКА КНОПОК (Интерактив для Тети)
bot.action('status_accepted', (ctx) => {
  const originalCaption = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text;
  // Меняем кнопки на статус
  ctx.editMessageCaption(
    originalCaption + '\n\n✅ <b>ЗАКАЗ ПРИНЯТ</b>',
    { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚚 Передан курьеру', 'status_delivery')]
        ])
    }
  ).catch(() => {}); // Игнорим ошибки если текст не изменился
  ctx.answerCbQuery('Заказ принят в работу!');
});

bot.action('status_rejected', (ctx) => {
    const originalCaption = ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text;
    ctx.editMessageCaption(
      originalCaption + '\n\n❌ <b>ЗАКАЗ ОТКЛОНЕН</b>',
      { parse_mode: 'HTML' } // Убираем кнопки
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
            [Markup.button.callback('🏁 Доставлено', 'status_done')]
        ])
      } 
    ).catch(() => {});
    ctx.answerCbQuery('Статус: Курьер');
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
// Для Railway (Webhook или Polling)
// Для простоты начнем с Polling (Railway нормально его держит на Hobby тарифе)
bot.launch().then(() => {
    console.log('Бот запущен!');
});

app.listen(PORT, () => {
  console.log(`Сервер слушает порт ${PORT}`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

---

### Твои действия (Инструкция Обычному Мозгу 🧠):

Мы сейчас сделаем профессиональный деплой.

**ШАГ 1: Подготовь папку Backend**
1.  Создай на компе новую папку `flower-shop-backend`.
2.  Внутри создай файл `server.js` и вставь туда код выше.
3.  Там же создай файл `package.json`:
    ```json
    {
      "name": "flower-bot",
      "version": "1.0.0",
      "main": "server.js",
      "scripts": {
        "start": "node server.js"
      },
      "dependencies": {
        "cors": "^2.8.5",
        "dotenv": "^16.3.1",
        "express": "^4.18.2",
        "telegraf": "^4.15.3"
      }
    }
    ```
4.  Загрузи эту папку на **GitHub** (создай новый репозиторий `flower-backend` и залей туда эти 2 файла).

**ШАГ 2: Railway (Включаем магию)**
1.  Зайди в Railway.
2.  Нажми **New Project** -> **Deploy from GitHub repo**.
3.  Выбери свой репо `flower-backend`.
4.  Railway начнет сборку. Но она упадет, потому что нет переменных.
5.  Зайди в настройки проекта в Railway -> **Variables** и добавь:
    * `BOT_TOKEN`: (Возьми у @BotFather)
    * `ADMIN_IDS`: (ID тети, запятая, твой ID. Например: `1234567,9876543`)
    * `PORT`: `3000`
6.  Railway пересоберет проект.
7.  Зайди в **Settings** -> **Networking** -> **Generate Domain**.
8.  Он даст тебе ссылку, например: `https://flower-backend-production.up.railway.app`.
    **ЭТО ССЫЛКА НА ТВОЙ СЕРВЕР. СОХРАНИ ЕЁ.**

**ШАГ 3: Обнови Frontend (Магазин)**
Теперь возвращаемся в твой React проект (Магазин).
Нам нужно изменить функцию отправки заказа, чтобы она слала данные не в ссылку Телеграм, а на твой крутой сервер.

Открой файл `src/utils/telegram.ts` и замени функцию `sendOrderToSeller` на эту:

```typescript
// ТВОЯ НОВАЯ ССЫЛКА С RAILWAY
const BACKEND_URL = 'https://flower-backend-production.up.railway.app'; // <-- Вставь свою ссылку сюда!

export const sendOrderToSeller = async (
  cart: any[], 
  total: number, 
  clientData: any
) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cart,
        totalPrice: total,
        clientData
      }),
    });

    if (response.ok) {
      alert('Заказ успешно отправлен! Мы свяжемся с вами.');
      // Тут можно закрыть приложение
      window.Telegram?.WebApp?.close();
    } else {
      alert('Ошибка сервера. Попробуйте позже.');
    }
  } catch (error) {
    console.error('Ошибка:', error);
    alert('Не удалось отправить заказ. Проверьте интернет.');
  }
};