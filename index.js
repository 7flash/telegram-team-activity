require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api')
const { formatDistanceToNow } = require('date-fns')
const redisClient = require('./redisClient')
const quotes = require('./quotes.json')
const questions = require('./questions.json')

const token = process.env.BOT_TOKEN
const teamChannelId = process.env.CHANNEL_ID

const bot = new TelegramBot(token, { polling: true })

const millisecondsInHour = 1000 * 1000
const numberOfQuotes = quotes.length
const numberOfQuestions = questions.length

const welcomeMessage = (username) => {
  return `Thanks for joining, ${username}!`
}

const answerMessage = (username, timeSpent) => {
  return `Well done, ${username}! Your achievement took ${timeSpent}`
}

const reminderMessage = (userName) => {
  const randomQuote = getRandomQuote()
  const randomQuestion = getRandomQuestion()
  const maybeQuoteAuthor = randomQuote.quoteAuthor ? `(${randomQuote.quoteAuthor})` : ''

  const reminderMessage = `
      ${randomQuote.quoteText} ${maybeQuoteAuthor}

      *${randomQuestion}, ${userName} ?*
  `

  return reminderMessage
}

const getRandomQuote = () => quotes[Math.floor(Math.random() * numberOfQuotes)]
const getRandomQuestion = () => questions[Math.floor(Math.random() * numberOfQuestions)]

const encodeCallbackQuery = (query) => {
  if (query['type'] == 'gratitude') {
    return `g:${query['currentScore']}`
  } else if (query['type'] == 'finish') {
    return `f:${query['messageDate']}:${query['channelMessageId']}`
  } else {
    throw new Error("cannot encode query (not supported type)")
  }
}

const decodeCallbackQuery = (encodedQuery) => {
  const query = encodedQuery.split(':')

  let type;

  if (query[0] == 'g') {
    type = 'gratitude'
  } else if (query[0] == 'f') {
    type = 'finish'
  }

  if (type == 'gratitude') {
    return {
      type: type,
      currentScore: query[1]
    }
  } else if (type == 'finish') {
    return {
      type: type,
      messageDate: query[1],
      channelMessageId: query[2]
    }
  } else {
    throw new Error("cannot decode query (not supported type)")
  }
}

const handleFinishCallback = (callbackQuery) => {
  const queryData = decodeCallbackQuery(callbackQuery.data)

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
  console.log(JSON.stringify(callbackQuery))

  const gratitudePrefix = '\ngratitude from '

  const fullMessage = callbackQuery.message.text
  const currentGratitudeGiver = callbackQuery.from.username

  const gratitudeSectionOffset = fullMessage.indexOf(gratitudePrefix)

  const gratitudeGivers = [
    ...callbackQuery.message.entities
      .filter(entity =>
        entity.type == 'mention' &&
        entity.offset > gratitudeSectionOffset &&
        gratitudeSectionOffset > 0
      )
      .map(entity =>
        fullMessage.substr(entity.offset, entity.length)
      ),
    `@${currentGratitudeGiver}`
  ].filter((v, i, a) => a.indexOf(v) === i)

  const messageWithoutGratitude =
    gratitudeSectionOffset == -1 ?
      fullMessage :
      fullMessage.substr(0, gratitudeSectionOffset)

  const updatedMessage = `
    ${messageWithoutGratitude}
    ${gratitudePrefix}
    ${gratitudeGivers.join(' ')}
  `

  const queryData = decodeCallbackQuery(callbackQuery.data)
  const channelMessageId = callbackQuery.message.message_id

  const previousScore = queryData.currentScore
  const newScore = previousScore + 1

  const gratitudeKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Thank you!',
            callback_data: encodeCallbackQuery({
              type: 'gratitude',
              currentScore: newScore
            })
          }
        ]
      ]
    }
  }

  bot.editMessageText(updatedMessage, {
    chat_id: teamChannelId,
    message_id: channelMessageId,
    // reply_markup: gratitudeKeyboard
  })
}


const shouldSendReminder = (lastReminderTime, lastResponseTime, currentTime) => {
  const noResponseTime = lastReminderTime - lastResponseTime

  const hasRespondedToLastReminder = noResponseTime < 0

  if (hasRespondedToLastReminder) {
    return true
  } else {
    const waitingTime = currentTime - lastReminderTime

    if (waitingTime >= noResponseTime) {
      return true;
    } else {
      return false;
    }

  }
}

const sendReminders = async () => {
  const users = await redisClient.getUsers()

  for (const user of users) {
    const { userId, chatId, userName, reminderTime, responseTime } = user

    const currentTime = Math.round(Date.now() / 1000)

    const isReminderTime = shouldSendReminder(reminderTime, responseTime, currentTime)

    if (isReminderTime) {
      console.log(`send reminder to ${userId}`)
      await redisClient.updateReminderTime({ userId, currentTime })
      await bot.sendMessage(chatId, reminderMessage(userName), { parse_mode: 'Markdown' })
    }
  }
}

const handleMessages = () => {
  bot.onText(/\/start/, (msg) => {
    const userChatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = `${msg.from.first_name} ${msg.from.last_name}`;

    bot.sendMessage(userChatId, welcomeMessage(userName));

    redisClient.addUser({ userId, userChatId, userName })
  });

  bot.onText(/./, async msg => {
    if (msg.text == '/start') return;

    const userChatId = msg.chat.id
    const userId = msg.from.id
    const messageWithStatus = `${msg.text} (in progress)`
    const messageWithStatusAndNickname = `@${msg.from.username} ${messageWithStatus}`

    const gratitudeKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Thank you!',
              callback_data: encodeCallbackQuery({
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

    const finishKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Finish Activity',
              callback_data: encodeCallbackQuery({
                type: 'finish',
                messageDate: msg.date,
                channelMessageId: channelMessageId,
              })
            }
          ]
        ]
      }
    }

    bot.sendMessage(
      userChatId,
      messageWithStatus,
      finishKeyboard
    )

    redisClient.updateResponseTime(userId)
  })

  bot.on('callback_query', (callbackQuery) => {
    const queryData = decodeCallbackQuery(callbackQuery.data)

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

async function main() {
  setInterval(sendReminders, millisecondsInHour)
  handleMessages()
}

main()