require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api')
const moment = require('moment')
const { format, formatDistance, formatDistanceToNow } = require('date-fns')

const token = process.env.BOT_TOKEN
const teamChannelId = process.env.CHANNEL_ID

const bot = new TelegramBot(token, { polling: true })

const welcomeMessage = (username) => {
  return `Hey ${username}! When starting working activity - just type your intention here and it will be broadcasted to team channel for coordination`  
}

const answerMessage = (username, timeSpent) => {
  return `Well done, ${username}! Your activity took ${timeSpent}`
}

const handleFinishCallback = (callbackQuery) => {
  const queryData = JSON.parse(callbackQuery.data)

  const userMessageDate = queryData.messageDate
  const channelMessageId = queryData.channelMessageId

  const userChatOpts = {
    chat_id: callbackQuery.message.chat.id,
    message_id: callbackQuery.message.message_id
  }

  const teamChannelOpts = {
    chat_id: teamChannelId,
    message_id: channelMessageId
  }

  const timeSpent = formatDistanceToNow(
    new Date(userMessageDate * 1000),
    { addSuffix: false }
  )

  const username = callbackQuery.from.username

  const messageWithStatus = callbackQuery.message.text
  const messageWithUserActivity = messageWithStatus.substr(0, messageWithStatus.indexOf("(in progress)"))
  const messageWithResult = `@${username} ${messageWithUserActivity} (spent ${timeSpent})`

  bot.answerCallbackQuery(
    callbackQuery.id,
    answerMessage(username, timeSpent)
  )

  bot.editMessageText(messageWithResult, userChatOpts)

  bot.editMessageText(messageWithResult, teamChannelOpts)  
}

const handleGratitudeCallback = (callbackQuery) => {
  const queryData = JSON.parse(callbackQuery.data)
  const inlineMessageId = callbackQuery.inline_message_id

  const previousScore = queryData.currentScore
  const newScore = previousScore + 1

  const gratitudeKeyboardWithResult = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `Thank you! (${newScore})`,
            callback_data: JSON.stringify({
              type: 'gratitude',
              currentScore: newScore
            })
          }
        ]
      ]
    }
  }

  bot.editMessageReplyMarkup(gratitudeKeyboardWithResult, {
    inline_message_id: inlineMessageId
  })
}

async function main() {
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, welcomeMessage(msg.from.username));
  });

  bot.onText(/./, async msg => {
    const userChatId = msg.chat.id
    const messageWithStatus = `${msg.text} (in progress)`
    const messageWithStatusAndNickname = `@${msg.from.username} ${messageWithStatus}`

    const gratitudeKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Thank you! 👍',
              callback_data: JSON.stringify({
                type: 'gratitude',
                currentScore: 0
              })
            }
          ]
        ]
      }
    }

    const channelMessage = await bot.sendMessage(
      teamChannelId,
      messageWithStatusAndNickname,
      gratitudeKeyboard
    )
    const channelMessageId = channelMessage.message_id

    const teamChannelOpts = {
      chat_id: teamChannelId,
      message_id: channelMessageId
    }  

    const finishKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Finish Activity',
              callback_data: JSON.stringify({
                type: 'finish',
                messageDate: msg.date,
                channelMessageId: channelMessageId,
              })
            }
          ]
        ]
      }
    }

    bot.editMessageReplyMarkup(gratitudeKeyboard, teamChannelOpts)

    bot.sendMessage(
      userChatId,
      messageWithStatus,
      finishKeyboard
    )
  })

  bot.on('callback_query', (callbackQuery) => {
    const queryData = JSON.parse(callbackQuery.data)

    if (queryData && queryData.type) {
      const type = queryData.type

      if (type == 'finish') {
        handleFinishCallback(callbackQuery);
      } else if (type == 'gratitude') {
        handleGratitudeCallback(callbackQuery);
      }
    }
  })

  bot.on("polling_error", (err) => console.log(err))
}

main()