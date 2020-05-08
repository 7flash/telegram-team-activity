require('dotenv').config()
const redis = require('redis')
const { promisify } = require('util')

const port = process.env.REDIS_PORT
const prefix = process.env.REDIS_PREFIX

const redisClient = redis.createClient({ port })

const setAsync = promisify(redisClient.set).bind(redisClient)
const saddAsync = promisify(redisClient.sadd).bind(redisClient)
const getAsync = promisify(redisClient.get).bind(redisClient)
const smembersAsync = promisify(redisClient.smembers).bind(redisClient)

const addUser = async ({ userId, userChatId, userName }) => {
    const currentTime = Math.round(Date.now() / 1000)

    await Promise.all([
        saddAsync(`${prefix}:users`, userId),
        setAsync(`${prefix}:${userId}`, userChatId),
        setAsync(`${prefix}:${userId}:name`, userName),
        setAsync(`${prefix}:${userId}:response`, currentTime),
        setAsync(`${prefix}:${userId}:reminder`, 0),
    ])
    console.log(`${userName} => ${userChatId}`)
}

const getUsers = async () => {
    const userIds = await smembersAsync(`${prefix}:users`)

    const users = []

    for (let userId of userIds) {
        const chatId = await getAsync(`${prefix}:${userId}`)
        const responseTime = await getAsync(`${prefix}:${userId}:response`)
        const reminderTime = await getAsync(`${prefix}:${userId}:reminder`)
        const userName = await getAsync(`${prefix}:${userId}:name`)

        users.push({
            userId, chatId, responseTime, reminderTime, userName
        })
    }

    return users
}

const updateResponseTime = async (userId) => {
    const currentTime = Math.round(Date.now() / 1000)

    await setAsync(`${prefix}:${userId}:response`, currentTime)
}

const updateReminderTime = async ({ userId, currentTime }) => {
    await setAsync(`${prefix}:${userId}:reminder`, currentTime)
}

module.exports = { addUser, getUsers, updateResponseTime, updateReminderTime }