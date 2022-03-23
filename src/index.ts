// Built in modules
import * as fs from "fs"
import * as path from "path"

// Third party dependencies
import { Context, Telegraf } from 'telegraf'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import * as R from "ramda"
import * as mime from "mime-types"
const input = require("input")
import ngrok from "ngrok"

// Local modules
import * as constants from "./config/constants"
import * as database from "./utils/database"
import { downloadMedia } from "./utils/downloader"
import { getConfig } from './config/config'
import { getMessage } from "./utils/utils"
import { Download } from "./types"
import * as server from "./server"
import { Server } from "http"

// Globals
const downloads = new Map<string, Download>()

// Setup DB
database.serialize()

//Telegram client session
const config = getConfig()
const stringSession = new StringSession('')

if (!R.isNil(config.ip) && !R.isNil(config.port) && !R.isNil(config.dcId)) {
  stringSession.setDC(config.dcId, config.ip, config.port)
}
const client = new TelegramClient(stringSession, config.apiId, config.apiHash, { connectionRetries: 5 })

// Telegram bot
const bot = new Telegraf(config.botToken)

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
    let msg = "Downloads ⬇\n\n"
    for (const download of downloads.values()) {
      const progress = download.percentage == -1 ? "in progress" : `${download.percentage}%`
      msg += `${download.name} => ${progress}%\n\n`
    }
    ctx.reply(msg)
  } else {
    ctx.reply("No downloads in progress.")
  }
})

bot.command("/connect", async (ctx) => {
  if (!client.connected) {
    await startTgClient(ctx)
  } else {
    ctx.reply("Client already connected.")
  }
})

bot.command("/disconnect", async (ctx) => {
  if (client.connected) {
    await client.disconnect()
    ctx.reply("Client disconnected.")
  } else {
    ctx.reply("Client already disconnected.")
  }
})

// Configure events
// TODO: Add support to download direct uploads to bot
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
      const fileSize = ctx.message.document.file_size
      await downloadMedia(ctx, msg, downloads, filePath, fileSize)
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
    console.log("Starting PiBot!")
    bot.launch()
  } catch (error) {
    console.log("Error in launching bot", error);
  }
}

// Start client
const startTgClient = async (ctx: Context) => {
  try {
    ctx.reply("Connecting...")
    await client.start({
      phoneNumber: config.phoneNumber,
      password: async () => config.password,
      phoneCode: () => getTgCode(ctx),
      onError: (err) => console.log("Client error", err),
    });
    client.session.save()
    console.log('You should now be connected.')
    ctx.reply("Client is connected.")
  } catch (error) {
    console.log("Exception occurred while starting client", error)
    ctx.reply("Couldn't connect the client.")
  }
}

//TODO: Should we implement TG approach?
const getTgCode = (ctx: Context): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      switch (config.codeInputMode) {
        case "WEB": {
          const app = server.initServer(config.codeServerPort, async (appServer: Server, code: string) => {
            await ngrok.kill()
            await server.stopServer(appServer)
            resolve(code)
          })
          try {
            await ngrok.kill()
            const url = await ngrok.connect({
              addr: config.codeServerPort,
              onStatusChange: (status) => {
                console.log("Ngrok tunnel on", config.codeServerPort, status);
              }
            })
            ctx.reply(`Provide the 2FA code using this => ${url}.`)
          } catch (error) {
            console.log("Exception in starting ngrok", error);
            await ngrok.kill()
            await server.stopServer(app)
            reject("Error in ngrok")
          }
          break
        }
        default: {
          ctx.reply("Provide the 2FA code via cli.")
          resolve(await input.text("Code ?"))
        }
      }
    } catch (error) {
      console.log("Error occurred while fetching code using", config.codeInputMode, error);
      reject(error)
    }
  })
}

// Enable graceful stop
const stopPiBot = (reason?: string) => {
  return () => {
    if (!client.disconnected) client.disconnect()
    bot.stop(reason)
    ngrok.kill()
    database.instance.close();
    setTimeout(_ => process.exit(), 1000)
  }
}

process.once('SIGINT', stopPiBot('SIGINT'))

process.once('SIGTERM', stopPiBot('SIGTERM'))

process.on("beforeExit", stopPiBot('beforeExit'))

startPiBot()
