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

const addUser = async ({ userId, userChatId }) => {
    await Promise.all([
        saddAsync(`${prefix}:users`, userId),
        setAsync(`${prefix}:${userId}`, userChatId)
    ])
    console.log(`${userId} => ${userChatId}`)
}

const getUsers = async () => {
    const userIds = await smembersAsync(`${prefix}:users`)

    const users = []

    for (let userId of userIds) {
        const userChatId = await getAsync(`${prefix}:${userId}`)

        users.push({
            userId, userChatId
        })
    }

    return users
}

module.exports = { addUser, getUsers }