// Built in modules
import * as fs from "fs"
import * as path from "path"

// Third party dependencies
import { Telegraf } from 'telegraf'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import * as R from "ramda"
import * as mime from "mime-types"
const input = require("input")

// Local modules
import * as constants from "./config/constants"
import * as database from "./utils/database"
import { downloadMedia } from "./utils/downloader"
import { getConfig } from './config/config'
import { getMessage } from "./utils/utils"

// Globals
const downloads = new Map<number, number>()
const botToken = process.env.TG_BOT_TOKEN

// Guard for bot token
if (R.isNil(botToken)) {
  process.exit(201)
}

// Setup DB
database.serialize()

//Telegram client session
const config = getConfig()
const stringSession = new StringSession('')
stringSession.setDC(config.dcId, config.ip, config.port)
const client = new TelegramClient(stringSession, config.apiId, config.apiHash, { connectionRetries: 5 })

// Telegram bot
const bot = new Telegraf(botToken)

// Middleware to log all messages
bot.use((ctx, next) => {
  console.log(JSON.stringify(ctx.message))
  next()
})

// Configure commands
bot.start((ctx) => ctx.reply(constants.welcomeMsg))
bot.help((ctx) => ctx.reply(constants.welcomeMsg))

bot.command("/done", async (ctx) => {
  if (!R.isNil(client) && !client.disconnected) {
    await client.disconnect()
    ctx.reply("Client disconnected.")
  } else {
    ctx.reply("Client not logged in.")
  }
})

bot.command("/downloads", (ctx) => {
  if (downloads.size > 0) {
    let msg = "Downloads:\n"
    for (const id of downloads.keys()) {
      msg += `${id} => ${downloads.get(id)}`
    }
    ctx.reply(msg)
  } else {
    ctx.reply("No downloads in progress.")
  }
})

// Configure events
bot.on("document", async (ctx) => {
  const msgId = ctx.message.message_id
  console.log("Fetching media via client", JSON.stringify(ctx.message));
  const orgMsgId = ctx.message.forward_from_message_id
  const orgChannelUserName = R.path(["username"], ctx.message.forward_from_chat) as string | undefined || ctx.message.forward_from?.username
  if (!R.isNil(orgMsgId) && !R.isNil(orgChannelUserName)) {
    const msg = await getMessage(client, orgChannelUserName, orgMsgId)
    if (!R.isNil(msg)) {
      const channelName = R.path(["title"], ctx.message.forward_from_chat) as string | undefined || ctx.message.forward_from?.first_name || "pi_media"
      const downloadPath = path.join(__dirname, "downloads", channelName)
      if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true })
      let extension: string = ''
      if (ctx.message.document.mime_type) {
        let ext = mime.extension(ctx.message.document.mime_type)
        extension = typeof ext == "string" ? ext : ''
      }
      const filePath = path.join(downloadPath, ctx.message.document.file_name || ctx.message.document.file_id + extension)
      await downloadMedia(ctx, msg, downloads, filePath)
    } else {
      console.log("Couldn't find the msg with id", orgMsgId, orgChannelUserName);
    }
  } else {
    console.log("Couldn't find msg details", msgId);
  }
})

// Start PiBot
const startPiBot = async () => {
  try {
    // Launch Bot
    console.log("Starting PiBot!")
    bot.launch()
    // Start client
    await client.start({
      phoneNumber: config.number,
      password: async () => config.password,
      phoneCode: async () => await input.text("Code?"),
      onError: (err) => console.log(err),
    });
    client.session.save()
    console.log('You should now be connected.')
  } catch (error) {
    console.log("Error in client init", error);
  }
}

// Enable graceful stop
const stopPiBot = (reason?: string) => {
  return () => {
    if (!client?.disconnected) client?.disconnect()
    bot.stop(reason)
    database.instance.close();
    setTimeout(_ => process.exit(), 1000)
  }
}

process.once('SIGINT', stopPiBot('SIGINT'))

process.once('SIGTERM', stopPiBot('SIGTERM'))

startPiBot()
